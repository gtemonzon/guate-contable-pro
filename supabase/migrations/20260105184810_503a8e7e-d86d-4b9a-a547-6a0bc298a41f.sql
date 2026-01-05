-- Second migration: Create functions that use the new enum values
-- (These need the enum values to be committed first)

-- Create function to get user role for a specific enterprise
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID, _enterprise_id BIGINT)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles 
  WHERE user_id = _user_id 
  AND (enterprise_id = _enterprise_id OR enterprise_id IS NULL)
  ORDER BY 
    CASE role 
      WHEN 'super_admin' THEN 1
      WHEN 'enterprise_admin' THEN 2
      WHEN 'contador_senior' THEN 3
      WHEN 'auxiliar_contable' THEN 4
      WHEN 'cliente' THEN 5
      ELSE 6
    END
  LIMIT 1
$$;

-- Create function to check if user is admin (super_admin or enterprise_admin)
CREATE OR REPLACE FUNCTION public.is_admin_for_enterprise(_user_id UUID, _enterprise_id BIGINT)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _user_id 
    AND (enterprise_id = _enterprise_id OR enterprise_id IS NULL)
    AND role IN ('super_admin', 'enterprise_admin')
  ) OR public.is_super_admin(_user_id)
$$;

-- Create function to check if user can approve entries
CREATE OR REPLACE FUNCTION public.can_approve_entries(_user_id UUID, _enterprise_id BIGINT)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _user_id 
    AND (enterprise_id = _enterprise_id OR enterprise_id IS NULL)
    AND role IN ('super_admin', 'enterprise_admin', 'contador_senior')
  ) OR public.is_super_admin(_user_id)
$$;

-- Create function to check if user can post entries
CREATE OR REPLACE FUNCTION public.can_post_entries(_user_id UUID, _enterprise_id BIGINT)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _user_id 
    AND (enterprise_id = _enterprise_id OR enterprise_id IS NULL)
    AND role IN ('super_admin', 'enterprise_admin', 'contador_senior')
  ) OR public.is_super_admin(_user_id)
$$;