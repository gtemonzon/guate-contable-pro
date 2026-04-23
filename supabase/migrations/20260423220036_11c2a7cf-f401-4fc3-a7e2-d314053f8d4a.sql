
-- ============================================================
-- FASE 1: Cimientos multi-moneda
-- ============================================================

-- 1) Sembrar / normalizar catálogo de monedas
INSERT INTO public.tab_currencies (currency_code, currency_name, symbol, is_active)
VALUES
  ('GTQ', 'Quetzal guatemalteco', 'Q', true),
  ('USD', 'Dólar estadounidense', '$', true),
  ('EUR', 'Euro', '€', true),
  ('MXN', 'Peso mexicano', 'MX$', true),
  ('CRC', 'Colón costarricense', '₡', true),
  ('HNL', 'Lempira hondureña', 'L', true),
  ('COP', 'Peso colombiano', 'COL$', true)
ON CONFLICT DO NOTHING;

-- Garantizar unicidad por código
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='tab_currencies_code_unique'
  ) THEN
    CREATE UNIQUE INDEX tab_currencies_code_unique ON public.tab_currencies(currency_code);
  END IF;
END $$;

-- 2) Tabla de monedas habilitadas por empresa
CREATE TABLE IF NOT EXISTS public.tab_enterprise_currencies (
  id BIGSERIAL PRIMARY KEY,
  enterprise_id BIGINT NOT NULL,
  currency_code TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (enterprise_id, currency_code)
);

ALTER TABLE public.tab_enterprise_currencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS enterprise_currencies_select ON public.tab_enterprise_currencies;
CREATE POLICY enterprise_currencies_select
  ON public.tab_enterprise_currencies FOR SELECT
  USING (is_super_admin(auth.uid()) OR user_is_linked_to_enterprise(auth.uid(), enterprise_id));

DROP POLICY IF EXISTS enterprise_currencies_insert ON public.tab_enterprise_currencies;
CREATE POLICY enterprise_currencies_insert
  ON public.tab_enterprise_currencies FOR INSERT
  WITH CHECK (is_super_admin(auth.uid()) OR is_admin_for_enterprise(auth.uid(), enterprise_id));

DROP POLICY IF EXISTS enterprise_currencies_update ON public.tab_enterprise_currencies;
CREATE POLICY enterprise_currencies_update
  ON public.tab_enterprise_currencies FOR UPDATE
  USING (is_super_admin(auth.uid()) OR is_admin_for_enterprise(auth.uid(), enterprise_id));

DROP POLICY IF EXISTS enterprise_currencies_delete ON public.tab_enterprise_currencies;
CREATE POLICY enterprise_currencies_delete
  ON public.tab_enterprise_currencies FOR DELETE
  USING (is_super_admin(auth.uid()) OR is_admin_for_enterprise(auth.uid(), enterprise_id));

-- 3) Renombrar tabla legacy de exchange_rates (par-basada) y crear la nueva
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='tab_exchange_rates')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tab_exchange_rates' AND column_name='currency_code') THEN
    ALTER TABLE public.tab_exchange_rates RENAME TO tab_exchange_rates_legacy;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.tab_exchange_rates (
  id BIGSERIAL PRIMARY KEY,
  enterprise_id BIGINT NOT NULL,
  currency_code TEXT NOT NULL,
  year INTEGER NOT NULL CHECK (year BETWEEN 1900 AND 2200),
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  rate NUMERIC(18,6) NOT NULL CHECK (rate > 0),
  source TEXT,
  notes TEXT,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (enterprise_id, currency_code, year, month)
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_lookup
  ON public.tab_exchange_rates(enterprise_id, currency_code, year, month);

ALTER TABLE public.tab_exchange_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exchange_rates_select ON public.tab_exchange_rates;
CREATE POLICY exchange_rates_select
  ON public.tab_exchange_rates FOR SELECT
  USING (is_super_admin(auth.uid()) OR user_is_linked_to_enterprise(auth.uid(), enterprise_id));

DROP POLICY IF EXISTS exchange_rates_insert ON public.tab_exchange_rates;
CREATE POLICY exchange_rates_insert
  ON public.tab_exchange_rates FOR INSERT
  WITH CHECK (is_super_admin(auth.uid()) OR user_is_linked_to_enterprise(auth.uid(), enterprise_id));

DROP POLICY IF EXISTS exchange_rates_update ON public.tab_exchange_rates;
CREATE POLICY exchange_rates_update
  ON public.tab_exchange_rates FOR UPDATE
  USING (is_super_admin(auth.uid()) OR is_admin_for_enterprise(auth.uid(), enterprise_id));

DROP POLICY IF EXISTS exchange_rates_delete ON public.tab_exchange_rates;
CREATE POLICY exchange_rates_delete
  ON public.tab_exchange_rates FOR DELETE
  USING (is_super_admin(auth.uid()) OR is_admin_for_enterprise(auth.uid(), enterprise_id));

-- Trigger: validar moneda habilitada y no permitir moneda funcional (rate siempre 1 implícito)
CREATE OR REPLACE FUNCTION public.validate_exchange_rate_currency()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_code TEXT;
  enabled BOOLEAN;
BEGIN
  SELECT base_currency_code INTO base_code
    FROM public.tab_enterprises WHERE id = NEW.enterprise_id;

  IF NEW.currency_code = COALESCE(base_code,'GTQ') THEN
    RAISE EXCEPTION 'No se debe registrar tipo de cambio para la moneda funcional (%) — siempre es 1', NEW.currency_code;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.tab_enterprise_currencies
    WHERE enterprise_id = NEW.enterprise_id
      AND currency_code = NEW.currency_code
      AND is_active = true
  ) INTO enabled;

  IF NOT enabled THEN
    RAISE EXCEPTION 'La moneda % no está habilitada para esta empresa', NEW.currency_code;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_exchange_rate ON public.tab_exchange_rates;
