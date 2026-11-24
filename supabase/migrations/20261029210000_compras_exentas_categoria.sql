-- Permite guardar la categoría de impuesto "EXEMPT" (compras exentas de IVA) en el libro de compras.
-- Antes el cliente la convertía a OTHER por la restricción; ahora se guarda tal cual.
ALTER TABLE public.tab_purchase_ledger DROP CONSTRAINT IF EXISTS tab_purchase_ledger_tax_category_check;
ALTER TABLE public.tab_purchase_ledger
  ADD CONSTRAINT tab_purchase_ledger_tax_category_check
  CHECK (tax_category IS NULL OR tax_category = ANY (ARRAY['TOURISM_TAX'::text, 'IDP'::text, 'ELECTRICITY_TAX'::text, 'FISCAL_STAMP'::text, 'OTHER'::text, 'EXEMPT'::text]))
  NOT VALID;
ALTER TABLE public.tab_purchase_ledger VALIDATE CONSTRAINT tab_purchase_ledger_tax_category_check;
