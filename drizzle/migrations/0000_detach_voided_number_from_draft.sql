DO $migration$
DECLARE
  definition text;
  old_branch text := $old$    -- Sin REV ni desvinculación. El reemplazo (si se pide) reutiliza la partida.
    NULL;$old$;
  new_branch text := $new$    -- Sin REV ni desvinculación. El número anulado queda reservado en Bancos.
    -- Sin reemplazo, conservar el borrador pero quitar el número que ya no puede usar.
    IF NOT COALESCE(p_create_replacement, false) THEN
      UPDATE public.tab_journal_entries
         SET bank_reference = NULL, updated_by = v_uid, updated_at = now()
       WHERE id = v_entry.id;

      UPDATE public.tab_journal_entry_details
         SET bank_reference = NULL
       WHERE journal_entry_id = v_entry.id AND bank_reference = v_number;

      UPDATE public.tab_purchase_ledger
         SET batch_reference = NULL
       WHERE journal_entry_id = v_entry.id
         AND batch_reference = v_number AND deleted_at IS NULL;
    END IF;$new$;
BEGIN
  definition := pg_get_functiondef('public.void_bank_document(bigint,date,text,boolean,date,text)'::regprocedure);
  IF strpos(definition, old_branch) = 0 THEN
    RAISE EXCEPTION 'Draft branch differs from reviewed definition; refusing to alter void_bank_document';
  END IF;
  EXECUTE replace(definition, old_branch, new_branch);
END;
$migration$;

-- Keep existing authentication/authorization checks and restrict RPC execution.
REVOKE ALL ON FUNCTION public.void_bank_document(bigint,date,text,boolean,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_bank_document(bigint,date,text,boolean,date,text) TO authenticated, service_role;