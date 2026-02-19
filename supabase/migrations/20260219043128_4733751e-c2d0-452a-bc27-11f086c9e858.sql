
-- =====================================================================
-- FIXED ASSETS & DEPRECIATION MODULE
-- =====================================================================

-- -----------------------------------------------------------------------
-- 1. DEPRECIATION POLICY (enterprise-level)
-- -----------------------------------------------------------------------
CREATE TABLE public.fixed_asset_policy (
  id                              BIGSERIAL PRIMARY KEY,
  enterprise_id                   BIGINT NOT NULL REFERENCES public.tab_enterprises(id),
  accounting_standard_mode        TEXT NOT NULL DEFAULT 'FISCAL' CHECK (accounting_standard_mode IN ('FISCAL', 'IFRS_POLICY')),
  depreciation_method             TEXT NOT NULL DEFAULT 'STRAIGHT_LINE' CHECK (depreciation_method IN ('STRAIGHT_LINE')),
  depreciation_start_rule         TEXT NOT NULL DEFAULT 'IN_SERVICE_DATE' CHECK (depreciation_start_rule IN ('IN_SERVICE_DATE', 'ACQUISITION_DATE')),
  posting_frequency               TEXT NOT NULL DEFAULT 'MONTHLY' CHECK (posting_frequency IN ('MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL')),
  rounding_decimals               INT NOT NULL DEFAULT 2,
  allow_mid_month_disposal_proration BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (enterprise_id)
);

