-- Tabla para guardar plantillas de mapeo de columnas
CREATE TABLE public.tab_bank_import_templates (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  enterprise_id BIGINT NOT NULL REFERENCES public.tab_enterprises(id) ON DELETE CASCADE,
  bank_account_id BIGINT REFERENCES public.tab_accounts(id) ON DELETE SET NULL,
  template_name TEXT NOT NULL,
  column_mapping JSONB NOT NULL,
  header_row INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice para búsqueda rápida por empresa
CREATE INDEX idx_bank_import_templates_enterprise ON public.tab_bank_import_templates(enterprise_id);

-- Agregar enterprise_id a tab_bank_movements si no existe
ALTER TABLE public.tab_bank_movements 
ADD COLUMN IF NOT EXISTS enterprise_id BIGINT REFERENCES public.tab_enterprises(id);

-- Crear índice para búsqueda por empresa en movimientos
CREATE INDEX IF NOT EXISTS idx_bank_movements_enterprise ON public.tab_bank_movements(enterprise_id);

-- Habilitar RLS
ALTER TABLE public.tab_bank_import_templates ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para tab_bank_import_templates
CREATE POLICY "Users can view templates for their enterprises"
ON public.tab_bank_import_templates
FOR SELECT
USING (
  enterprise_id IN (
    SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid()
  )
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "Users can create templates for their enterprises"
ON public.tab_bank_import_templates
FOR INSERT
WITH CHECK (
  enterprise_id IN (
    SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid()
  )
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "Users can update templates for their enterprises"
ON public.tab_bank_import_templates
FOR UPDATE
USING (
  enterprise_id IN (
    SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid()
  )
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "Users can delete templates for their enterprises"
ON public.tab_bank_import_templates
FOR DELETE
USING (
  enterprise_id IN (
    SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid()
  )
  OR public.is_super_admin(auth.uid())
);