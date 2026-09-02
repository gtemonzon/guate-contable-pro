CREATE OR REPLACE FUNCTION public.replace_auto_generated_journal_entry(p_journal_entry_id bigint, p_enterprise_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_number text;
  v_enterprise_id bigint;
  v_period_status text;
  v_reversal_entry_id bigint;
  v_reversed_by_entry_id bigint;
BEGIN
  SELECT j.entry_number, j.enterprise_id, p.status, j.reversal_entry_id, j.reversed_by_entry_id
  INTO v_entry_number, v_enterprise_id, v_period_status, v_reversal_entry_id, v_reversed_by_entry_id
  FROM tab_journal_entries j
  LEFT JOIN tab_accounting_periods p ON p.id = j.accounting_period_id
  WHERE j.id = p_journal_entry_id;

  IF v_entry_number IS NULL THEN
    RAISE EXCEPTION 'Partida no encontrada' USING ERRCODE = 'P0004';
  END IF;

  IF v_enterprise_id IS DISTINCT FROM p_enterprise_id THEN
    RAISE EXCEPTION 'La partida no pertenece a la empresa indicada' USING ERRCODE = 'P0004';
  END IF;

  IF v_entry_number !~ '^(COMP|VENT)-' THEN
    RAISE EXCEPTION 'Esta operación solo aplica a pólizas automáticas de Libro de Compras/Ventas (COMP-/VENT-)' USING ERRCODE = 'P0004';
  END IF;

  IF v_period_status IS DISTINCT FROM 'abierto' THEN
    RAISE EXCEPTION 'No se puede modificar esta póliza porque el período contable ya está cerrado' USING ERRCODE = 'P0004';
  END IF;

  IF v_reversal_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede reemplazar esta póliza porque ya fue revertida (partida de reversión: %). Primero debes anular o eliminar la reversión.', v_reversal_entry_id USING ERRCODE = 'P0004';
  END IF;

  IF v_reversed_by_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede reemplazar esta póliza porque es en sí misma una reversión de otra partida.' USING ERRCODE = 'P0004';
  END IF;

  PERFORM set_config('app.import_mode', 'on', true);

  UPDATE tab_purchase_ledger SET journal_entry_id = NULL WHERE journal_entry_id = p_journal_entry_id;
  UPDATE tab_sales_ledger SET journal_entry_id = NULL WHERE journal_entry_id = p_journal_entry_id;
  DELETE FROM tab_journal_entry_details WHERE journal_entry_id = p_journal_entry_id;
  DELETE FROM tab_journal_entries WHERE id = p_journal_entry_id;
END;
$$;