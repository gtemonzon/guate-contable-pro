-- Actualizar la función create_enterprise_with_user_link para incluir tenant_id
CREATE OR REPLACE FUNCTION public.create_enterprise_with_user_link(
  _nit text, 
  _business_name text, 
  _tax_regime text, 
  _base_currency_code text, 
  _is_active boolean, 
  _trade_name text DEFAULT NULL::text, 
  _address text DEFAULT NULL::text, 
  _phone text DEFAULT NULL::text, 
  _email text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _enterprise_id bigint;
  _enterprise_record jsonb;
  _user_tenant_id bigint;
BEGIN
  -- Get the tenant_id of the current user
  SELECT tenant_id INTO _user_tenant_id 
  FROM public.tab_users 
  WHERE id = auth.uid();

  IF _user_tenant_id IS NULL THEN
    RAISE EXCEPTION 'User does not have a tenant assigned';
  END IF;

  -- Insert the enterprise with the user's tenant_id
  INSERT INTO public.tab_enterprises (
    nit,
    business_name,
    trade_name,
    tax_regime,
    address,
    phone,
    email,
    base_currency_code,
    is_active,
    tenant_id
  )
  VALUES (
    _nit,
    _business_name,
    _trade_name,
    _tax_regime,
    _address,
    _phone,
    _email,
    _base_currency_code,
    _is_active,
    _user_tenant_id
  )
  RETURNING id INTO _enterprise_id;

  -- Link the user to the enterprise
  INSERT INTO public.tab_user_enterprises (
    user_id,
    enterprise_id,
    role
  )
  VALUES (
    auth.uid(),
    _enterprise_id,
    'enterprise_admin'
  );

  -- Get the enterprise record
  SELECT to_jsonb(tab_enterprises.*)
  INTO _enterprise_record
  FROM public.tab_enterprises
  WHERE id = _enterprise_id;

  RETURN _enterprise_record;
END;
$function$;