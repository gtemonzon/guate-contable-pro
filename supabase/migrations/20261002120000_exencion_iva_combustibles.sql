-- Exenciones temporales de IVA/IDP en compras — Decreto 22-2026 (combustibles)
--
-- Decreto 22-2026: exención temporal de IVA e IDP en gasolina regular, superior y
-- diésel/gas oil, del 2026-10-01 al 2026-12-31. Las facturas FEL llegan con IVA 0.00
-- e IDP 0.00 y el total no cambia (base = total). El sistema calculaba 12% en captura
-- e importación y generaba crédito fiscal falso.
--
-- Contenido:
--   a) Tabla global tab_tax_exemption_rules (sin enterprise_id) + RLS + updated_at + auditoría.
--   b) Semilla COMBUSTIBLE_DEC_22_2026.
--   c) tab_purchase_ledger.vat_rate_applied y exemption_rule_code (FK a la regla).
--   d) get_active_tax_exemption(text, date).
--   e) Trigger trg_purchase_apply_tax_exemption (red de seguridad en la base).
--   f) REVOKE / GRANT con la firma exacta.
--
-- No cambia reportes ni la declaración de IVA (exento vs. gravado 0% queda pendiente
-- del reglamento). Se aplica manualmente vía MCP y se registra en
-- supabase_migrations.schema_migrations. Idempotente.

-- ─────────────────────────────────────────────────────────────────────────────
-- a) Reglas de exención (globales)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tab_tax_exemption_rules (
  id                  bigserial PRIMARY KEY,
  code                text NOT NULL UNIQUE,
  name                text NOT NULL,
  legal_reference     text,
  operation_type_code text NOT NULL,
  applies_to          text NOT NULL DEFAULT 'PURCHASE' CHECK (applies_to IN ('PURCHASE')),
  valid_from          date NOT NULL,
  valid_to            date NULL,
  vat_rate            numeric(5,4) NOT NULL DEFAULT 0,
  blocks_idp          boolean NOT NULL DEFAULT true,
  is_active           boolean NOT NULL DEFAULT true,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid DEFAULT auth.uid(),
  CONSTRAINT chk_tax_exemption_rules_dates CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE INDEX IF NOT EXISTS idx_tax_exemption_rules_lookup
  ON public.tab_tax_exemption_rules (operation_type_code, valid_from, valid_to)
  WHERE is_active;

DROP TRIGGER IF EXISTS update_tax_exemption_rules_updated_at ON public.tab_tax_exemption_rules;
CREATE TRIGGER update_tax_exemption_rules_updated_at
  BEFORE UPDATE ON public.tab_tax_exemption_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- audit_trigger_function NO exige enterprise_id: si la fila no tiene esa columna la
-- captura como NULL (bloque EXCEPTION WHEN undefined_column). Los cambios a reglas
-- fiscales quedan así en tab_audit_log con enterprise_id NULL.
DROP TRIGGER IF EXISTS audit_tax_exemption_rules ON public.tab_tax_exemption_rules;
CREATE TRIGGER audit_tax_exemption_rules
  AFTER INSERT OR UPDATE OR DELETE ON public.tab_tax_exemption_rules
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tab_tax_exemption_rules TO authenticated;
GRANT ALL ON public.tab_tax_exemption_rules TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.tab_tax_exemption_rules_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.tab_tax_exemption_rules_id_seq TO service_role;

ALTER TABLE public.tab_tax_exemption_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tax_exemption_rules_select ON public.tab_tax_exemption_rules;
CREATE POLICY tax_exemption_rules_select ON public.tab_tax_exemption_rules
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS tax_exemption_rules_insert ON public.tab_tax_exemption_rules;
CREATE POLICY tax_exemption_rules_insert ON public.tab_tax_exemption_rules
  FOR INSERT TO authenticated WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS tax_exemption_rules_update ON public.tab_tax_exemption_rules;
CREATE POLICY tax_exemption_rules_update ON public.tab_tax_exemption_rules
  FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS tax_exemption_rules_delete ON public.tab_tax_exemption_rules;
CREATE POLICY tax_exemption_rules_delete ON public.tab_tax_exemption_rules
  FOR DELETE TO authenticated USING (public.is_super_admin(auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- b) Semilla
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.tab_tax_exemption_rules (
  code, name, legal_reference, operation_type_code, applies_to,
  valid_from, valid_to, vat_rate, blocks_idp, is_active, notes
) VALUES (
  'COMBUSTIBLE_DEC_22_2026',
  'Exención temporal IVA/IDP combustibles',
  'Decreto 22-2026 (Diario de Centro América, 30/09/2026), Arts. 2, 3 y 6',
  'COMBUSTIBLE', 'PURCHASE',
  DATE '2026-10-01', DATE '2026-12-31', 0, true, true,
  'Gasolina regular, superior y diésel/gas oil: IVA e IDP 0. Alcohol carburante: solo IVA. Las facturas FEL llegan con IVA 0.00 e IDP 0.00; base = total.'
)
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- c) Sellos en el libro de compras
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.tab_purchase_ledger
  ADD COLUMN IF NOT EXISTS vat_rate_applied numeric(5,4) NULL;

ALTER TABLE public.tab_purchase_ledger
  ADD COLUMN IF NOT EXISTS exemption_rule_code text NULL
    REFERENCES public.tab_tax_exemption_rules(code) ON UPDATE CASCADE ON DELETE RESTRICT;

-- Para que el ON DELETE RESTRICT / ON UPDATE CASCADE no recorra todo el libro.
CREATE INDEX IF NOT EXISTS idx_purchase_ledger_exemption_rule_code
  ON public.tab_purchase_ledger (exemption_rule_code)
  WHERE exemption_rule_code IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- d) Regla activa para (código de tipo de operación, fecha)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_active_tax_exemption(p_operation_type_code text, p_date date)
