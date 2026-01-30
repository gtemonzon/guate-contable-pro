-- ===========================================
-- FASE 1: Columnas de Soft-Delete
-- ===========================================

-- Agregar columnas deleted_at y deleted_by a tablas críticas
ALTER TABLE tab_sales_ledger 
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_by UUID DEFAULT NULL;

ALTER TABLE tab_purchase_ledger 
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_by UUID DEFAULT NULL;

ALTER TABLE tab_journal_entries 
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_by UUID DEFAULT NULL;

ALTER TABLE tab_journal_entry_details 
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE tab_user_enterprises 
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE tab_accounts
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_by UUID DEFAULT NULL;

-- ===========================================
-- FASE 2: Función de Auditoría Genérica
-- ===========================================

CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_enterprise_id bigint;
  v_old_data jsonb;
  v_new_data jsonb;
  v_record_id bigint;
BEGIN
  -- Determinar enterprise_id según la tabla
  BEGIN
    IF TG_OP = 'DELETE' THEN
      v_enterprise_id := OLD.enterprise_id;
      v_record_id := OLD.id;
    ELSE
      v_enterprise_id := NEW.enterprise_id;
      v_record_id := NEW.id;
    END IF;
  EXCEPTION WHEN undefined_column THEN
    v_enterprise_id := NULL;
    IF TG_OP = 'DELETE' THEN
      v_record_id := OLD.id;
    ELSE
      v_record_id := NEW.id;
    END IF;
  END;

  -- Preparar datos según la operación
  IF TG_OP = 'DELETE' THEN
    v_old_data := to_jsonb(OLD);
    v_new_data := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_old_data := NULL;
    v_new_data := to_jsonb(NEW);
  ELSE -- UPDATE
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
  END IF;

  -- Insertar en audit log
  INSERT INTO tab_audit_log (
    enterprise_id,
    user_id,
    action,
    table_name,
    record_id,
    old_values,
    new_values
  ) VALUES (
    v_enterprise_id,
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    v_record_id,
    v_old_data,
    v_new_data
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- ===========================================
-- FASE 2: Triggers de Auditoría
-- ===========================================

-- Trigger para tab_enterprises
DROP TRIGGER IF EXISTS audit_enterprises ON tab_enterprises;
CREATE TRIGGER audit_enterprises
  AFTER INSERT OR UPDATE OR DELETE ON tab_enterprises
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Trigger para tab_users (especial: no tiene enterprise_id)
CREATE OR REPLACE FUNCTION audit_users_trigger_function()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_old_data jsonb;
  v_new_data jsonb;
  v_record_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old_data := to_jsonb(OLD);
    v_new_data := NULL;
    v_record_id := OLD.id;
  ELSIF TG_OP = 'INSERT' THEN
    v_old_data := NULL;
    v_new_data := to_jsonb(NEW);
    v_record_id := NEW.id;
  ELSE
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
    v_record_id := NEW.id;
  END IF;

  INSERT INTO tab_audit_log (
    enterprise_id,
    user_id,
    action,
    table_name,
    record_id,
    old_values,
    new_values
  ) VALUES (
    NULL,
    auth.uid(),
    TG_OP,
    'tab_users',
    NULL, -- users have UUID id, not bigint
    v_old_data,
    v_new_data
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_users ON tab_users;
CREATE TRIGGER audit_users
  AFTER INSERT OR UPDATE ON tab_users
  FOR EACH ROW EXECUTE FUNCTION audit_users_trigger_function();

-- Trigger para tab_accounts
DROP TRIGGER IF EXISTS audit_accounts ON tab_accounts;
CREATE TRIGGER audit_accounts
  AFTER INSERT OR UPDATE OR DELETE ON tab_accounts
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Trigger para tab_journal_entries
DROP TRIGGER IF EXISTS audit_journal_entries ON tab_journal_entries;
CREATE TRIGGER audit_journal_entries
  AFTER INSERT OR UPDATE OR DELETE ON tab_journal_entries
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Trigger para tab_sales_ledger
DROP TRIGGER IF EXISTS audit_sales_ledger ON tab_sales_ledger;
CREATE TRIGGER audit_sales_ledger
  AFTER INSERT OR UPDATE OR DELETE ON tab_sales_ledger
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Trigger para tab_purchase_ledger
DROP TRIGGER IF EXISTS audit_purchase_ledger ON tab_purchase_ledger;
CREATE TRIGGER audit_purchase_ledger
  AFTER INSERT OR UPDATE OR DELETE ON tab_purchase_ledger
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Trigger para tab_accounting_periods
DROP TRIGGER IF EXISTS audit_accounting_periods ON tab_accounting_periods;
CREATE TRIGGER audit_accounting_periods
  AFTER INSERT OR UPDATE OR DELETE ON tab_accounting_periods
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Trigger para tab_user_enterprises
DROP TRIGGER IF EXISTS audit_user_enterprises ON tab_user_enterprises;
CREATE TRIGGER audit_user_enterprises
  AFTER INSERT OR UPDATE OR DELETE ON tab_user_enterprises
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- ===========================================
-- FASE 2: Actualizar RLS de tab_audit_log
-- ===========================================

-- Eliminar política actual
DROP POLICY IF EXISTS "Super admins view audit logs" ON tab_audit_log;

-- Nueva política que incluye Tenant Admins
CREATE POLICY "Admins can view audit logs"
ON tab_audit_log FOR SELECT
USING (
  is_super_admin(auth.uid())
  OR (
    enterprise_id IN (
      SELECT e.id FROM tab_enterprises e
      WHERE is_tenant_admin_for(auth.uid(), e.tenant_id)
    )
  )
);

-- ===========================================
-- FASE 3: Función para verificar Tenant activo
-- ===========================================

CREATE OR REPLACE FUNCTION is_tenant_active(tenant_id_param bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT COALESCE(
    (SELECT is_active FROM tab_tenants WHERE id = tenant_id_param),
    false
  );
$$;