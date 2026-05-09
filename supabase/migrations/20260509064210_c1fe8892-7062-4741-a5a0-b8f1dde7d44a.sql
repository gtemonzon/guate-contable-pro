-- Extend link_account_parents_by_code to support 8-digit auxiliary accounts
-- and to correctly toggle allows_movement on parent accounts.
CREATE OR REPLACE FUNCTION public.link_account_parents_by_code(p_enterprise_id integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  updated_count integer := 0;
BEGIN
  -- Asignar padre por prefijo de código (códigos de longitud fija):
  --   8 dígitos -> padre con 6 dígitos (mismos primeros 6) -> nivel 5
  --   6 dígitos -> padre con 4 dígitos (mismos primeros 4) -> nivel 4
  --   4 dígitos -> padre con 2 dígitos (mismos primeros 2) -> nivel 3
  --   2 dígitos -> padre con 1 dígito  (mismo primer dígito) -> nivel 2
  --   1 dígito  -> sin padre                                  -> nivel 1
  WITH updates AS (
    SELECT
      c.id AS child_id,
      p.id AS parent_id,
      CASE length(c.account_code)
        WHEN 8 THEN 5
        WHEN 6 THEN 4
        WHEN 4 THEN 3
        WHEN 2 THEN 2
        ELSE 1
      END AS new_level
    FROM tab_accounts c
    LEFT JOIN tab_accounts p
      ON p.enterprise_id = c.enterprise_id
     AND (
       (length(c.account_code) = 8 AND length(p.account_code) = 6 AND p.account_code = substr(c.account_code, 1, 6)) OR
       (length(c.account_code) = 6 AND length(p.account_code) = 4 AND p.account_code = substr(c.account_code, 1, 4)) OR
       (length(c.account_code) = 4 AND length(p.account_code) = 2 AND p.account_code = substr(c.account_code, 1, 2)) OR
       (length(c.account_code) = 2 AND length(p.account_code) = 1 AND p.account_code = substr(c.account_code, 1, 1))
     )
    WHERE c.enterprise_id = p_enterprise_id
  )
  UPDATE tab_accounts t
     SET parent_account_id = u.parent_id,
         level = u.new_level
    FROM updates u
   WHERE t.id = u.child_id;
  GET DIAGNOSTICS updated_count = ROW_COUNT;

  -- allows_movement: hojas (sin hijos) permiten movimiento; cuentas con hijos no.
  UPDATE tab_accounts t
     SET allows_movement = NOT EXISTS (
           SELECT 1 FROM tab_accounts c
            WHERE c.enterprise_id = t.enterprise_id
              AND c.parent_account_id = t.id
         )
   WHERE t.enterprise_id = p_enterprise_id;

  RETURN updated_count;
END;
$function$;

-- Re-aplicar para empresa 36 (Insumos y Suministros Textiles) que ya fue importada
SELECT public.link_account_parents_by_code(36);