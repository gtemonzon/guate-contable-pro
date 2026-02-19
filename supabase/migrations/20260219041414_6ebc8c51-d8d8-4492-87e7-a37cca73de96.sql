
-- ============================================================
-- APPEND-ONLY AUDIT EVENT LOG
-- Tamper-evident log for accounting operations.
-- ============================================================

-- 1. Core table
CREATE TABLE IF NOT EXISTS public.audit_event_log (
  id              BIGSERIAL PRIMARY KEY,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_user_id   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  tenant_id       BIGINT,
  enterprise_id   BIGINT,
  entity_type     TEXT        NOT NULL,  -- e.g. 'journal_entry', 'account', 'period'
  entity_id       BIGINT,               -- PK of the affected row
  action          TEXT        NOT NULL,  -- INSERT | UPDATE | DELETE
  before_json     JSONB,
  after_json      JSONB,
  metadata_json   JSONB,                -- extra context (IP, user-agent, etc.)
  request_id      TEXT,                 -- caller-supplied idempotency key
  -- Row hash: SHA-256 of (prev_row_hash || entity_type || entity_id || action || after_json)
  prev_row_hash   TEXT,
  row_hash        TEXT
);

-- 2. Indexes for query performance
CREATE INDEX IF NOT EXISTS audit_event_log_enterprise_idx ON public.audit_event_log(enterprise_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_event_log_entity_idx    ON public.audit_event_log(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_event_log_actor_idx     ON public.audit_event_log(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_event_log_tenant_idx    ON public.audit_event_log(tenant_id, created_at DESC);

-- 3. Enable RLS
ALTER TABLE public.audit_event_log ENABLE ROW LEVEL SECURITY;

-- 4. RLS: only reads — no client UPDATE/DELETE/INSERT
CREATE POLICY "audit_event_log_select"
  ON public.audit_event_log
  FOR SELECT
  USING (
    is_super_admin(auth.uid())
    OR (
      enterprise_id IN (
        SELECT enterprise_id FROM public.tab_user_enterprises
        WHERE user_id = auth.uid()
      )
    )
  );

-- 5. Trigger to block UPDATE and DELETE (append-only enforcement)
CREATE OR REPLACE FUNCTION public.block_audit_event_log_mutations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'audit_event_log is append-only. UPDATE and DELETE are not permitted.'
    USING ERRCODE = 'P0020';
END;
$$;

CREATE TRIGGER trg_block_audit_event_log_update
  BEFORE UPDATE ON public.audit_event_log
  FOR EACH ROW EXECUTE FUNCTION public.block_audit_event_log_mutations();

CREATE TRIGGER trg_block_audit_event_log_delete
  BEFORE DELETE ON public.audit_event_log
  FOR EACH ROW EXECUTE FUNCTION public.block_audit_event_log_mutations();

-- 6. Core write function (SECURITY DEFINER — only path for inserting events)
--    Computes row_hash = sha256(prev_row_hash || entity_type || entity_id || action || coalesce(after_json,'null'))
CREATE OR REPLACE FUNCTION public.write_audit_event(
  p_actor_user_id UUID,
  p_tenant_id     BIGINT,
  p_enterprise_id BIGINT,
  p_entity_type   TEXT,
  p_entity_id     BIGINT,
  p_action        TEXT,
  p_before_json   JSONB DEFAULT NULL,
  p_after_json    JSONB DEFAULT NULL,
  p_metadata_json JSONB DEFAULT NULL,
  p_request_id    TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security TO 'off'
AS $$
DECLARE
  v_prev_hash TEXT;
  v_row_hash  TEXT;
  v_payload   TEXT;
BEGIN
  -- Get the most recent hash for this (tenant, enterprise, entity_type) chain
  SELECT row_hash INTO v_prev_hash
  FROM public.audit_event_log
  WHERE tenant_id    = p_tenant_id
    AND enterprise_id = p_enterprise_id
    AND entity_type  = p_entity_type
  ORDER BY id DESC
  LIMIT 1;

  -- Build payload and compute hash
  v_payload  := COALESCE(v_prev_hash, '')
             || p_entity_type
             || COALESCE(p_entity_id::text, '')
             || p_action
             || COALESCE(p_after_json::text, 'null');
  v_row_hash := encode(digest(v_payload, 'sha256'), 'hex');

  INSERT INTO public.audit_event_log (
    actor_user_id, tenant_id, enterprise_id,
    entity_type, entity_id, action,
    before_json, after_json, metadata_json, request_id,
    prev_row_hash, row_hash
  ) VALUES (
    p_actor_user_id, p_tenant_id, p_enterprise_id,
    p_entity_type, p_entity_id, p_action,
    p_before_json, p_after_json, p_metadata_json, p_request_id,
    v_prev_hash, v_row_hash
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.write_audit_event TO authenticated;

-- ============================================================
-- 7. Enable pgcrypto for sha256 (required for row_hash)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 8. Generic audit trigger function
--    Reads tenant_id via current_tenant_id() helper.
--    Skips noise columns (timestamps, audit fields).
-- ============================================================
CREATE OR REPLACE FUNCTION public.audit_event_log_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security TO 'off'
AS $$
DECLARE
  v_entity_type   TEXT;
  v_entity_id     BIGINT;
  v_enterprise_id BIGINT;
  v_tenant_id     BIGINT;
  v_before_json   JSONB;
  v_after_json    JSONB;
  v_action        TEXT;
  v_excluded      TEXT[] := ARRAY[
    'updated_at','updated_by','created_at','created_by',
    'posted_at','reviewed_at','reviewed_by',
    'last_activity_at','current_enterprise_name',
    'closed_at','closed_by','deleted_at','deleted_by','read_at'
  ];
  v_old_clean     JSONB;
  v_new_clean     JSONB;
  v_col           TEXT;
BEGIN
  v_action      := TG_OP;
  v_entity_type := TG_TABLE_NAME;

  -- Determine entity_id and enterprise_id
  IF TG_OP = 'DELETE' THEN
    BEGIN v_entity_id     := OLD.id; EXCEPTION WHEN undefined_column THEN v_entity_id := NULL; END;
    BEGIN v_enterprise_id := OLD.enterprise_id; EXCEPTION WHEN undefined_column THEN v_enterprise_id := NULL; END;
    v_before_json := to_jsonb(OLD);
    v_after_json  := NULL;
  ELSE
    BEGIN v_entity_id     := NEW.id; EXCEPTION WHEN undefined_column THEN v_entity_id := NULL; END;
    BEGIN v_enterprise_id := NEW.enterprise_id; EXCEPTION WHEN undefined_column THEN v_enterprise_id := NULL; END;
    v_after_json  := to_jsonb(NEW);
    v_before_json := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
  END IF;

  -- For UPDATE: skip if only noise columns changed
  IF TG_OP = 'UPDATE' THEN
    v_old_clean := to_jsonb(OLD);
    v_new_clean := to_jsonb(NEW);
    FOREACH v_col IN ARRAY v_excluded LOOP
      v_old_clean := v_old_clean - v_col;
      v_new_clean := v_new_clean - v_col;
    END LOOP;
    IF v_old_clean = v_new_clean THEN
      RETURN NEW;  -- nothing meaningful changed
    END IF;
  END IF;

  -- Resolve tenant_id
  IF v_enterprise_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant_id
    FROM public.tab_enterprises WHERE id = v_enterprise_id;
  ELSE
    v_tenant_id := public.current_tenant_id();
  END IF;

  PERFORM public.write_audit_event(
    auth.uid(),
    v_tenant_id,
    v_enterprise_id,
    v_entity_type,
    v_entity_id,
    v_action,
    v_before_json,
    v_after_json,
    NULL,
    NULL
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- 9. Attach triggers to key business tables
-- ============================================================

-- Journal entries (header)
DROP TRIGGER IF EXISTS trg_audit_journal_entries ON public.tab_journal_entries;
CREATE TRIGGER trg_audit_journal_entries
  AFTER INSERT OR UPDATE OR DELETE ON public.tab_journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.audit_event_log_trigger();

-- Journal entry lines
DROP TRIGGER IF EXISTS trg_audit_journal_details ON public.tab_journal_entry_details;
CREATE TRIGGER trg_audit_journal_details
  AFTER INSERT OR UPDATE OR DELETE ON public.tab_journal_entry_details
  FOR EACH ROW EXECUTE FUNCTION public.audit_event_log_trigger();

-- Chart of accounts
DROP TRIGGER IF EXISTS trg_audit_accounts ON public.tab_accounts;
CREATE TRIGGER trg_audit_accounts
  AFTER INSERT OR UPDATE OR DELETE ON public.tab_accounts
  FOR EACH ROW EXECUTE FUNCTION public.audit_event_log_trigger();

-- Accounting periods
DROP TRIGGER IF EXISTS trg_audit_periods ON public.tab_accounting_periods;
CREATE TRIGGER trg_audit_periods
  AFTER INSERT OR UPDATE OR DELETE ON public.tab_accounting_periods
  FOR EACH ROW EXECUTE FUNCTION public.audit_event_log_trigger();

-- Purchase ledger
DROP TRIGGER IF EXISTS trg_audit_purchase_ledger ON public.tab_purchase_ledger;
CREATE TRIGGER trg_audit_purchase_ledger
  AFTER INSERT OR UPDATE OR DELETE ON public.tab_purchase_ledger
  FOR EACH ROW EXECUTE FUNCTION public.audit_event_log_trigger();

-- Sales ledger
DROP TRIGGER IF EXISTS trg_audit_sales_ledger ON public.tab_sales_ledger;
CREATE TRIGGER trg_audit_sales_ledger
  AFTER INSERT OR UPDATE OR DELETE ON public.tab_sales_ledger
  FOR EACH ROW EXECUTE FUNCTION public.audit_event_log_trigger();

-- Purchase books
DROP TRIGGER IF EXISTS trg_audit_purchase_books ON public.tab_purchase_books;
CREATE TRIGGER trg_audit_purchase_books
  AFTER INSERT OR UPDATE OR DELETE ON public.tab_purchase_books
  FOR EACH ROW EXECUTE FUNCTION public.audit_event_log_trigger();

-- Enterprises
DROP TRIGGER IF EXISTS trg_audit_enterprises ON public.tab_enterprises;
CREATE TRIGGER trg_audit_enterprises
  AFTER INSERT OR UPDATE OR DELETE ON public.tab_enterprises
  FOR EACH ROW EXECUTE FUNCTION public.audit_event_log_trigger();

-- ============================================================
-- 10. Add audit_event_log to v_rls_coverage write-protected list
--     (it IS write-protected — clients can't INSERT directly)
-- ============================================================
-- Note: The v_rls_coverage view already handles audit_event_log via its
-- write_protected_tables CTE. audit_event_log is added automatically since
-- its RLS only has SELECT. No further migration needed.

-- ============================================================
-- 11. Function to verify hash chain integrity (audit tool)
-- ============================================================
CREATE OR REPLACE FUNCTION public.verify_audit_chain(
  p_enterprise_id BIGINT,
  p_entity_type   TEXT DEFAULT NULL
)
RETURNS TABLE(
  id            BIGINT,
  created_at    TIMESTAMPTZ,
  entity_type   TEXT,
  entity_id     BIGINT,
  action        TEXT,
  prev_row_hash TEXT,
  row_hash      TEXT,
  chain_valid   BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security TO 'off'
AS $$
  WITH ordered AS (
    SELECT
      a.id, a.created_at, a.entity_type, a.entity_id, a.action,
      a.prev_row_hash, a.row_hash, a.after_json,
      LAG(a.row_hash) OVER (
        PARTITION BY a.tenant_id, a.enterprise_id, a.entity_type
        ORDER BY a.id
      ) AS expected_prev
    FROM public.audit_event_log a
    WHERE a.enterprise_id = p_enterprise_id
      AND (p_entity_type IS NULL OR a.entity_type = p_entity_type)
  )
  SELECT
    o.id, o.created_at, o.entity_type, o.entity_id, o.action,
    o.prev_row_hash, o.row_hash,
    -- chain_valid: prev_row_hash matches previous row's row_hash (or NULL for first row)
    (o.prev_row_hash IS NOT DISTINCT FROM o.expected_prev) AS chain_valid
  FROM ordered o
  ORDER BY o.entity_type, o.id;
$$;

GRANT EXECUTE ON FUNCTION public.verify_audit_chain TO authenticated;
