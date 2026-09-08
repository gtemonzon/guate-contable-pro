-- Activos Fijos: eliminar el catálogo fixed_asset_suppliers (nunca usado en
-- producción — 0 activos referenciaban supplier_id) y reemplazarlo por
-- captura directa de NIT + Nombre en fixed_assets, igual que Libro de Compras.
ALTER TABLE fixed_assets ADD COLUMN supplier_nit text;
ALTER TABLE fixed_assets ADD COLUMN supplier_name text;
ALTER TABLE fixed_assets DROP COLUMN supplier_id;
DROP TABLE fixed_asset_suppliers;
