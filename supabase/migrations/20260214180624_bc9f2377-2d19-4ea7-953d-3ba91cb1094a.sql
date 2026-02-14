
-- Create dashboard card config table
CREATE TABLE public.tab_dashboard_card_config (
  id BIGSERIAL PRIMARY KEY,
  enterprise_id BIGINT NOT NULL REFERENCES public.tab_enterprises(id),
  user_id UUID NOT NULL,
  visible_cards TEXT[] NOT NULL DEFAULT ARRAY[
    'total_activos', 'total_pasivos', 'utilidad_periodo', 'liquidez',
    'partidas_pendientes', 'saldos_bancarios', 'resumen_iva', 'proximos_vencimientos'
  ],
  card_order TEXT[] DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(enterprise_id, user_id)
);

-- Enable RLS
ALTER TABLE public.tab_dashboard_card_config ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can manage their own dashboard config
CREATE POLICY "Users can manage their own dashboard config"
  ON public.tab_dashboard_card_config FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Index for performance
CREATE INDEX idx_dashboard_card_config_enterprise_user
  ON public.tab_dashboard_card_config(enterprise_id, user_id);