ALTER TABLE public.fixed_asset_policy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fixed_asset_policy_select" ON public.fixed_asset_policy
  FOR SELECT USING (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY "fixed_asset_policy_insert" ON public.fixed_asset_policy
  FOR INSERT WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY "fixed_asset_policy_update" ON public.fixed_asset_policy
  FOR UPDATE USING (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

-- -----------------------------------------------------------------------
-- 2. FIXED ASSET CATEGORIES (enterprise-level catalog)
-- -----------------------------------------------------------------------
CREATE TABLE public.fixed_asset_categories (
  id                                    BIGSERIAL PRIMARY KEY,
  enterprise_id                         BIGINT NOT NULL REFERENCES public.tab_enterprises(id),
  code                                  TEXT NOT NULL,
  name                                  TEXT NOT NULL,
  default_useful_life_months            INT NOT NULL DEFAULT 60,
  default_residual_value                NUMERIC(18,2) NOT NULL DEFAULT 0,
  asset_account_id                      BIGINT REFERENCES public.tab_accounts(id),
  accumulated_depreciation_account_id  BIGINT REFERENCES public.tab_accounts(id),
  depreciation_expense_account_id      BIGINT REFERENCES public.tab_accounts(id),
  gain_loss_on_disposal_account_id     BIGINT REFERENCES public.tab_accounts(id),
  is_active                             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (enterprise_id, code)
);

ALTER TABLE public.fixed_asset_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fixed_asset_categories_select" ON public.fixed_asset_categories
  FOR SELECT USING (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY "fixed_asset_categories_insert" ON public.fixed_asset_categories
  FOR INSERT WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY "fixed_asset_categories_update" ON public.fixed_asset_categories
  FOR UPDATE USING (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY "fixed_asset_categories_delete" ON public.fixed_asset_categories
  FOR DELETE USING (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

-- -----------------------------------------------------------------------
-- 3. LOCATIONS CATALOG (enterprise-level)
-- -----------------------------------------------------------------------
CREATE TABLE public.fixed_asset_locations (
  id            BIGSERIAL PRIMARY KEY,
  enterprise_id BIGINT NOT NULL REFERENCES public.tab_enterprises(id),
  code          TEXT NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (enterprise_id, code)
);

ALTER TABLE public.fixed_asset_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fixed_asset_locations_select" ON public.fixed_asset_locations
  FOR SELECT USING (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY "fixed_asset_locations_insert" ON public.fixed_asset_locations
  FOR INSERT WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY "fixed_asset_locations_update" ON public.fixed_asset_locations
  FOR UPDATE USING (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY "fixed_asset_locations_delete" ON public.fixed_asset_locations
  FOR DELETE USING (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

-- -----------------------------------------------------------------------
-- 4. CUSTODIANS CATALOG (enterprise-level)
-- -----------------------------------------------------------------------
CREATE TABLE public.fixed_asset_custodians (
  id            BIGSERIAL PRIMARY KEY,
  enterprise_id BIGINT NOT NULL REFERENCES public.tab_enterprises(id),
  name          TEXT NOT NULL,
  identifier    TEXT,
  contact       TEXT,
  notes         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.fixed_asset_custodians ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fixed_asset_custodians_select" ON public.fixed_asset_custodians
  FOR SELECT USING (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY "fixed_asset_custodians_insert" ON public.fixed_asset_custodians
  FOR INSERT WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY "fixed_asset_custodians_update" ON public.fixed_asset_custodians
  FOR UPDATE USING (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY "fixed_asset_custodians_delete" ON public.fixed_asset_custodians
  FOR DELETE USING (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

-- -----------------------------------------------------------------------
-- 5. FIXED ASSET SUPPLIERS (enterprise-level)
-- -----------------------------------------------------------------------
CREATE TABLE public.fixed_asset_suppliers (
  id            BIGSERIAL PRIMARY KEY,
  enterprise_id BIGINT NOT NULL REFERENCES public.tab_enterprises(id),
  name          TEXT NOT NULL,
  tax_id        TEXT,
  address       TEXT,
  email         TEXT,
  phone         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.fixed_asset_suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fixed_asset_suppliers_select" ON public.fixed_asset_suppliers
  FOR SELECT USING (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY "fixed_asset_suppliers_insert" ON public.fixed_asset_suppliers
  FOR INSERT WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY "fixed_asset_suppliers_update" ON public.fixed_asset_suppliers
  FOR UPDATE USING (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY "fixed_asset_suppliers_delete" ON public.fixed_asset_suppliers
  FOR DELETE USING (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

-- -----------------------------------------------------------------------
-- 6. DISPOSAL REASONS CATALOG (global, read-only seeded)
-- -----------------------------------------------------------------------
CREATE TABLE public.fixed_asset_disposal_reasons (
  id    BIGSERIAL PRIMARY KEY,
  code  TEXT NOT NULL UNIQUE,
  name  TEXT NOT NULL
);

INSERT INTO public.fixed_asset_disposal_reasons (code, name) VALUES
  ('DETERIORATION', 'Deterioro / Fin de vida útil'),
  ('LOSS',          'Pérdida / Extravío'),
  ('SALE',          'Venta'),
  ('DONATION',      'Donación'),
  ('OTHER',         'Otro');

ALTER TABLE public.fixed_asset_disposal_reasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fixed_asset_disposal_reasons_select" ON public.fixed_asset_disposal_reasons
  FOR SELECT USING (TRUE);

-- -----------------------------------------------------------------------
-- 7. FIXED ASSETS MASTER TABLE
-- -----------------------------------------------------------------------
CREATE TABLE public.fixed_assets (
  id                      BIGSERIAL PRIMARY KEY,
  enterprise_id           BIGINT NOT NULL REFERENCES public.tab_enterprises(id),
  tenant_id               BIGINT NOT NULL,
  asset_code              TEXT NOT NULL,
  asset_name              TEXT NOT NULL,
  category_id             BIGINT NOT NULL REFERENCES public.fixed_asset_categories(id),
  location_id             BIGINT REFERENCES public.fixed_asset_locations(id),
  custodian_id            BIGINT REFERENCES public.fixed_asset_custodians(id),
  supplier_id             BIGINT REFERENCES public.fixed_asset_suppliers(id),
  cost_center             TEXT,
  acquisition_date        DATE NOT NULL,
  in_service_date         DATE,
  acquisition_cost        NUMERIC(18,2) NOT NULL,
  residual_value          NUMERIC(18,2) NOT NULL DEFAULT 0,
  useful_life_months      INT NOT NULL,
  currency                TEXT NOT NULL DEFAULT 'GTQ',
  purchase_reference_id   BIGINT,  -- optional link to purchase ledger row
  status                  TEXT NOT NULL DEFAULT 'DRAFT'
                          CHECK (status IN ('DRAFT', 'ACTIVE', 'DISPOSED', 'SOLD')),
  activated_at            TIMESTAMPTZ,
  activated_by            UUID,
  disposed_at             TIMESTAMPTZ,
  disposal_reason_id      BIGINT REFERENCES public.fixed_asset_disposal_reasons(id),
  disposal_proceeds       NUMERIC(18,2),
  disposal_je_id          BIGINT REFERENCES public.tab_journal_entries(id),
  notes                   TEXT,
  created_by              UUID NOT NULL DEFAULT auth.uid(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (enterprise_id, asset_code)
);

ALTER TABLE public.fixed_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fixed_assets_select" ON public.fixed_assets
  FOR SELECT USING (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY "fixed_assets_insert" ON public.fixed_assets
  FOR INSERT WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY "fixed_assets_update" ON public.fixed_assets
  FOR UPDATE USING (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY "fixed_assets_delete" ON public.fixed_assets
  FOR DELETE USING (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

-- -----------------------------------------------------------------------
-- 8. DEPRECIATION SCHEDULE
-- -----------------------------------------------------------------------
CREATE TABLE public.fixed_asset_depreciation_schedule (
  id                          BIGSERIAL PRIMARY KEY,
  asset_id                    BIGINT NOT NULL REFERENCES public.fixed_assets(id) ON DELETE CASCADE,
  enterprise_id               BIGINT NOT NULL REFERENCES public.tab_enterprises(id),
  year                        INT NOT NULL,
  month                       INT NOT NULL,
  planned_depreciation_amount NUMERIC(18,2) NOT NULL,
  posted_depreciation_amount  NUMERIC(18,2),
  accumulated_depreciation    NUMERIC(18,2) NOT NULL,
  net_book_value              NUMERIC(18,2) NOT NULL,
  status                      TEXT NOT NULL DEFAULT 'PLANNED'
                              CHECK (status IN ('PLANNED', 'POSTED', 'SKIPPED')),
  journal_entry_id            BIGINT REFERENCES public.tab_journal_entries(id),
  posting_run_id              TEXT,  -- batch run identifier
  posted_at                   TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (asset_id, year, month)
);

ALTER TABLE public.fixed_asset_depreciation_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "depreciation_schedule_select" ON public.fixed_asset_depreciation_schedule
  FOR SELECT USING (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY "depreciation_schedule_insert" ON public.fixed_asset_depreciation_schedule
  FOR INSERT WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY "depreciation_schedule_update" ON public.fixed_asset_depreciation_schedule
  FOR UPDATE USING (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

-- -----------------------------------------------------------------------
-- 9. ASSET EVENT LOG (append-only)
-- -----------------------------------------------------------------------
CREATE TABLE public.fixed_asset_event_log (
  id            BIGSERIAL PRIMARY KEY,
  asset_id      BIGINT NOT NULL REFERENCES public.fixed_assets(id),
  enterprise_id BIGINT NOT NULL REFERENCES public.tab_enterprises(id),
  event_type    TEXT NOT NULL,  -- CREATE, UPDATE, ACTIVATE, POST_DEPRECIATION, DISPOSE, SELL
  actor_user_id UUID,
  metadata_json JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.fixed_asset_event_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "asset_event_log_select" ON public.fixed_asset_event_log
  FOR SELECT USING (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY "asset_event_log_insert" ON public.fixed_asset_event_log
  FOR INSERT WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

-- Block UPDATE and DELETE on event log
CREATE OR REPLACE FUNCTION public.block_asset_event_log_mutations()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'fixed_asset_event_log is append-only. UPDATE and DELETE are not permitted.'
    USING ERRCODE = 'P0021';
END;
$$;

CREATE TRIGGER asset_event_log_no_update
  BEFORE UPDATE ON public.fixed_asset_event_log
  FOR EACH ROW EXECUTE FUNCTION public.block_asset_event_log_mutations();

CREATE TRIGGER asset_event_log_no_delete
  BEFORE DELETE ON public.fixed_asset_event_log
  FOR EACH ROW EXECUTE FUNCTION public.block_asset_event_log_mutations();

-- -----------------------------------------------------------------------
-- 10. INDEXES for performance
-- -----------------------------------------------------------------------
CREATE INDEX idx_fixed_assets_enterprise ON public.fixed_assets(enterprise_id);
CREATE INDEX idx_fixed_assets_category ON public.fixed_assets(category_id);
CREATE INDEX idx_fixed_assets_status ON public.fixed_assets(status);
CREATE INDEX idx_depreciation_schedule_asset ON public.fixed_asset_depreciation_schedule(asset_id);
CREATE INDEX idx_depreciation_schedule_enterprise_period ON public.fixed_asset_depreciation_schedule(enterprise_id, year, month);
CREATE INDEX idx_depreciation_schedule_status ON public.fixed_asset_depreciation_schedule(status);
CREATE INDEX idx_asset_event_log_asset ON public.fixed_asset_event_log(asset_id);

-- -----------------------------------------------------------------------
-- 11. RPC: Generate depreciation schedule for an asset
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_asset_depreciation_schedule(p_asset_id BIGINT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_asset           public.fixed_assets%ROWTYPE;
  v_policy          public.fixed_asset_policy%ROWTYPE;
  v_monthly_dep     NUMERIC(18,2);
  v_depreciable     NUMERIC(18,2);
  v_start_date      DATE;
  v_current_date    DATE;
  v_accum           NUMERIC(18,2) := 0;
  v_nbv             NUMERIC(18,2);
  v_month_count     INT := 0;
BEGIN
  -- Load asset
  SELECT * INTO v_asset FROM public.fixed_assets WHERE id = p_asset_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Asset % not found', p_asset_id; END IF;

  -- Load policy
  SELECT * INTO v_policy FROM public.fixed_asset_policy WHERE enterprise_id = v_asset.enterprise_id;

  -- Determine start date
  v_start_date := COALESCE(
    CASE WHEN v_policy.depreciation_start_rule = 'IN_SERVICE_DATE' THEN v_asset.in_service_date ELSE NULL END,
    v_asset.acquisition_date
  );

  -- Depreciable amount
  v_depreciable := v_asset.acquisition_cost - v_asset.residual_value;
  IF v_depreciable <= 0 THEN RETURN; END IF;

  -- Monthly depreciation (straight-line)
  v_monthly_dep := ROUND(v_depreciable / v_asset.useful_life_months, 2);

  -- Delete existing PLANNED rows (keep POSTED)
  DELETE FROM public.fixed_asset_depreciation_schedule
  WHERE asset_id = p_asset_id AND status = 'PLANNED';

  -- Generate schedule rows
  v_current_date := DATE_TRUNC('month', v_start_date);

  FOR i IN 1..v_asset.useful_life_months LOOP
    -- Last month: adjust for rounding
    IF i = v_asset.useful_life_months THEN
      v_monthly_dep := v_depreciable - v_accum;
    END IF;

    v_accum := v_accum + v_monthly_dep;
    v_nbv   := v_asset.acquisition_cost - v_accum;

    -- Only insert if not already POSTED
    IF NOT EXISTS (
      SELECT 1 FROM public.fixed_asset_depreciation_schedule
      WHERE asset_id = p_asset_id
        AND year  = EXTRACT(YEAR FROM v_current_date)
        AND month = EXTRACT(MONTH FROM v_current_date)
        AND status = 'POSTED'
    ) THEN
      INSERT INTO public.fixed_asset_depreciation_schedule
        (asset_id, enterprise_id, year, month, planned_depreciation_amount, accumulated_depreciation, net_book_value, status)
      VALUES (
        p_asset_id, v_asset.enterprise_id,
        EXTRACT(YEAR FROM v_current_date), EXTRACT(MONTH FROM v_current_date),
        v_monthly_dep, v_accum, v_nbv, 'PLANNED'
      )
      ON CONFLICT (asset_id, year, month) DO UPDATE SET
        planned_depreciation_amount = EXCLUDED.planned_depreciation_amount,
        accumulated_depreciation    = EXCLUDED.accumulated_depreciation,
        net_book_value              = EXCLUDED.net_book_value;
    END IF;

    v_current_date := v_current_date + INTERVAL '1 month';
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------
-- 12. RPC: Get depreciation schedule report
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_asset_depreciation_summary(
  p_enterprise_id BIGINT,
  p_as_of_date    DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  asset_id                BIGINT,
  asset_code              TEXT,
  asset_name              TEXT,
  category_name           TEXT,
  acquisition_cost        NUMERIC,
  residual_value          NUMERIC,
  useful_life_months      INT,
  acquisition_date        DATE,
  in_service_date         DATE,
  status                  TEXT,
  accumulated_depreciation NUMERIC,
  net_book_value          NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    a.id,
    a.asset_code,
    a.asset_name,
    c.name AS category_name,
    a.acquisition_cost,
    a.residual_value,
    a.useful_life_months,
    a.acquisition_date,
    a.in_service_date,
    a.status,
    COALESCE((
      SELECT SUM(s.planned_depreciation_amount)
      FROM public.fixed_asset_depreciation_schedule s
      WHERE s.asset_id = a.id
        AND (s.year < EXTRACT(YEAR FROM p_as_of_date)
             OR (s.year = EXTRACT(YEAR FROM p_as_of_date)
                 AND s.month <= EXTRACT(MONTH FROM p_as_of_date)))
    ), 0) AS accumulated_depreciation,
    a.acquisition_cost - COALESCE((
      SELECT SUM(s.planned_depreciation_amount)
      FROM public.fixed_asset_depreciation_schedule s
      WHERE s.asset_id = a.id
        AND (s.year < EXTRACT(YEAR FROM p_as_of_date)
             OR (s.year = EXTRACT(YEAR FROM p_as_of_date)
                 AND s.month <= EXTRACT(MONTH FROM p_as_of_date)))
    ), 0) AS net_book_value
  FROM public.fixed_assets a
  JOIN public.fixed_asset_categories c ON c.id = a.category_id
  WHERE a.enterprise_id = p_enterprise_id
    AND EXISTS (
      SELECT 1 FROM public.tab_user_enterprises ue
      WHERE ue.user_id = auth.uid() AND ue.enterprise_id = p_enterprise_id
      UNION ALL SELECT 1 WHERE public.is_super_admin(auth.uid())
    )
  ORDER BY a.asset_code
$$;
