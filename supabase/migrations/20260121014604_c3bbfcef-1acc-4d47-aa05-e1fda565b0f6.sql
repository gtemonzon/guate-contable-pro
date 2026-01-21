-- Update create_enterprise_with_user_link function to accept optional tenant_id parameter
CREATE OR REPLACE FUNCTION public.create_enterprise_with_user_link(
  _nit TEXT,
  _business_name TEXT,
  _tax_regime TEXT,
  _base_currency_code TEXT DEFAULT 'GTQ',
  _is_active BOOLEAN DEFAULT true,
  _trade_name TEXT DEFAULT NULL,
  _address TEXT DEFAULT NULL,
  _phone TEXT DEFAULT NULL,
  _email TEXT DEFAULT NULL,
  _tenant_id BIGINT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_user_tenant_id BIGINT;
  v_enterprise_id BIGINT;
  v_actual_tenant_id BIGINT;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;
  
  -- Get user's tenant_id
  SELECT tenant_id INTO v_user_tenant_id FROM tab_users WHERE id = v_user_id;
  
  -- Determine which tenant_id to use
  -- If _tenant_id is provided and user is super_admin, use _tenant_id
  -- Otherwise, use the user's own tenant_id
  IF _tenant_id IS NOT NULL AND is_super_admin(v_user_id) THEN
    v_actual_tenant_id := _tenant_id;
  ELSE
    v_actual_tenant_id := v_user_tenant_id;
  END IF;
  
  IF v_actual_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Could not determine tenant_id for enterprise';
  END IF;

  -- Insert the enterprise with tenant_id
  INSERT INTO tab_enterprises (
    nit, business_name, tax_regime, base_currency_code, 
    is_active, trade_name, address, phone, email, tenant_id
  ) VALUES (
    _nit, _business_name, _tax_regime, _base_currency_code,
    _is_active, _trade_name, _address, _phone, _email, v_actual_tenant_id
  ) RETURNING id INTO v_enterprise_id;

  -- Link user to enterprise with enterprise_admin role
  INSERT INTO tab_user_enterprises (user_id, enterprise_id, role)
  VALUES (v_user_id, v_enterprise_id, 'enterprise_admin');

  -- Initialize default permissions for the enterprise
  PERFORM initialize_default_permissions(v_enterprise_id);

  -- Return the created enterprise
  RETURN (
    SELECT row_to_json(e.*)
    FROM tab_enterprises e
    WHERE e.id = v_enterprise_id
  );
END;
$$;