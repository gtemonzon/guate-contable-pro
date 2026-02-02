-- Update audit trigger function to ignore system-managed fields
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
    'current_enterprise_name'
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