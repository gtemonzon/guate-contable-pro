
-- Auto-sync tab_bank_accounts from tab_accounts.is_bank_account
-- Backfill: create one tab_bank_accounts row per is_bank_account account that doesn't have one yet
INSERT INTO public.tab_bank_accounts (enterprise_id, account_id, bank_name, account_number, is_active, currency_code)
SELECT
  a.enterprise_id,
  a.id,
  COALESCE(NULLIF(TRIM(SPLIT_PART(a.account_name, 'Cta.', 1)), ''), a.account_name) AS bank_name,
  COALESCE(NULLIF(TRIM(SPLIT_PART(SPLIT_PART(a.account_name, 'Cta.', 2), 'Monetaria', 1)), ''), 'S/N') AS account_number,
  a.is_active,
  'GTQ'
FROM public.tab_accounts a
WHERE a.is_bank_account = true
  AND NOT EXISTS (
    SELECT 1 FROM public.tab_bank_accounts b WHERE b.account_id = a.id
  );

-- Trigger function: sync on insert/update of tab_accounts
CREATE OR REPLACE FUNCTION public.sync_bank_account_from_catalog()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_bank_account = true THEN
    -- Upsert: if exists, just reactivate; if not, create
    IF EXISTS (SELECT 1 FROM public.tab_bank_accounts WHERE account_id = NEW.id) THEN
      UPDATE public.tab_bank_accounts
        SET is_active = NEW.is_active
      WHERE account_id = NEW.id;
    ELSE
      INSERT INTO public.tab_bank_accounts (enterprise_id, account_id, bank_name, account_number, is_active, currency_code)
      VALUES (
        NEW.enterprise_id,
        NEW.id,
        COALESCE(NULLIF(TRIM(SPLIT_PART(NEW.account_name, 'Cta.', 1)), ''), NEW.account_name),
        COALESCE(NULLIF(TRIM(SPLIT_PART(SPLIT_PART(NEW.account_name, 'Cta.', 2), 'Monetaria', 1)), ''), 'S/N'),
        NEW.is_active,
        'GTQ'
      );
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.is_bank_account = true AND NEW.is_bank_account = false THEN
    -- Deactivate the bank account record (do not delete to preserve historical movements/reconciliations)
    UPDATE public.tab_bank_accounts SET is_active = false WHERE account_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_bank_account_from_catalog ON public.tab_accounts;
CREATE TRIGGER trg_sync_bank_account_from_catalog
AFTER INSERT OR UPDATE OF is_bank_account, is_active, account_name ON public.tab_accounts
FOR EACH ROW
EXECUTE FUNCTION public.sync_bank_account_from_catalog();
