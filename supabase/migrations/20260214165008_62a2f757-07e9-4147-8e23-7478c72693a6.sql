
-- Add new columns to tab_enterprise_config
ALTER TABLE public.tab_enterprise_config
  ADD COLUMN inventory_account_id bigint REFERENCES tab_accounts(id),
  ADD COLUMN cost_of_sales_method text DEFAULT 'manual',
  ADD COLUMN cost_of_sales_account_id bigint REFERENCES tab_accounts(id);

-- Migrate existing data
UPDATE public.tab_enterprise_config
SET inventory_account_id = initial_inventory_account_id
WHERE initial_inventory_account_id IS NOT NULL;

-- Create tab_period_inventory_closing table
CREATE TABLE public.tab_period_inventory_closing (
  id bigserial PRIMARY KEY,
  enterprise_id bigint NOT NULL REFERENCES tab_enterprises(id),
  accounting_period_id bigint NOT NULL REFERENCES tab_accounting_periods(id),
  initial_inventory_amount numeric(15,2) NOT NULL DEFAULT 0,
  purchases_amount numeric(15,2) NOT NULL DEFAULT 0,
  final_inventory_amount numeric(15,2),
  cost_of_sales_amount numeric(15,2),
  status text DEFAULT 'borrador',
  journal_entry_id bigint REFERENCES tab_journal_entries(id),
  calculated_at timestamptz DEFAULT now(),
  confirmed_at timestamptz,
  confirmed_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(enterprise_id, accounting_period_id)
);

-- Enable RLS
ALTER TABLE public.tab_period_inventory_closing ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view inventory closing for their enterprises"
  ON public.tab_period_inventory_closing FOR SELECT
  USING (enterprise_id IN (
    SELECT enterprise_id FROM tab_user_enterprises
    WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can insert inventory closing for their enterprises"
  ON public.tab_period_inventory_closing FOR INSERT
  WITH CHECK (enterprise_id IN (
    SELECT enterprise_id FROM tab_user_enterprises
    WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update inventory closing for their enterprises"
  ON public.tab_period_inventory_closing FOR UPDATE
  USING (enterprise_id IN (
    SELECT enterprise_id FROM tab_user_enterprises
    WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can delete inventory closing for their enterprises"
  ON public.tab_period_inventory_closing FOR DELETE
  USING (enterprise_id IN (
    SELECT enterprise_id FROM tab_user_enterprises
    WHERE user_id = auth.uid()
  ));

-- Indexes
CREATE INDEX idx_period_inventory_closing_enterprise
  ON public.tab_period_inventory_closing(enterprise_id);

CREATE INDEX idx_period_inventory_closing_period
  ON public.tab_period_inventory_closing(accounting_period_id);
