CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id BIGINT;
  v_is_tenant_admin BOOLEAN := false;
  v_is_active BOOLEAN := true;
BEGIN
  BEGIN
    v_tenant_id := NULLIF(NEW.raw_user_meta_data->>'tenant_id', '')::BIGINT;
  EXCEPTION WHEN OTHERS THEN
    v_tenant_id := NULL;
  END;

  BEGIN
    v_is_tenant_admin := COALESCE(NULLIF(NEW.raw_user_meta_data->>'is_tenant_admin', '')::BOOLEAN, false);
  EXCEPTION WHEN OTHERS THEN
    v_is_tenant_admin := false;
  END;

  BEGIN
    v_is_active := COALESCE(NULLIF(NEW.raw_user_meta_data->>'is_active', '')::BOOLEAN, true);
  EXCEPTION WHEN OTHERS THEN
    v_is_active := true;
  END;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No se pudo crear el usuario: falta la oficina contable asignada';
  END IF;

  INSERT INTO public.tab_users (
    id,
    email,
    full_name,
    is_super_admin,
    is_active,
    tenant_id,
    is_tenant_admin
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    false,
    v_is_active,
    v_tenant_id,
    v_is_tenant_admin
  );

  RETURN NEW;
END;
$$;