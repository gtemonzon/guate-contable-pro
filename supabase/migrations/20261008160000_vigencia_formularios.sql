-- Vigencia por fechas en la configuración de impuestos.
--
-- tab_enterprise_tax_config: formularios que ofrecen el Generador de Declaraciones y las
-- tarjetas del Dashboard (IVA_GENERAL, IVA_PEQUENO, ISR_MENSUAL, ISR_TRIMESTRAL,
-- ISO_TRIMESTRAL).
-- tab_tax_due_date_config: vencimientos y alertas.
--
-- Una configuración aplica a un período si is_active y el período se cruza con
-- [effective_from, effective_to]. NULL en un extremo = sin límite por ese lado, así que
-- las filas existentes (ambas columnas en NULL) se comportan igual que hoy.
-- Solo agrega columnas y una restricción de coherencia: no toca datos, políticas RLS ni
-- restricciones existentes.

ALTER TABLE public.tab_enterprise_tax_config
  ADD COLUMN IF NOT EXISTS effective_from date NULL,
  ADD COLUMN IF NOT EXISTS effective_to date NULL;

ALTER TABLE public.tab_enterprise_tax_config
  DROP CONSTRAINT IF EXISTS tab_enterprise_tax_config_effective_range_chk;
ALTER TABLE public.tab_enterprise_tax_config
  ADD CONSTRAINT tab_enterprise_tax_config_effective_range_chk
  CHECK (effective_from IS NULL OR effective_to IS NULL OR effective_to >= effective_from);

COMMENT ON COLUMN public.tab_enterprise_tax_config.effective_from IS
  'Primer día en que aplica este formulario (inclusive). NULL = sin límite (aplica desde siempre).';
COMMENT ON COLUMN public.tab_enterprise_tax_config.effective_to IS
  'Último día en que aplica este formulario (inclusive). NULL = sin límite (sigue vigente).';

ALTER TABLE public.tab_tax_due_date_config
  ADD COLUMN IF NOT EXISTS effective_from date NULL,
  ADD COLUMN IF NOT EXISTS effective_to date NULL;

ALTER TABLE public.tab_tax_due_date_config
  DROP CONSTRAINT IF EXISTS tab_tax_due_date_config_effective_range_chk;
ALTER TABLE public.tab_tax_due_date_config
  ADD CONSTRAINT tab_tax_due_date_config_effective_range_chk
  CHECK (effective_from IS NULL OR effective_to IS NULL OR effective_to >= effective_from);

COMMENT ON COLUMN public.tab_tax_due_date_config.effective_from IS
  'Primer día del período cubierto desde el que se generan vencimientos de este impuesto (inclusive). NULL = sin límite.';
COMMENT ON COLUMN public.tab_tax_due_date_config.effective_to IS
  'Último día del período cubierto hasta el que se generan vencimientos de este impuesto (inclusive). NULL = sin límite.';
