
CREATE OR REPLACE FUNCTION public.enforce_journal_entry_immutability()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Bypass for hard reset / legacy import operations
  IF current_setting('app.import_mode', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF OLD.is_posted = true AND OLD.status = 'contabilizado' THEN
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
      RETURN NEW;
    END IF;

    IF current_setting('app.allow_posted_metadata_update', true) = 'true' THEN
      IF (
        OLD.entry_number         = NEW.entry_number AND
        OLD.entry_date           = NEW.entry_date AND
        OLD.entry_type           = NEW.entry_type AND
        OLD.accounting_period_id IS NOT DISTINCT FROM NEW.accounting_period_id AND
        OLD.total_debit          = NEW.total_debit AND
        OLD.total_credit         = NEW.total_credit AND
        OLD.enterprise_id        = NEW.enterprise_id AND
        OLD.is_posted            = NEW.is_posted AND
        OLD.status               = NEW.status
      ) THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'El bypass de metadatos no permite cambiar datos contables.'
        USING ERRCODE = 'P0001';
    END IF;

    IF (
      OLD.entry_number        = NEW.entry_number AND
      OLD.entry_date          = NEW.entry_date   AND
      OLD.entry_type          = NEW.entry_type   AND
      OLD.accounting_period_id IS NOT DISTINCT FROM NEW.accounting_period_id AND
      OLD.description         = NEW.description  AND
      OLD.total_debit         = NEW.total_debit  AND
      OLD.total_credit        = NEW.total_credit AND
      OLD.enterprise_id       = NEW.enterprise_id
    ) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Las partidas contabilizadas son inmutables. Use una partida de reversión (REV-) para corregir.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;
