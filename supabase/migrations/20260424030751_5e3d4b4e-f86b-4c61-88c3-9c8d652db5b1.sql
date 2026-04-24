-- =========================================================
-- 1. Add enterprise access guards to financial RPCs
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_account_balances_by_period(p_enterprise_id bigint, p_end_date date)
 RETURNS TABLE(account_id bigint, account_code text, account_name text, account_type text, balance_type text, total_debit numeric, total_credit numeric, balance numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH _access AS (
    SELECT 1
    WHERE public.is_super_admin(auth.uid())
       OR EXISTS (
         SELECT 1 FROM public.tab_user_enterprises ue
         WHERE ue.user_id = auth.uid()
           AND ue.enterprise_id = p_enterprise_id
       )
  )
  SELECT
    a.id                                            AS account_id,
    a.account_code,
    a.account_name,
    a.account_type,
    a.balance_type,
    COALESCE(SUM(d.debit_amount),  0)               AS total_debit,
    COALESCE(SUM(d.credit_amount), 0)               AS total_credit,
    CASE
      WHEN a.balance_type = 'deudor'
        OR a.account_type IN ('activo', 'gasto')
      THEN COALESCE(SUM(d.debit_amount), 0) - COALESCE(SUM(d.credit_amount), 0)
      ELSE COALESCE(SUM(d.credit_amount), 0) - COALESCE(SUM(d.debit_amount), 0)
    END                                             AS balance
  FROM public.tab_accounts a
  LEFT JOIN public.tab_journal_entry_details d
    ON d.account_id = a.id
    AND d.deleted_at IS NULL
  LEFT JOIN public.tab_journal_entries e
    ON e.id = d.journal_entry_id
    AND e.enterprise_id = p_enterprise_id
    AND e.entry_date    <= p_end_date
    AND e.deleted_at    IS NULL
    AND e.is_posted      = true
  WHERE a.enterprise_id = p_enterprise_id
    AND a.is_active     = true
    AND EXISTS (SELECT 1 FROM _access)
  GROUP BY a.id, a.account_code, a.account_name, a.account_type, a.balance_type
$function$;

CREATE OR REPLACE FUNCTION public.get_period_profit(p_enterprise_id bigint, p_start_date date, p_end_date date)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result numeric;
BEGIN
  IF NOT (
    public.is_super_admin(auth.uid()) OR
    EXISTS (SELECT 1 FROM public.tab_user_enterprises
            WHERE user_id = auth.uid() AND enterprise_id = p_enterprise_id)
  ) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    SUM(
      CASE a.account_type
        WHEN 'ingreso' THEN d.credit_amount - d.debit_amount
        WHEN 'gasto'   THEN d.debit_amount  - d.credit_amount
        ELSE 0
      END
    ), 0
  )
  INTO v_result
  FROM public.tab_journal_entry_details d
  JOIN public.tab_journal_entries e
    ON e.id = d.journal_entry_id
    AND e.enterprise_id = p_enterprise_id
    AND e.entry_date   >= p_start_date
    AND e.entry_date   <= p_end_date
    AND e.deleted_at   IS NULL
    AND e.is_posted     = true
    AND e.reversal_entry_id IS NULL
    AND e.reversed_by_entry_id IS NULL
  JOIN public.tab_accounts a
    ON a.id            = d.account_id
    AND a.enterprise_id = p_enterprise_id
    AND a.account_type IN ('ingreso', 'gasto')
  WHERE d.deleted_at IS NULL;

  RETURN v_result;
END;
$function$;

