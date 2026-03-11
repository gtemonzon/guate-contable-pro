
-- Populate taxpayer_cache from purchase ledger (most recent name per NIT)
INSERT INTO taxpayer_cache (nit, name, source, last_checked)
SELECT DISTINCT ON (upper(trim(replace(supplier_nit, '-', ''))))
  upper(trim(replace(supplier_nit, '-', ''))) as nit,
  supplier_name as name,
  'Historial local' as source,
  now() as last_checked
FROM tab_purchase_ledger
WHERE deleted_at IS NULL
  AND supplier_nit IS NOT NULL
  AND trim(supplier_nit) != ''
  AND supplier_name IS NOT NULL
  AND trim(supplier_name) != ''
  AND upper(trim(replace(supplier_nit, '-', ''))) != 'ANULADA'
ORDER BY upper(trim(replace(supplier_nit, '-', ''))), invoice_date DESC
ON CONFLICT (nit) DO UPDATE SET
  name = EXCLUDED.name,
  last_checked = now()
WHERE length(EXCLUDED.name) > length(taxpayer_cache.name);

-- Populate from sales ledger
INSERT INTO taxpayer_cache (nit, name, source, last_checked)
SELECT DISTINCT ON (upper(trim(replace(customer_nit, '-', ''))))
  upper(trim(replace(customer_nit, '-', ''))) as nit,
  customer_name as name,
  'Historial local' as source,
  now() as last_checked
FROM tab_sales_ledger
WHERE deleted_at IS NULL
  AND customer_nit IS NOT NULL
  AND trim(customer_nit) != ''
  AND customer_name IS NOT NULL
  AND trim(customer_name) != ''
  AND upper(trim(replace(customer_nit, '-', ''))) != 'CF'
  AND upper(trim(replace(customer_nit, '-', ''))) != 'ANULADA'
ORDER BY upper(trim(replace(customer_nit, '-', ''))), invoice_date DESC
ON CONFLICT (nit) DO UPDATE SET
  name = EXCLUDED.name,
  last_checked = now()
WHERE length(EXCLUDED.name) > length(taxpayer_cache.name);
