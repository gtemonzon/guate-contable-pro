-- Limpieza de datos transaccionales de la empresa de pruebas (id=33)
-- para volver a probar la importación legacy.
DO $$
DECLARE
  ent_id BIGINT := 33;
BEGIN
  -- Activos fijos
  DELETE FROM fixed_asset_depreciation_schedule WHERE asset_id IN (SELECT id FROM fixed_assets WHERE enterprise_id = ent_id);
  DELETE FROM fixed_asset_event_log WHERE asset_id IN (SELECT id FROM fixed_assets WHERE enterprise_id = ent_id);
  DELETE FROM fixed_assets WHERE enterprise_id = ent_id;
  DELETE FROM fixed_asset_categories WHERE enterprise_id = ent_id;

  -- Partidas
  DELETE FROM tab_journal_entry_details WHERE journal_entry_id IN (SELECT id FROM tab_journal_entries WHERE enterprise_id = ent_id);
  DELETE FROM tab_journal_entries WHERE enterprise_id = ent_id;

  -- Libros
  DELETE FROM tab_purchase_ledger WHERE enterprise_id = ent_id;
  DELETE FROM tab_purchase_books WHERE enterprise_id = ent_id;
  DELETE FROM tab_sales_ledger WHERE enterprise_id = ent_id;

  -- Períodos
  DELETE FROM tab_accounting_periods WHERE enterprise_id = ent_id;

  -- Cuentas
  DELETE FROM tab_accounts WHERE enterprise_id = ent_id;
END $$;