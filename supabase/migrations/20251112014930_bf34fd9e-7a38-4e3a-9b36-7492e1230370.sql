-- Función para crear una empresa y vincularla automáticamente al usuario
CREATE OR REPLACE FUNCTION public.create_enterprise_with_user_link(
  _nit text,
  _business_name text,
  _tax_regime text,
  _base_currency_code text,
  _is_active boolean,
  _trade_name text DEFAULT NULL,
  _address text DEFAULT NULL,
  _phone text DEFAULT NULL,
  _email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _enterprise_id bigint;
  _enterprise_record jsonb;
BEGIN
  -- Insert the enterprise
  INSERT INTO public.tab_enterprises (
    nit,
    business_name,
    trade_name,
    tax_regime,
    address,
    phone,
    email,
    base_currency_code,
    is_active
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
    _is_active
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
    'admin_empresa'
  );

  -- Get the enterprise record
  SELECT to_jsonb(tab_enterprises.*)
  INTO _enterprise_record
  FROM public.tab_enterprises
  WHERE id = _enterprise_id;

  RETURN _enterprise_record;
END;
$$;