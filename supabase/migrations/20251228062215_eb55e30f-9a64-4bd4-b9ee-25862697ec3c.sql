-- Add affects_total column to indicate if document adds (1) or subtracts (-1) from totals
ALTER TABLE public.tab_fel_document_types 
ADD COLUMN affects_total smallint NOT NULL DEFAULT 1
CONSTRAINT affects_total_check CHECK (affects_total IN (1, -1));

-- Add comment for clarity
COMMENT ON COLUMN public.tab_fel_document_types.affects_total IS 'Indica si el documento suma (1) o resta (-1) en los totales. Ej: Facturas suman, Notas de Crédito restan';

-- Update NCRE (Nota de Crédito) to subtract
UPDATE public.tab_fel_document_types SET affects_total = -1 WHERE code = 'NCRE';