CREATE TRIGGER trg_validate_exchange_rate
  BEFORE INSERT OR UPDATE ON public.tab_exchange_rates
  FOR EACH ROW EXECUTE FUNCTION public.validate_exchange_rate_currency();

-- 4) Funciones helper
CREATE OR REPLACE FUNCTION public.get_enterprise_functional_currency(_enterprise_id BIGINT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(base_currency_code, 'GTQ')
  FROM public.tab_enterprises WHERE id = _enterprise_id;
$$;

CREATE OR REPLACE FUNCTION public.get_exchange_rate(
  _enterprise_id BIGINT,
  _currency_code TEXT,
  _date DATE
) RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _currency_code = public.get_enterprise_functional_currency(_enterprise_id) THEN 1::numeric
    ELSE (
      SELECT rate FROM public.tab_exchange_rates
      WHERE enterprise_id = _enterprise_id
        AND currency_code = _currency_code
        AND year = EXTRACT(YEAR FROM _date)::int
        AND month = EXTRACT(MONTH FROM _date)::int
      LIMIT 1
    )
  END;
$$;

-- 5) Cuatro nuevas cuentas de diferencial cambiario en tab_enterprise_config
ALTER TABLE public.tab_enterprise_config
  ADD COLUMN IF NOT EXISTS realized_fx_gain_account_id BIGINT,
  ADD COLUMN IF NOT EXISTS realized_fx_loss_account_id BIGINT,
  ADD COLUMN IF NOT EXISTS unrealized_fx_gain_account_id BIGINT,
  ADD COLUMN IF NOT EXISTS unrealized_fx_loss_account_id BIGINT;

-- ============================================================
-- FASE 2: Columnas multi-moneda en tablas transaccionales
-- ============================================================

-- tab_journal_entries: ya tiene currency_id + exchange_rate. Agregamos currency_code para consistencia textual.
ALTER TABLE public.tab_journal_entries
  ADD COLUMN IF NOT EXISTS currency_code TEXT;

-- tab_journal_entry_details: montos originales por línea
ALTER TABLE public.tab_journal_entry_details
  ADD COLUMN IF NOT EXISTS currency_code TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,6) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS original_debit NUMERIC(18,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS original_credit NUMERIC(18,2) DEFAULT 0;

-- tab_purchase_ledger
ALTER TABLE public.tab_purchase_ledger
  ADD COLUMN IF NOT EXISTS currency_code TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,6) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS original_total NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS original_subtotal NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS original_vat NUMERIC(18,2);

-- tab_sales_ledger
ALTER TABLE public.tab_sales_ledger
  ADD COLUMN IF NOT EXISTS currency_code TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,6) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS original_total NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS original_subtotal NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS original_vat NUMERIC(18,2);

-- fixed_assets: ya tiene 'currency'. Agregamos rate y montos originales.
ALTER TABLE public.fixed_assets
  ADD COLUMN IF NOT EXISTS exchange_rate_at_acquisition NUMERIC(18,6) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS original_acquisition_cost NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS original_residual_value NUMERIC(18,2);

-- tab_bank_accounts: ya tiene currency_id. Agregar currency_code para uso directo.
ALTER TABLE public.tab_bank_accounts
  ADD COLUMN IF NOT EXISTS currency_code TEXT;

-- Backfill de currency_code en cuentas bancarias existentes
UPDATE public.tab_bank_accounts ba
SET currency_code = COALESCE(
  (SELECT c.currency_code FROM public.tab_currencies c WHERE c.id = ba.currency_id),
  (SELECT e.base_currency_code FROM public.tab_enterprises e WHERE e.id = ba.enterprise_id),
  'GTQ'
)
WHERE currency_code IS NULL;

-- Backfill general en partidas y libros usando moneda funcional
UPDATE public.tab_journal_entries je
SET currency_code = COALESCE(
  (SELECT c.currency_code FROM public.tab_currencies c WHERE c.id = je.currency_id),
  (SELECT e.base_currency_code FROM public.tab_enterprises e WHERE e.id = je.enterprise_id),
  'GTQ'
)
WHERE currency_code IS NULL;

UPDATE public.tab_journal_entry_details
SET original_debit = COALESCE(original_debit, debit_amount),
    original_credit = COALESCE(original_credit, credit_amount),
    exchange_rate = COALESCE(exchange_rate, 1)
WHERE original_debit IS NULL OR original_credit IS NULL;
