-- Función para reversar una revaluación cambiaria NO realizada
-- Genera una partida espejo el primer día del mes siguiente
CREATE OR REPLACE FUNCTION public.reverse_fx_revaluation(p_run_id bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run RECORD;
  v_orig_entry RECORD;
  v_reverse_date date;
  v_reverse_year int;
  v_reverse_month int;
  v_period_id bigint;
  v_period_status text;
  v_next_number int;
  v_entry_number text;
  v_new_entry_id bigint;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
BEGIN
  -- Cargar la corrida
  SELECT * INTO v_run
  FROM tab_fx_revaluation_runs
  WHERE id = p_run_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Corrida de revaluación % no encontrada', p_run_id;
  END IF;

  IF v_run.revaluation_type <> 'UNREALIZED' THEN
    RAISE EXCEPTION 'Solo se pueden reversar revaluaciones NO realizadas (UNREALIZED)';
  END IF;

  IF v_run.reversed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Esta revaluación ya fue reversada (%)', v_run.reversed_at;
  END IF;

  IF v_run.journal_entry_id IS NULL THEN
    RAISE EXCEPTION 'La corrida no tiene partida contable asociada';
  END IF;

  -- Cargar la partida original
  SELECT * INTO v_orig_entry
  FROM tab_journal_entries
  WHERE id = v_run.journal_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partida original % no encontrada', v_run.journal_entry_id;
  END IF;

  -- Calcular fecha de reverso = primer día del mes siguiente al corte
  v_reverse_date := (date_trunc('month', v_run.cutoff_date::date) + interval '1 month')::date;
  v_reverse_year := extract(year from v_reverse_date)::int;
  v_reverse_month := extract(month from v_reverse_date)::int;

  -- Validar período abierto que contenga la fecha de reverso
  SELECT id, status INTO v_period_id, v_period_status
  FROM tab_accounting_periods
  WHERE enterprise_id = v_run.enterprise_id
    AND start_date <= v_reverse_date
    AND end_date >= v_reverse_date
  LIMIT 1;

  IF v_period_id IS NULL THEN
    RAISE EXCEPTION 'No existe un período contable que contenga la fecha de reverso %. Crea el período del mes siguiente.', v_reverse_date;
  END IF;

  IF v_period_status = 'cerrado' THEN
    RAISE EXCEPTION 'El período del mes siguiente está cerrado. Reábrelo para registrar el reverso.';
  END IF;

  -- Obtener próximo número de partida con prefijo DIFC
  INSERT INTO journal_entry_counters (enterprise_id, year, month, prefix, last_number)
  VALUES (v_run.enterprise_id, v_reverse_year, v_reverse_month, 'DIFC', 1)
  ON CONFLICT (enterprise_id, year, month, prefix)
  DO UPDATE SET last_number = journal_entry_counters.last_number + 1, updated_at = now()
  RETURNING last_number INTO v_next_number;

  v_entry_number := 'DIFC-' || v_reverse_year || '-' || lpad(v_reverse_month::text, 2, '0') || '-' || lpad(v_next_number::text, 4, '0');

  -- Crear la partida de reverso (borrador)
  INSERT INTO tab_journal_entries (
    enterprise_id, accounting_period_id, entry_number, entry_date,
    entry_type, description, status, currency_code, exchange_rate,
    total_debit, total_credit, reversal_entry_id
  ) VALUES (
    v_run.enterprise_id, v_period_id, v_entry_number, v_reverse_date,
    'ajuste',
    'Reverso revaluación cambiaria NO realizada - corte ' || to_char(v_run.cutoff_date::date, 'YYYY-MM-DD') || ' (partida origen ' || v_orig_entry.entry_number || ')',
    'borrador', v_orig_entry.currency_code, COALESCE(v_orig_entry.exchange_rate, 1),
    0, 0, v_orig_entry.id
  )
  RETURNING id INTO v_new_entry_id;

  -- Insertar líneas espejo (intercambia debit ↔ credit)
  INSERT INTO tab_journal_entry_details (
    journal_entry_id, line_number, account_id, debit_amount, credit_amount, description
  )
  SELECT
    v_new_entry_id,
    line_number,
    account_id,
    credit_amount,  -- intercambio
    debit_amount,   -- intercambio
    'Reverso: ' || COALESCE(description, '')
  FROM tab_journal_entry_details
  WHERE journal_entry_id = v_orig_entry.id
  ORDER BY line_number;

  -- Calcular totales
  SELECT COALESCE(SUM(debit_amount), 0), COALESCE(SUM(credit_amount), 0)
  INTO v_total_debit, v_total_credit
  FROM tab_journal_entry_details
  WHERE journal_entry_id = v_new_entry_id;

  -- Contabilizar
  UPDATE tab_journal_entries
  SET status = 'contabilizada',
      is_posted = true,
      posted_at = now(),
      total_debit = v_total_debit,
      total_credit = v_total_credit
  WHERE id = v_new_entry_id;

  -- Marcar la corrida original como reversada y vincular la partida origen
  UPDATE tab_fx_revaluation_runs
  SET reversed_at = now()
  WHERE id = p_run_id;

  -- Vincular la partida original con la nueva (para auditoría bidireccional)
  UPDATE tab_journal_entries
  SET reversed_by_entry_id = v_new_entry_id
  WHERE id = v_orig_entry.id;

  RETURN v_new_entry_id;
END;
$$;

COMMENT ON FUNCTION public.reverse_fx_revaluation(bigint) IS
'Genera la partida de reverso espejo de una revaluación cambiaria NO realizada (DIFC-NR), fechada el primer día del mes siguiente al corte. Marca la corrida original como reversada e implementa vínculo bidireccional con reversed_by_entry_id/reversal_entry_id.';