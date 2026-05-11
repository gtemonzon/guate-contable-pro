SET LOCAL "app.import_mode" = 'on';
UPDATE public.tab_journal_entries
SET entry_type = 'cierre'
WHERE entry_type = 'diario'
  AND (
    description ILIKE '%REGISTRO RESULTADO DEL PERIODO%'
    OR description ILIKE '%TRASLADO DE RESULTADO%'
    OR description ILIKE '%RESULTADO DEL EJERCICIO%'
    OR description ILIKE '%RESULTADO DEL EJERICIO%'
  );