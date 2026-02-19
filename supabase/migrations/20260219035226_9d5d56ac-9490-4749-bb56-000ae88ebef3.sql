
-- Security Hardening: Restrict public-readable reference tables to authenticated users only
-- These tables were accessible to unauthenticated users (qual = 'true')

-- 1. tab_currencies: restrict to authenticated users
DROP POLICY IF EXISTS "Anyone can read currencies" ON public.tab_currencies;
CREATE POLICY "Authenticated users can read currencies"
  ON public.tab_currencies
  FOR SELECT
  TO authenticated
  USING (true);

-- 2. tab_exchange_rates: restrict to authenticated users
DROP POLICY IF EXISTS "Anyone can read exchange rates" ON public.tab_exchange_rates;
CREATE POLICY "Authenticated users can read exchange rates"
  ON public.tab_exchange_rates
  FOR SELECT
  TO authenticated
  USING (true);

-- 3. tab_fel_document_types: restrict to authenticated users
DROP POLICY IF EXISTS "Anyone can view FEL document types" ON public.tab_fel_document_types;
CREATE POLICY "Authenticated users can view FEL document types"
  ON public.tab_fel_document_types
  FOR SELECT
  TO authenticated
  USING (true);

-- 4. tab_journal_entry_prefixes: restrict to authenticated users
DROP POLICY IF EXISTS "Anyone can view journal entry prefixes" ON public.tab_journal_entry_prefixes;
CREATE POLICY "Authenticated users can view journal entry prefixes"
  ON public.tab_journal_entry_prefixes
  FOR SELECT
  TO authenticated
  USING (true);

-- 5. tab_holidays: check and restrict public access
-- (identified in scan as publicly readable)
DROP POLICY IF EXISTS "Anyone can view holidays" ON public.tab_holidays;
DROP POLICY IF EXISTS "Public can view holidays" ON public.tab_holidays;
-- Add authenticated policy if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'tab_holidays' 
    AND cmd = 'SELECT'
  ) THEN
    EXECUTE 'CREATE POLICY "Authenticated users can view holidays"
      ON public.tab_holidays
      FOR SELECT
      TO authenticated
      USING (true)';
  END IF;
END $$;

-- 6. tab_operation_types: ensure unauthenticated access is closed
-- The scan noted enterprise_id IS NULL records were public
DROP POLICY IF EXISTS "Public can view system operation types" ON public.tab_operation_types;
DROP POLICY IF EXISTS "Anyone can view operation types" ON public.tab_operation_types;
