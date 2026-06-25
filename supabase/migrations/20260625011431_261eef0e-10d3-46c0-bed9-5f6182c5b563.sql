
-- Batch 2: Unify Exempt + IDP into a single "No afecto" model

-- 1. Per-category account mapping on enterprise config
ALTER TABLE public.tab_enterprise_config
  ADD COLUMN IF NOT EXISTS account_non_vat_idp_id            bigint REFERENCES public.tab_accounts(id),
  ADD COLUMN IF NOT EXISTS account_non_vat_tourism_id        bigint REFERENCES public.tab_accounts(id),
  ADD COLUMN IF NOT EXISTS account_non_vat_electricity_id    bigint REFERENCES public.tab_accounts(id),
  ADD COLUMN IF NOT EXISTS account_non_vat_fiscal_stamp_id   bigint REFERENCES public.tab_accounts(id),
  ADD COLUMN IF NOT EXISTS account_non_vat_other_id          bigint REFERENCES public.tab_accounts(id);

COMMENT ON COLUMN public.tab_enterprise_config.account_non_vat_idp_id IS
  'Account used to post the Non-VAT portion of purchases with tax_category=IDP. If NULL, falls back to the invoice expense account.';
COMMENT ON COLUMN public.tab_enterprise_config.account_non_vat_tourism_id IS
  'Account for Non-VAT portion with tax_category=TOURISM_TAX. NULL → falls back to invoice expense account.';
COMMENT ON COLUMN public.tab_enterprise_config.account_non_vat_electricity_id IS
  'Account for Non-VAT portion with tax_category=ELECTRICITY_TAX. NULL → falls back to invoice expense account.';
COMMENT ON COLUMN public.tab_enterprise_config.account_non_vat_fiscal_stamp_id IS
  'Account for Non-VAT portion with tax_category=FISCAL_STAMP. NULL → falls back to invoice expense account.';
COMMENT ON COLUMN public.tab_enterprise_config.account_non_vat_other_id IS
  'Account for Non-VAT portion with tax_category=OTHER. NULL → falls back to invoice expense account.';

-- 2. Migrate IDP data into the unified exempt_amount + tax_category=IDP
--    Pre-check guaranteed no overlap. Update is idempotent: only rows that still hold idp_amount > 0
--    and have a NULL/zero exempt_amount get migrated.
UPDATE public.tab_purchase_ledger
SET exempt_amount = COALESCE(exempt_amount,0) + COALESCE(idp_amount,0),
    tax_category  = COALESCE(tax_category, 'IDP')
WHERE COALESCE(idp_amount,0) > 0
  AND COALESCE(exempt_amount,0) = 0;

-- 3. Mark idp_amount as LEGACY READ-ONLY at the documentation level
COMMENT ON COLUMN public.tab_purchase_ledger.idp_amount IS
  'LEGACY READ-ONLY (since 2026-06). Migrated to exempt_amount with tax_category=IDP. Kept for historical / rollback purposes only. Application code must not read or write this column.';

COMMENT ON COLUMN public.tab_purchase_ledger.exempt_amount IS
  'No afecto (Non-VAT portion of invoice total). Categorized by tax_category. Used by the centralized purchase accounting engine.';
COMMENT ON COLUMN public.tab_purchase_ledger.tax_category IS
  'Classification of the Non-VAT (exempt_amount) portion: TOURISM_TAX, IDP, ELECTRICITY_TAX, FISCAL_STAMP, OTHER. Determines which mapped account is used via tab_enterprise_config.account_non_vat_*_id.';
