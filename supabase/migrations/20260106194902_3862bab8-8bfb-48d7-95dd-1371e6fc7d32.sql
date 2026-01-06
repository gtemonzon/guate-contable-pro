-- Add establishment columns to sales ledger
ALTER TABLE tab_sales_ledger 
ADD COLUMN establishment_code TEXT,
ADD COLUMN establishment_name TEXT;

-- Index for filtering by establishment
CREATE INDEX idx_sales_establishment_code ON tab_sales_ledger(enterprise_id, establishment_code);

-- Comment for documentation
COMMENT ON COLUMN tab_sales_ledger.establishment_code IS 'Código de establecimiento SAT (ej: 1, 2, 3)';
COMMENT ON COLUMN tab_sales_ledger.establishment_name IS 'Nombre del establecimiento según SAT';