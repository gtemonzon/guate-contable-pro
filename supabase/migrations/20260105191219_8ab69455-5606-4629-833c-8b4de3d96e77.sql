-- Tabla de notificaciones del sistema
CREATE TABLE public.tab_notifications (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  enterprise_id BIGINT REFERENCES public.tab_enterprises(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  event_date DATE,
  priority TEXT NOT NULL DEFAULT 'informativa' CHECK (priority IN ('urgente', 'importante', 'informativa')),
  is_read BOOLEAN DEFAULT FALSE,
  action_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

-- Configuración de alertas por empresa
CREATE TABLE public.tab_alert_config (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  enterprise_id BIGINT REFERENCES public.tab_enterprises(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT TRUE,
  days_before INTEGER DEFAULT 5,
  send_email BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(enterprise_id, alert_type)
);

-- Configuración de fechas de vencimiento por tipo de impuesto
CREATE TABLE public.tab_tax_due_date_config (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  enterprise_id BIGINT REFERENCES public.tab_enterprises(id) ON DELETE CASCADE,
  tax_type TEXT NOT NULL,
  tax_label TEXT NOT NULL,
  calculation_type TEXT NOT NULL CHECK (calculation_type IN ('last_business_day', 'business_days_after', 'fixed_day')),
  days_value INTEGER DEFAULT 0,
  reference_period TEXT NOT NULL DEFAULT 'current_month' CHECK (reference_period IN ('current_month', 'next_month', 'quarter_end_next_month')),
  consider_holidays BOOLEAN DEFAULT TRUE,
  is_active BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(enterprise_id, tax_type)
);

-- Feriados oficiales
CREATE TABLE public.tab_holidays (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  enterprise_id BIGINT REFERENCES public.tab_enterprises(id) ON DELETE CASCADE,
  holiday_date DATE NOT NULL,
  description TEXT NOT NULL,
  is_recurring BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recordatorios personalizados
CREATE TABLE public.tab_custom_reminders (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  enterprise_id BIGINT REFERENCES public.tab_enterprises(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  reminder_date DATE NOT NULL,
  priority TEXT DEFAULT 'informativa' CHECK (priority IN ('urgente', 'importante', 'informativa')),
  is_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.tab_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tab_alert_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tab_tax_due_date_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tab_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tab_custom_reminders ENABLE ROW LEVEL SECURITY;

-- Políticas para tab_notifications
CREATE POLICY "Users can view notifications for their enterprises"
  ON public.tab_notifications FOR SELECT
  USING (
    enterprise_id IN (
      SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid()
    ) OR user_id = auth.uid() OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Users can update their own notifications"
  ON public.tab_notifications FOR UPDATE
  USING (
    enterprise_id IN (
      SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid()
    ) OR user_id = auth.uid() OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Admins can insert notifications"
  ON public.tab_notifications FOR INSERT
  WITH CHECK (
    enterprise_id IN (
      SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid()
    ) OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Admins can delete notifications"
  ON public.tab_notifications FOR DELETE
  USING (
    public.is_admin_for_enterprise(auth.uid(), enterprise_id) OR public.is_super_admin(auth.uid())
  );

-- Políticas para tab_alert_config
CREATE POLICY "Users can view alert config for their enterprises"
  ON public.tab_alert_config FOR SELECT
  USING (
    enterprise_id IN (
      SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid()
    ) OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Admins can manage alert config"
  ON public.tab_alert_config FOR ALL
  USING (
    public.is_admin_for_enterprise(auth.uid(), enterprise_id) OR public.is_super_admin(auth.uid())
  );

-- Políticas para tab_tax_due_date_config
CREATE POLICY "Users can view tax due date config"
  ON public.tab_tax_due_date_config FOR SELECT
  USING (
    enterprise_id IN (
      SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid()
    ) OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Admins can manage tax due date config"
  ON public.tab_tax_due_date_config FOR ALL
  USING (
    public.is_admin_for_enterprise(auth.uid(), enterprise_id) OR public.is_super_admin(auth.uid())
  );

-- Políticas para tab_holidays
CREATE POLICY "Users can view holidays"
  ON public.tab_holidays FOR SELECT
  USING (
    enterprise_id IS NULL OR
    enterprise_id IN (
      SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid()
    ) OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Admins can manage holidays"
  ON public.tab_holidays FOR ALL
  USING (
    enterprise_id IS NULL OR
    public.is_admin_for_enterprise(auth.uid(), enterprise_id) OR public.is_super_admin(auth.uid())
  );

-- Políticas para tab_custom_reminders
CREATE POLICY "Users can view their reminders"
  ON public.tab_custom_reminders FOR SELECT
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));

CREATE POLICY "Users can manage their reminders"
  ON public.tab_custom_reminders FOR ALL
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));

-- Insertar feriados de Guatemala por defecto (2025)
INSERT INTO public.tab_holidays (enterprise_id, holiday_date, description, is_recurring) VALUES
(NULL, '2025-01-01', 'Año Nuevo', true),
(NULL, '2025-04-17', 'Jueves Santo', false),
(NULL, '2025-04-18', 'Viernes Santo', false),
(NULL, '2025-04-19', 'Sábado de Gloria', false),
(NULL, '2025-05-01', 'Día del Trabajo', true),
(NULL, '2025-06-30', 'Día del Ejército', true),
(NULL, '2025-09-15', 'Día de la Independencia', true),
(NULL, '2025-10-20', 'Día de la Revolución', true),
(NULL, '2025-11-01', 'Día de Todos los Santos', true),
(NULL, '2025-12-24', 'Nochebuena', true),
(NULL, '2025-12-25', 'Navidad', true),
(NULL, '2025-12-31', 'Fin de Año', true);

-- Insertar feriados 2026
INSERT INTO public.tab_holidays (enterprise_id, holiday_date, description, is_recurring) VALUES
(NULL, '2026-01-01', 'Año Nuevo', true),
(NULL, '2026-04-02', 'Jueves Santo', false),
(NULL, '2026-04-03', 'Viernes Santo', false),
(NULL, '2026-04-04', 'Sábado de Gloria', false),
(NULL, '2026-05-01', 'Día del Trabajo', true),
(NULL, '2026-06-30', 'Día del Ejército', true),
(NULL, '2026-09-15', 'Día de la Independencia', true),
(NULL, '2026-10-20', 'Día de la Revolución', true),
(NULL, '2026-11-01', 'Día de Todos los Santos', true),
(NULL, '2026-12-24', 'Nochebuena', true),
(NULL, '2026-12-25', 'Navidad', true),
(NULL, '2026-12-31', 'Fin de Año', true);