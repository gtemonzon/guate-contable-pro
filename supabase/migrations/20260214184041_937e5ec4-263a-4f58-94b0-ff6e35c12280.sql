
-- Backup History table
CREATE TABLE public.tab_backup_history (
  id bigserial PRIMARY KEY,
  enterprise_id bigint NOT NULL REFERENCES public.tab_enterprises(id),
  backup_type text NOT NULL CHECK (backup_type IN ('export', 'restore', 'clone')),
  file_name text NOT NULL,
  record_count integer NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tab_backup_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their enterprise backup history"
  ON public.tab_backup_history FOR SELECT
  USING (enterprise_id IN (
    SELECT enterprise_id FROM tab_user_enterprises WHERE user_id = auth.uid()
  ));

CREATE POLICY "Admins can insert backup history"
  ON public.tab_backup_history FOR INSERT
  WITH CHECK (
    is_super_admin(auth.uid()) OR
    EXISTS (
      SELECT 1 FROM tab_user_enterprises
      WHERE user_id = auth.uid()
        AND enterprise_id = tab_backup_history.enterprise_id
        AND role = 'enterprise_admin'
    )
  );

-- Integrity Validations table
CREATE TABLE public.tab_integrity_validations (
  id bigserial PRIMARY KEY,
  enterprise_id bigint NOT NULL REFERENCES public.tab_enterprises(id),
  period_id bigint REFERENCES public.tab_accounting_periods(id),
  run_by uuid NOT NULL,
  run_at timestamptz NOT NULL DEFAULT now(),
  total_errors integer NOT NULL DEFAULT 0,
  total_warnings integer NOT NULL DEFAULT 0,
  total_info integer NOT NULL DEFAULT 0,
  health_score numeric NOT NULL DEFAULT 100,
  results jsonb NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE public.tab_integrity_validations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their enterprise validations"
  ON public.tab_integrity_validations FOR SELECT
  USING (enterprise_id IN (
    SELECT enterprise_id FROM tab_user_enterprises WHERE user_id = auth.uid()
  ));

CREATE POLICY "Admins can insert validations"
  ON public.tab_integrity_validations FOR INSERT
  WITH CHECK (
    is_super_admin(auth.uid()) OR
    EXISTS (
      SELECT 1 FROM tab_user_enterprises
      WHERE user_id = auth.uid()
        AND enterprise_id = tab_integrity_validations.enterprise_id
        AND role IN ('enterprise_admin', 'contador_senior')
    )
  );

-- Integrity Rules Config table
CREATE TABLE public.tab_integrity_rules_config (
  id bigserial PRIMARY KEY,
  enterprise_id bigint NOT NULL REFERENCES public.tab_enterprises(id),
  rule_code text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  severity_override text CHECK (severity_override IN ('ERROR', 'WARNING', 'INFO')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(enterprise_id, rule_code)
);

ALTER TABLE public.tab_integrity_rules_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their enterprise rules config"
  ON public.tab_integrity_rules_config FOR SELECT
  USING (enterprise_id IN (
    SELECT enterprise_id FROM tab_user_enterprises WHERE user_id = auth.uid()
  ));

CREATE POLICY "Admins can manage rules config"
  ON public.tab_integrity_rules_config FOR ALL
  USING (
    is_super_admin(auth.uid()) OR
    EXISTS (
      SELECT 1 FROM tab_user_enterprises
      WHERE user_id = auth.uid()
        AND enterprise_id = tab_integrity_rules_config.enterprise_id
        AND role = 'enterprise_admin'
    )
  )
  WITH CHECK (
    is_super_admin(auth.uid()) OR
    EXISTS (
      SELECT 1 FROM tab_user_enterprises
      WHERE user_id = auth.uid()
        AND enterprise_id = tab_integrity_rules_config.enterprise_id
        AND role = 'enterprise_admin'
    )
  );

CREATE INDEX idx_backup_history_enterprise ON public.tab_backup_history(enterprise_id);
CREATE INDEX idx_integrity_validations_enterprise ON public.tab_integrity_validations(enterprise_id);
CREATE INDEX idx_integrity_rules_config_enterprise ON public.tab_integrity_rules_config(enterprise_id);
