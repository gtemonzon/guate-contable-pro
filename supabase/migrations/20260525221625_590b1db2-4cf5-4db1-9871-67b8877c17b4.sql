
ALTER TABLE tab_sales_ledger DISABLE TRIGGER USER;
ALTER TABLE tab_purchase_ledger DISABLE TRIGGER USER;

UPDATE tab_sales_ledger
SET
  total_amount      = net_amount,
  original_total    = net_amount,
  net_amount        = net_amount - vat_amount,
  original_subtotal = COALESCE(original_subtotal, net_amount) - COALESCE(original_vat, vat_amount)
WHERE enterprise_id IN (SELECT id FROM tab_enterprises WHERE tenant_id = 2)
  AND vat_amount > 0;

UPDATE tab_purchase_ledger
SET
  total_amount      = total_amount - vat_amount,
  original_total    = COALESCE(original_total, total_amount) - COALESCE(original_vat, vat_amount),
  net_amount        = net_amount - vat_amount,
  base_amount       = COALESCE(base_amount, net_amount) - vat_amount,
  original_subtotal = COALESCE(original_subtotal, net_amount) - COALESCE(original_vat, vat_amount)
WHERE enterprise_id IN (SELECT id FROM tab_enterprises WHERE tenant_id = 2)
  AND vat_amount > 0;

ALTER TABLE tab_sales_ledger ENABLE TRIGGER USER;
ALTER TABLE tab_purchase_ledger ENABLE TRIGGER USER;