-- Preserve original return type (month_num, total, base_amount, vat_amount, record_count)
CREATE OR REPLACE FUNCTION public.get_monthly_ledger_summary(p_enterprise_id bigint, p_year integer, p_ledger text)
 RETURNS TABLE(month_num integer, total numeric, base_amount numeric, vat_amount numeric, record_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    public.is_super_admin(auth.uid()) OR
    EXISTS (SELECT 1 FROM public.tab_user_enterprises
            WHERE user_id = auth.uid() AND enterprise_id = p_enterprise_id)
  ) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  IF p_ledger = 'sales' THEN
    RETURN QUERY
      SELECT
        EXTRACT(MONTH FROM s.invoice_date)::INT         AS month_num,
        COALESCE(SUM(s.total_amount), 0)               AS total,
        COALESCE(SUM(s.net_amount),   0)               AS base_amount,
        COALESCE(SUM(s.vat_amount),   0)               AS vat_amount,
        COUNT(*)                                        AS record_count
      FROM public.tab_sales_ledger s
      WHERE s.enterprise_id = p_enterprise_id
        AND EXTRACT(YEAR FROM s.invoice_date) = p_year
        AND s.is_annulled = false
        AND s.deleted_at  IS NULL
      GROUP BY EXTRACT(MONTH FROM s.invoice_date);

  ELSIF p_ledger = 'purchases' THEN
    RETURN QUERY
      SELECT
        EXTRACT(MONTH FROM p.invoice_date)::INT         AS month_num,
        COALESCE(SUM(p.total_amount), 0)               AS total,
        COALESCE(SUM(p.net_amount),   0)               AS base_amount,
        COALESCE(SUM(p.vat_amount),   0)               AS vat_amount,
        COUNT(*)                                        AS record_count
      FROM public.tab_purchase_ledger p
      WHERE p.enterprise_id = p_enterprise_id
        AND EXTRACT(YEAR FROM p.invoice_date) = p_year
        AND p.deleted_at IS NULL
      GROUP BY EXTRACT(MONTH FROM p.invoice_date);
  END IF;
END;
$function$;

-- =========================================================
-- 2. Fix user_roles privilege escalation
-- =========================================================

DROP POLICY IF EXISTS "Super admins and enterprise admins can manage roles" ON public.user_roles;

CREATE POLICY "Enterprise admins manage non-admin roles in their enterprise"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  enterprise_id IS NOT NULL
  AND role NOT IN ('super_admin', 'enterprise_admin')
  AND public.is_admin_for_enterprise(auth.uid(), enterprise_id)
);

CREATE POLICY "Enterprise admins update non-admin roles in their enterprise"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  enterprise_id IS NOT NULL
  AND role NOT IN ('super_admin', 'enterprise_admin')
  AND public.is_admin_for_enterprise(auth.uid(), enterprise_id)
)
WITH CHECK (
  enterprise_id IS NOT NULL
  AND role NOT IN ('super_admin', 'enterprise_admin')
  AND public.is_admin_for_enterprise(auth.uid(), enterprise_id)
);

CREATE POLICY "Enterprise admins delete non-admin roles in their enterprise"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  enterprise_id IS NOT NULL
  AND role NOT IN ('super_admin', 'enterprise_admin')
  AND public.is_admin_for_enterprise(auth.uid(), enterprise_id)
);

-- =========================================================
-- 3. Remove sensitive tables from Realtime publication
-- =========================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='tab_users') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.tab_users;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='ticket_messages') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.ticket_messages;
  END IF;
END$$;

-- =========================================================
-- 4. Fix ticket-attachments storage policies + make private
-- =========================================================

UPDATE storage.buckets SET public = false WHERE id = 'ticket-attachments';

DROP POLICY IF EXISTS "Authenticated users can view ticket attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload ticket attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own ticket attachments" ON storage.objects;

CREATE POLICY "Users view ticket attachments in own tenant"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'ticket-attachments'
  AND EXISTS (
    SELECT 1
    FROM public.ticket_attachments ta
    JOIN public.ticket_messages tm ON tm.id = ta.ticket_message_id
    JOIN public.tickets t ON t.id = tm.ticket_id
    WHERE ta.file_url LIKE '%' || storage.objects.name
      AND (
        public.is_support_agent(auth.uid())
        OR t.tenant_id = public.get_user_tenant_id(auth.uid())
      )
  )
);

CREATE POLICY "Users upload ticket attachments to own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'ticket-attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users delete own ticket attachments"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'ticket-attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);