RETURNS SETOF public.tab_tax_exemption_rules
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT r.*
    FROM public.tab_tax_exemption_rules r
   WHERE r.is_active
     AND r.applies_to = 'PURCHASE'
     AND upper(btrim(r.operation_type_code)) = upper(btrim(p_operation_type_code))
     AND p_date BETWEEN r.valid_from AND COALESCE(r.valid_to, 'infinity'::date)
   ORDER BY r.valid_from DESC
   LIMIT 1;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- e) Red de seguridad: BEFORE INSERT OR UPDATE en tab_purchase_ledger
--
-- Orden: los BEFORE triggers de una tabla se ejecutan en orden alfabético por
-- nombre. El único otro BEFORE trigger es check_purchase_invoice_date
-- (validate_purchase_invoice_date), que solo valida la fecha contra el libro y no
-- toca montos; corre antes que trg_purchase_apply_tax_exemption, así que la
-- validación ve la misma fecha y la exención se aplica sobre la fila ya validada.
-- No respeta app.import_mode a propósito: es una regla fiscal, no bitácora, y debe
-- aplicar también a importaciones de legado y del servidor.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_purchase_tax_exemption()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_op_code text;
  v_rule    public.tab_tax_exemption_rules%ROWTYPE;
BEGIN
  IF NEW.operation_type_id IS NOT NULL AND NEW.invoice_date IS NOT NULL THEN
    SELECT ot.code INTO v_op_code
      FROM public.tab_operation_types ot
     WHERE ot.id = NEW.operation_type_id;

    IF v_op_code IS NOT NULL THEN
      SELECT * INTO v_rule FROM public.get_active_tax_exemption(v_op_code, NEW.invoice_date);
    END IF;
  END IF;

  IF v_rule.code IS NOT NULL THEN
    NEW.vat_amount := 0;
    IF v_rule.blocks_idp AND NEW.tax_category = 'IDP' THEN
      NEW.exempt_amount := 0;
      NEW.tax_category  := NULL;
    END IF;
    NEW.base_amount := COALESCE(NEW.total_amount, 0) - COALESCE(NEW.exempt_amount, 0);
    -- net_amount es la base en todas las rutas de escritura del libro de compras;
    -- se mantiene igual para que nada que lea net_amount vea la base al 12%.
    NEW.net_amount := NEW.base_amount;
    -- Moneda extranjera: sin IVA también en los montos originales.
    IF NEW.original_vat IS NOT NULL THEN
      NEW.original_vat := 0;
      IF NEW.original_total IS NOT NULL THEN
        NEW.original_subtotal := round(
          NEW.original_total - COALESCE(NEW.exempt_amount, 0) / NULLIF(COALESCE(NEW.exchange_rate, 1), 0),
          2);
      END IF;
    END IF;
    NEW.vat_rate_applied    := v_rule.vat_rate;
    NEW.exemption_rule_code := v_rule.code;
  ELSIF NEW.exemption_rule_code IS NOT NULL OR NEW.vat_rate_applied IS NOT NULL THEN
    -- La regla dejó de aplicar (cambió la fecha o el tipo de operación, o se envió un
    -- sello sin regla vigente): se limpian los sellos. Los montos no se recalculan
    -- aquí; el cliente recalcula al 12%.
    NEW.vat_rate_applied    := NULL;
    NEW.exemption_rule_code := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_purchase_apply_tax_exemption ON public.tab_purchase_ledger;
CREATE TRIGGER trg_purchase_apply_tax_exemption
  BEFORE INSERT OR UPDATE ON public.tab_purchase_ledger
  FOR EACH ROW EXECUTE FUNCTION public.apply_purchase_tax_exemption();

-- ─────────────────────────────────────────────────────────────────────────────
-- f) Permisos (firma exacta)
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.get_active_tax_exemption(text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_active_tax_exemption(text, date) TO authenticated;

-- Las funciones de trigger nunca deben poder invocarse directamente (criterio de 20260824144148).
REVOKE ALL ON FUNCTION public.apply_purchase_tax_exemption() FROM PUBLIC, anon, authenticated;
