UPDATE tab_accounting_periods SET status='abierto' WHERE enterprise_id=33;
DELETE FROM tab_sales_ledger WHERE enterprise_id=33;
DELETE FROM tab_purchase_ledger WHERE enterprise_id=33;