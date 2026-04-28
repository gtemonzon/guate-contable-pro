
-- 1) Limpiar empresa 33 para nuevo test
DELETE FROM tab_legacy_import_jobs WHERE enterprise_id = 33;
DELETE FROM tab_journal_entry_details WHERE journal_entry_id IN (SELECT id FROM tab_journal_entries WHERE enterprise_id = 33);
DELETE FROM tab_journal_entries WHERE enterprise_id = 33;
DELETE FROM tab_purchase_ledger WHERE enterprise_id = 33;
DELETE FROM tab_purchase_books WHERE enterprise_id = 33;
DELETE FROM tab_sales_ledger WHERE enterprise_id = 33;
DELETE FROM fixed_assets WHERE enterprise_id = 33;
DELETE FROM fixed_asset_categories WHERE enterprise_id = 33;
DELETE FROM tab_accounting_periods WHERE enterprise_id = 33;
UPDATE tab_accounts SET parent_account_id = NULL WHERE enterprise_id = 33;
DELETE FROM tab_accounts WHERE enterprise_id = 33;

-- 2) Función para vincular padres por longitud de código (esquema 1/2/4/6 dígitos)
-- Devuelve la cantidad de cuentas actualizadas.
CREATE OR REPLACE FUNCTION public.link_account_parents_by_code(p_enterprise_id integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count integer := 0;
BEGIN
  -- Asignar padre por prefijo de código:
  --   6 dígitos -> padre con 4 dígitos (mismos primeros 4)
  --   4 dígitos -> padre con 2 dígitos (mismos primeros 2)
  --   2 dígitos -> padre con 1 dígito (mismo primer dígito)
  --   1 dígito  -> sin padre
  WITH updates AS (
    SELECT
      c.id AS child_id,
      p.id AS parent_id,
      CASE length(c.account_code)
        WHEN 6 THEN 4
        WHEN 4 THEN 3
        WHEN 2 THEN 2
        ELSE 1
      END AS new_level
    FROM tab_accounts c
    LEFT JOIN tab_accounts p
      ON p.enterprise_id = c.enterprise_id
     AND (
       (length(c.account_code) = 6 AND length(p.account_code) = 4 AND p.account_code = substr(c.account_code, 1, 4)) OR
       (length(c.account_code) = 4 AND length(p.account_code) = 2 AND p.account_code = substr(c.account_code, 1, 2)) OR
       (length(c.account_code) = 2 AND length(p.account_code) = 1 AND p.account_code = substr(c.account_code, 1, 1))
     )
    WHERE c.enterprise_id = p_enterprise_id
  )
  UPDATE tab_accounts t
     SET parent_account_id = u.parent_id,
         level = u.new_level,
         allows_movement = (length(t.account_code) >= 6)
    FROM updates u
   WHERE t.id = u.child_id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;
