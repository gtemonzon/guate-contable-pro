-- Phase 1: Mixed-tax invoice support in Purchase Ledger
-- Add fields for exempt / non-VAT portion (tourism tax, fiscal stamps, electricity tax, other sector taxes)
-- IDP keeps its own column for backward compatibility with existing fuel logic and SAT imports.

ALTER TABLE public.tab_purchase_ledger
  ADD COLUMN IF NOT EXISTS exempt_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_category TEXT;

-- Constrain tax_category to a known set (NULL allowed = no extra tax)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tab_purchase_ledger_tax_category_check'
  ) THEN
    ALTER TABLE public.tab_purchase_ledger
      ADD CONSTRAINT tab_purchase_ledger_tax_category_check
      CHECK (tax_category IS NULL OR tax_category IN (
        'TOURISM_TAX',
        'IDP',
        'ELECTRICITY_TAX',
        'FISCAL_STAMP',
        'OTHER'
      ));
  END IF;
END$$;

COMMENT ON COLUMN public.tab_purchase_ledger.exempt_amount IS
  'Portion of invoice total NOT subject to VAT (e.g. tourism tax, fiscal stamps, electricity taxes, other sector taxes). Excludes IDP, which lives in idp_amount.';
COMMENT ON COLUMN public.tab_purchase_ledger.tax_category IS
  'Optional categorization of the exempt portion. Used by journal-entry generation to route to the configured tax expense account.';
