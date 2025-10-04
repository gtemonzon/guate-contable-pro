-- Create FEL document types catalog
CREATE TABLE public.tab_fel_document_types (
  id bigserial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Insert common FEL document types
INSERT INTO public.tab_fel_document_types (code, name) VALUES
  ('FACT', 'Factura'),
  ('FCAM', 'Factura Cambiaria'),
  ('FPEQ', 'Factura Pequeño Contribuyente'),
  ('NCRE', 'Nota de Crédito'),
  ('NDEB', 'Nota de Débito'),
  ('RDON', 'Recibo por Donación'),
  ('RECI', 'Recibo'),
  ('NABN', 'Nota de Abono');

-- Update tab_purchase_ledger to match new requirements
ALTER TABLE public.tab_purchase_ledger 
  DROP COLUMN IF EXISTS authorization_number,
  ADD COLUMN IF NOT EXISTS batch_reference text,
  ADD COLUMN IF NOT EXISTS base_amount numeric DEFAULT 0;

-- Update column comments for clarity
COMMENT ON COLUMN public.tab_purchase_ledger.total_amount IS 'Monto total con IVA incluido';
COMMENT ON COLUMN public.tab_purchase_ledger.base_amount IS 'Monto base sin IVA (se calcula automáticamente)';
COMMENT ON COLUMN public.tab_purchase_ledger.vat_amount IS 'IVA (12% calculado automáticamente)';
COMMENT ON COLUMN public.tab_purchase_ledger.batch_reference IS 'Referencia de lote de pago (ej: CHQ-100, EF-001)';
COMMENT ON COLUMN public.tab_purchase_ledger.journal_entry_id IS 'Partida contable generada';

-- Enable RLS if not already enabled (it should be from existing policies)
ALTER TABLE public.tab_fel_document_types ENABLE ROW LEVEL SECURITY;

-- Create policy for FEL document types (read-only for all authenticated users)
CREATE POLICY "Anyone can view FEL document types"
  ON public.tab_fel_document_types
  FOR SELECT
  USING (true);