-- Integration regression. Run with psql -X -v ON_ERROR_STOP=1 -f this file.
-- Everything, including audit records and fixtures, rolls back.
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'a9dcb835-aa57-49dc-b605-afeeb1ac05a7', true);

DO $test$
DECLARE
  entry_id bigint;
  replacement_id bigint;
  result jsonb;
  original_number text := 'TEST-VOID-' || gen_random_uuid()::text;
  replacement_original text := 'TEST-VOID-' || gen_random_uuid()::text;
  replacement_number text := 'TEST-REPLACEMENT-' || gen_random_uuid()::text;
  document_id bigint;
  denied boolean := false;
BEGIN
  INSERT INTO public.tab_journal_entries (
    enterprise_id, entry_number, entry_date, entry_type, description,
    bank_account_id, bank_reference, bank_direction, accounting_period_id,
    status, is_posted, created_by
  ) VALUES (
    25, original_number, '2026-10-24', 'bancos', 'Monitoring regression (rolled back)',
    139, original_number, 'OUT', 5, 'borrador', false, auth.uid()
  ) RETURNING id INTO entry_id;

  INSERT INTO public.tab_journal_entry_details (
    journal_entry_id, line_number, account_id, description,
    debit_amount, credit_amount, bank_reference, is_bank_line
  ) VALUES (entry_id, 1, 139, 'Regression', 0, 1, original_number, true);

  result := public.void_bank_document(entry_id, '2026-10-24', 'Regression without replacement', false);
  document_id := (result->>'bank_document_id')::bigint;
  IF NOT EXISTS (
    SELECT 1 FROM public.tab_journal_entries
    WHERE id = entry_id AND bank_reference IS NULL AND status = 'borrador'
      AND NOT is_posted AND reversal_entry_id IS NULL
  ) THEN RAISE EXCEPTION 'No replacement must retain the draft without the voided reference'; END IF;
  IF EXISTS (SELECT 1 FROM public.tab_journal_entry_details WHERE journal_entry_id=entry_id AND bank_reference=original_number)
    THEN RAISE EXCEPTION 'Draft detail retained voided reference'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tab_bank_documents WHERE id=document_id AND document_number=original_number AND status='VOID' AND journal_entry_id IS NULL)
    THEN RAISE EXCEPTION 'Original voided number must stay reserved'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tab_audit_log WHERE record_id=document_id AND action='VOID_BANK_DOCUMENT')
    THEN RAISE EXCEPTION 'Void audit trail missing'; END IF;

  -- The retained draft can save with a different number.
  UPDATE public.tab_journal_entries SET bank_reference=replacement_number, updated_by=auth.uid() WHERE id=entry_id;
  IF NOT EXISTS (SELECT 1 FROM public.tab_journal_entries WHERE id=entry_id AND bank_reference=replacement_number)
    THEN RAISE EXCEPTION 'Retained draft cannot save a new reference'; END IF;

  INSERT INTO public.tab_journal_entries (
    enterprise_id, entry_number, entry_date, entry_type, description,
    bank_account_id, bank_reference, bank_direction, accounting_period_id,
    status, is_posted, created_by
  ) VALUES (
    25, replacement_original, '2026-10-24', 'bancos', 'Replacement regression (rolled back)',
    139, replacement_original, 'OUT', 5, 'borrador', false, auth.uid()
  ) RETURNING id INTO replacement_id;
  result := public.void_bank_document(replacement_id, '2026-10-24', 'Regression with replacement', true, NULL, replacement_number || '-2');
  IF (result->>'replacement_entry_id')::bigint IS DISTINCT FROM replacement_id
    OR NOT EXISTS (SELECT 1 FROM public.tab_journal_entries WHERE id=replacement_id AND bank_reference=replacement_number || '-2')
    THEN RAISE EXCEPTION 'Explicit replacement must still reuse the draft'; END IF;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    PERFORM public.void_bank_document(entry_id, '2026-10-24', 'Unauthorized regression', false);
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Unauthenticated void must be rejected'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tab_journal_entries WHERE id=entry_id AND bank_reference=replacement_number)
    THEN RAISE EXCEPTION 'Denied request modified draft'; END IF;
  RAISE NOTICE 'PASS: draft/no replacement, references, VOID reservation, audit, new reference save, explicit replacement, unauthorized rejection';
END;
$test$;
ROLLBACK;