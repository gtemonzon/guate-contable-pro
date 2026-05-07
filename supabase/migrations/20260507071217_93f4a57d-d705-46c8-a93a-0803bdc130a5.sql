
-- 1. Índice faltante que provoca seq scan en cada insert auditado
CREATE INDEX IF NOT EXISTS audit_event_log_lookup_idx
  ON public.audit_event_log (tenant_id, enterprise_id, entity_type, id DESC);

-- 2. Función de inserción masiva con bypass de auditoría
CREATE OR REPLACE FUNCTION public.bulk_insert_accounts(
  p_enterprise_id bigint,
  p_accounts jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inserted integer := 0;
BEGIN
  -- Activa modo import: triggers de auditoría devuelven NEW sin trabajo
  PERFORM set_config('app.import_mode', 'on', true);

  WITH src AS (
    SELECT
      (e->>'account_code')::text                          AS account_code,
      (e->>'account_name')::text                          AS account_name,
      (e->>'account_type')::text                          AS account_type,
      COALESCE((e->>'balance_type')::text, 'deudor')      AS balance_type,
      COALESCE((e->>'level')::int, 1)                     AS level,
      COALESCE((e->>'allows_movement')::boolean, true)    AS allows_movement,
      COALESCE((e->>'is_active')::boolean, true)          AS is_active,
      COALESCE((e->>'is_monetary')::boolean, false)       AS is_monetary,
      NULLIF(e->>'parent_code','')                        AS parent_code
    FROM jsonb_array_elements(p_accounts) e
  ),
  ins AS (
    INSERT INTO public.tab_accounts (
      enterprise_id, account_code, account_name, account_type,
      balance_type, level, allows_movement, is_active, is_monetary
    )
    SELECT
      p_enterprise_id, account_code, account_name, account_type,
      balance_type, level, allows_movement, is_active, is_monetary
    FROM src
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM ins;

  -- Resolver parent_account_id en una sola pasada (sin triggers pesados)
  UPDATE public.tab_accounts c
     SET parent_account_id = p.id
    FROM (
      SELECT
        (e->>'account_code')::text AS code,
        NULLIF(e->>'parent_code','') AS parent_code
      FROM jsonb_array_elements(p_accounts) e
    ) s
    JOIN public.tab_accounts p
      ON p.enterprise_id = p_enterprise_id
     AND p.account_code = s.parent_code
   WHERE c.enterprise_id = p_enterprise_id
     AND c.account_code = s.code
     AND s.parent_code IS NOT NULL;

  RETURN v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_insert_accounts(bigint, jsonb) TO authenticated, service_role;
