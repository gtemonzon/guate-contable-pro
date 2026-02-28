
-- Expand the exclusion list in both audit_trigger_function and audit_event_log_trigger
-- to suppress system-only noise at the DB level.

CREATE OR REPLACE FUNCTION public.audit_trigger_function()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  v_enterprise_id bigint;
  v_old_data jsonb;
  v_new_data jsonb;
  v_record_id bigint;
  v_excluded_columns text[] := ARRAY[
    'last_activity_at',
    'last_activity',
    'updated_at',
    'updated_by',
    'created_at',
    'created_by',
    'reviewed_at',
    'reviewed_by',
    'posted_at',
    'closed_at',
    'closed_by',
    'deleted_at',
    'deleted_by',
    'read_at',
    'uploaded_at',
    'uploaded_by',
    'current_enterprise_name',
    'modified_by',
    'user_modified'
  ];
  v_old_filtered jsonb;
  v_new_filtered jsonb;
  v_col text;
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
    
    -- Para UPDATE: filtrar columnas del sistema para comparación
    v_old_filtered := v_old_data;
    v_new_filtered := v_new_data;
    
    FOREACH v_col IN ARRAY v_excluded_columns
    LOOP
      v_old_filtered := v_old_filtered - v_col;
      v_new_filtered := v_new_filtered - v_col;
    END LOOP;
    
    -- Si después de filtrar las columnas del sistema no hay diferencia, no registrar
    IF v_old_filtered = v_new_filtered THEN
      RETURN NEW;
    END IF;
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
$function$;

-- Also expand the newer audit_event_log_trigger
CREATE OR REPLACE FUNCTION public.audit_event_log_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
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
    'closed_at','closed_by','deleted_at','deleted_by','read_at',
    'uploaded_at','uploaded_by',
    'modified_by','user_modified'
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
$function$;
