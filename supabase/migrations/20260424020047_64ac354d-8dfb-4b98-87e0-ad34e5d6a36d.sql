-- ============================================================================
-- Diferencial Cambiario REALIZADO — Fase 4 (Parte 2)
-- Soporta: parcialidades, sugerencia automática, vínculo explícito factura↔partida
-- ============================================================================

-- 1) Tabla de saldos abiertos por factura en moneda extranjera
--    Una fila por factura (compra o venta) que aún tiene saldo pendiente en ME.
--    Se actualiza con cada liquidación parcial.
CREATE TABLE IF NOT EXISTS public.tab_fx_open_balances (
  id              BIGSERIAL PRIMARY KEY,
  enterprise_id   BIGINT NOT NULL REFERENCES public.tab_enterprises(id) ON DELETE CASCADE,
  invoice_type    TEXT   NOT NULL CHECK (invoice_type IN ('PURCHASE','SALE')),
  invoice_id      BIGINT NOT NULL,            -- FK lógica a tab_purchase_ledger.id o tab_sales_ledger.id
  invoice_date    DATE   NOT NULL,
  currency_code   TEXT   NOT NULL,
  original_total  NUMERIC(18,2) NOT NULL,     -- monto original en ME
  original_paid   NUMERIC(18,2) NOT NULL DEFAULT 0,
  original_open   NUMERIC(18,2) NOT NULL,     -- = original_total - original_paid
  registered_rate NUMERIC(18,6) NOT NULL,     -- tasa al registrar la factura
  fully_settled   BOOLEAN NOT NULL DEFAULT false,
  settled_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_fx_open_balance_invoice UNIQUE (invoice_type, invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_fx_open_balances_enterprise
  ON public.tab_fx_open_balances(enterprise_id, fully_settled, currency_code);

ALTER TABLE public.tab_fx_open_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY fx_open_balances_select ON public.tab_fx_open_balances
  FOR SELECT USING (
    is_super_admin(auth.uid()) OR user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY fx_open_balances_insert ON public.tab_fx_open_balances
  FOR INSERT WITH CHECK (
    is_super_admin(auth.uid()) OR user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY fx_open_balances_update ON public.tab_fx_open_balances
  FOR UPDATE USING (
    is_super_admin(auth.uid()) OR user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY fx_open_balances_delete ON public.tab_fx_open_balances
  FOR DELETE USING (
    is_super_admin(auth.uid()) OR is_admin_for_enterprise(auth.uid(), enterprise_id)
  );

-- 2) Tabla de liquidaciones (settlements): cada cobro/pago contra una factura ME
CREATE TABLE IF NOT EXISTS public.tab_fx_settlements (
  id                    BIGSERIAL PRIMARY KEY,
  enterprise_id         BIGINT NOT NULL REFERENCES public.tab_enterprises(id) ON DELETE CASCADE,
  open_balance_id       BIGINT NOT NULL REFERENCES public.tab_fx_open_balances(id) ON DELETE CASCADE,
  payment_journal_id    BIGINT NOT NULL,           -- partida de cobro/pago
  payment_date          DATE   NOT NULL,
  paid_original_amount  NUMERIC(18,2) NOT NULL,    -- monto liquidado en ME
  payment_rate          NUMERIC(18,6) NOT NULL,    -- tasa al pagar
  fx_difference         NUMERIC(18,2) NOT NULL,    -- diferencial en moneda funcional (+gain / -loss)
  difc_journal_id       BIGINT,                    -- partida DIFC-R generada (NULL si neto = 0)
  is_gain               BOOLEAN NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID DEFAULT auth.uid(),
  notes                 TEXT
);

CREATE INDEX IF NOT EXISTS idx_fx_settlements_enterprise
  ON public.tab_fx_settlements(enterprise_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_fx_settlements_open_balance
  ON public.tab_fx_settlements(open_balance_id);
CREATE INDEX IF NOT EXISTS idx_fx_settlements_payment_je
  ON public.tab_fx_settlements(payment_journal_id);

ALTER TABLE public.tab_fx_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY fx_settlements_select ON public.tab_fx_settlements
  FOR SELECT USING (
    is_super_admin(auth.uid()) OR user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY fx_settlements_insert ON public.tab_fx_settlements
  FOR INSERT WITH CHECK (
    is_super_admin(auth.uid()) OR user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

-- Las liquidaciones son inmutables (audit trail)
CREATE POLICY fx_settlements_no_update ON public.tab_fx_settlements
  FOR UPDATE USING (false);
CREATE POLICY fx_settlements_no_delete ON public.tab_fx_settlements
  FOR DELETE USING (is_super_admin(auth.uid()));

-- 3) Trigger: al crear una factura en ME (PURCHASE/SALE), generar fila en tab_fx_open_balances
CREATE OR REPLACE FUNCTION public.fn_register_fx_open_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_currency TEXT;
  v_invoice_type  TEXT;
BEGIN
  -- Determinar tipo según tabla disparadora
  IF TG_TABLE_NAME = 'tab_purchase_ledger' THEN
    v_invoice_type := 'PURCHASE';
  ELSIF TG_TABLE_NAME = 'tab_sales_ledger' THEN
    v_invoice_type := 'SALE';
  ELSE
    RETURN NEW;
  END IF;

  -- Solo procesar si es ME (currency != base)
  SELECT COALESCE(base_currency_code, 'GTQ') INTO v_base_currency
  FROM tab_enterprises WHERE id = NEW.enterprise_id;

  IF NEW.currency_code IS NULL
     OR NEW.currency_code = v_base_currency
     OR COALESCE(NEW.original_total, 0) = 0 THEN
    RETURN NEW;
  END IF;

  -- Insertar saldo abierto (idempotente por unique constraint)
  INSERT INTO tab_fx_open_balances (
    enterprise_id, invoice_type, invoice_id, invoice_date,
    currency_code, original_total, original_paid, original_open,
    registered_rate
  ) VALUES (
    NEW.enterprise_id, v_invoice_type, NEW.id, NEW.invoice_date,
    NEW.currency_code, NEW.original_total, 0, NEW.original_total,
    COALESCE(NEW.exchange_rate, 1)
  )
  ON CONFLICT (invoice_type, invoice_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_fx_open_balance ON public.tab_purchase_ledger;
CREATE TRIGGER trg_purchase_fx_open_balance
  AFTER INSERT ON public.tab_purchase_ledger
  FOR EACH ROW EXECUTE FUNCTION public.fn_register_fx_open_balance();

DROP TRIGGER IF EXISTS trg_sales_fx_open_balance ON public.tab_sales_ledger;
CREATE TRIGGER trg_sales_fx_open_balance
  AFTER INSERT ON public.tab_sales_ledger
  FOR EACH ROW EXECUTE FUNCTION public.fn_register_fx_open_balance();

-- 4) Backfill: poblar saldos abiertos para facturas históricas en ME que NO estén ya liquidadas
INSERT INTO tab_fx_open_balances (
  enterprise_id, invoice_type, invoice_id, invoice_date,
  currency_code, original_total, original_paid, original_open, registered_rate
)
SELECT pl.enterprise_id, 'PURCHASE', pl.id, pl.invoice_date,
       pl.currency_code, pl.original_total, 0, pl.original_total,
       COALESCE(pl.exchange_rate, 1)
FROM tab_purchase_ledger pl
JOIN tab_enterprises e ON e.id = pl.enterprise_id
WHERE pl.currency_code IS NOT NULL
  AND pl.currency_code <> COALESCE(e.base_currency_code, 'GTQ')
  AND COALESCE(pl.original_total, 0) > 0
ON CONFLICT (invoice_type, invoice_id) DO NOTHING;

INSERT INTO tab_fx_open_balances (
  enterprise_id, invoice_type, invoice_id, invoice_date,
  currency_code, original_total, original_paid, original_open, registered_rate
)
SELECT sl.enterprise_id, 'SALE', sl.id, sl.invoice_date,
       sl.currency_code, sl.original_total, 0, sl.original_total,
       COALESCE(sl.exchange_rate, 1)
FROM tab_sales_ledger sl
JOIN tab_enterprises e ON e.id = sl.enterprise_id
WHERE sl.currency_code IS NOT NULL
  AND sl.currency_code <> COALESCE(e.base_currency_code, 'GTQ')
  AND COALESCE(sl.original_total, 0) > 0
ON CONFLICT (invoice_type, invoice_id) DO NOTHING;

-- 5) Función RPC: aplicar una liquidación parcial o total
--    Calcula el diferencial cambiario REALIZADO y actualiza el saldo abierto.
--    Devuelve el cálculo para que el frontend genere la partida DIFC-R.
CREATE OR REPLACE FUNCTION public.calculate_fx_settlement(
  p_open_balance_id     BIGINT,
  p_paid_original       NUMERIC,
  p_payment_rate        NUMERIC,
  p_payment_date        DATE
)
RETURNS TABLE (
  open_balance_id    BIGINT,
  invoice_type       TEXT,
  invoice_id         BIGINT,
  currency_code      TEXT,
  registered_rate    NUMERIC,
  payment_rate       NUMERIC,
  paid_original      NUMERIC,
  fx_difference      NUMERIC,
  is_gain            BOOLEAN,
  remaining_open     NUMERIC,
  fully_settled      BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_diff NUMERIC;
  v_remaining NUMERIC;
  v_fully BOOLEAN;
BEGIN
  SELECT * INTO v_row FROM tab_fx_open_balances WHERE id = p_open_balance_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Open balance not found: %', p_open_balance_id;
  END IF;

  -- Validación de RLS: el usuario debe pertenecer a la empresa
  IF NOT (is_super_admin(auth.uid()) OR user_is_linked_to_enterprise(auth.uid(), v_row.enterprise_id)) THEN
    RAISE EXCEPTION 'Permission denied for enterprise %', v_row.enterprise_id;
  END IF;

  IF p_paid_original <= 0 THEN
    RAISE EXCEPTION 'paid_original must be > 0';
  END IF;

  IF p_paid_original > v_row.original_open + 0.01 THEN
    RAISE EXCEPTION 'paid_original (%) exceeds open balance (%)', p_paid_original, v_row.original_open;
  END IF;

  v_remaining := ROUND(v_row.original_open - p_paid_original, 2);
  v_fully := v_remaining <= 0.01;

  -- Cálculo del diferencial:
  -- COMPRAS: si tasa_pago > tasa_registro → pagamos más Q por la misma deuda en USD → PÉRDIDA
  -- VENTAS:  si tasa_pago > tasa_registro → recibimos más Q por el mismo cobro en USD → GANANCIA
  IF v_row.invoice_type = 'PURCHASE' THEN
    v_diff := ROUND(p_paid_original * (v_row.registered_rate - p_payment_rate), 2);
  ELSE
    v_diff := ROUND(p_paid_original * (p_payment_rate - v_row.registered_rate), 2);
  END IF;

  RETURN QUERY SELECT
    v_row.id,
    v_row.invoice_type,
    v_row.invoice_id,
    v_row.currency_code,
    v_row.registered_rate,
    p_payment_rate,
    p_paid_original,
    v_diff,
    (v_diff >= 0),
    v_remaining,
    v_fully;
END;
$$;

-- 6) Función RPC: registrar la liquidación (después de generar la partida DIFC-R en frontend)
CREATE OR REPLACE FUNCTION public.register_fx_settlement(
  p_open_balance_id     BIGINT,
  p_payment_journal_id  BIGINT,
  p_paid_original       NUMERIC,
  p_payment_rate        NUMERIC,
  p_payment_date        DATE,
  p_fx_difference       NUMERIC,
  p_difc_journal_id     BIGINT,
  p_notes               TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_settlement_id BIGINT;
  v_new_paid NUMERIC;
  v_new_open NUMERIC;
  v_fully BOOLEAN;
BEGIN
  SELECT * INTO v_row FROM tab_fx_open_balances WHERE id = p_open_balance_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Open balance not found: %', p_open_balance_id;
  END IF;

  IF NOT (is_super_admin(auth.uid()) OR user_is_linked_to_enterprise(auth.uid(), v_row.enterprise_id)) THEN
    RAISE EXCEPTION 'Permission denied for enterprise %', v_row.enterprise_id;
  END IF;

  v_new_paid := ROUND(v_row.original_paid + p_paid_original, 2);
  v_new_open := ROUND(v_row.original_total - v_new_paid, 2);
  v_fully := v_new_open <= 0.01;

  INSERT INTO tab_fx_settlements (
    enterprise_id, open_balance_id, payment_journal_id, payment_date,
    paid_original_amount, payment_rate, fx_difference, difc_journal_id,
    is_gain, notes
  ) VALUES (
    v_row.enterprise_id, p_open_balance_id, p_payment_journal_id, p_payment_date,
    p_paid_original, p_payment_rate, p_fx_difference, p_difc_journal_id,
    (p_fx_difference >= 0), p_notes
  )
  RETURNING id INTO v_settlement_id;

  UPDATE tab_fx_open_balances
  SET original_paid = v_new_paid,
      original_open = GREATEST(v_new_open, 0),
      fully_settled = v_fully,
      settled_at = CASE WHEN v_fully THEN now() ELSE NULL END,
      updated_at = now()
  WHERE id = p_open_balance_id;

  RETURN v_settlement_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_fx_settlement(BIGINT,NUMERIC,NUMERIC,DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_fx_settlement(BIGINT,BIGINT,NUMERIC,NUMERIC,DATE,NUMERIC,BIGINT,TEXT) TO authenticated;