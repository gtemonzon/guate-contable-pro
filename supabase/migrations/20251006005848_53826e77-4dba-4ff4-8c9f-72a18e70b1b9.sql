-- Create app_role enum for proper RBAC
CREATE TYPE public.app_role AS ENUM ('super_admin', 'enterprise_admin', 'accountant', 'auditor', 'viewer');

-- Create user_roles table for proper role management
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  enterprise_id BIGINT REFERENCES tab_enterprises(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, role, enterprise_id)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function for role checks (prevents recursive RLS issues)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create helper function to check if user is super admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'super_admin'
  )
$$;

-- Migrate existing is_super_admin data to user_roles table
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin'::app_role
FROM public.tab_users
WHERE is_super_admin = true
ON CONFLICT (user_id, role, enterprise_id) DO NOTHING;

-- Enable RLS on tab_users
ALTER TABLE public.tab_users ENABLE ROW LEVEL SECURITY;

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
ON public.tab_users FOR SELECT
USING (id = auth.uid());

-- Super admins can view all users
CREATE POLICY "Super admins view all users"
ON public.tab_users FOR SELECT
USING (public.is_super_admin(auth.uid()));

-- Enable RLS on tab_audit_log
ALTER TABLE public.tab_audit_log ENABLE ROW LEVEL SECURITY;

-- Only super admins can view audit logs
CREATE POLICY "Super admins view audit logs"
ON public.tab_audit_log FOR SELECT
USING (public.is_super_admin(auth.uid()));

-- Enable RLS on tab_bank_movements
ALTER TABLE public.tab_bank_movements ENABLE ROW LEVEL SECURITY;

-- Enterprise users can manage their bank movements
CREATE POLICY "Enterprise bank movements"
ON public.tab_bank_movements FOR ALL
USING (
  bank_account_id IN (
    SELECT id FROM tab_bank_accounts
    WHERE enterprise_id IN (
      SELECT enterprise_id FROM tab_user_enterprises
      WHERE user_id = auth.uid()
    )
  )
);

-- Enable RLS on tab_bank_reconciliations
ALTER TABLE public.tab_bank_reconciliations ENABLE ROW LEVEL SECURITY;

-- Enterprise users can manage their bank reconciliations
CREATE POLICY "Enterprise reconciliations"
ON public.tab_bank_reconciliations FOR ALL
USING (
  bank_account_id IN (
    SELECT id FROM tab_bank_accounts
    WHERE enterprise_id IN (
      SELECT enterprise_id FROM tab_user_enterprises
      WHERE user_id = auth.uid()
    )
  )
);

-- Enable RLS on tab_currencies (read-only reference data)
ALTER TABLE public.tab_currencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read currencies"
ON public.tab_currencies FOR SELECT
USING (true);

-- Enable RLS on tab_exchange_rates
ALTER TABLE public.tab_exchange_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read exchange rates"
ON public.tab_exchange_rates FOR SELECT
USING (true);

CREATE POLICY "Super admins manage exchange rates"
ON public.tab_exchange_rates FOR INSERT
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins update exchange rates"
ON public.tab_exchange_rates FOR UPDATE
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins delete exchange rates"
ON public.tab_exchange_rates FOR DELETE
USING (public.is_super_admin(auth.uid()));

-- Add RLS policy for user_roles table itself
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Super admins manage all roles"
ON public.user_roles FOR ALL
USING (public.is_super_admin(auth.uid()));