
DO $$
DECLARE
  v_enterprise_id INT := 30;
BEGIN
  SET LOCAL session_replication_role = 'replica';

  -- Journal entries y dependientes
  DELETE FROM public.tab_journal_entry_details
    WHERE journal_entry_id IN (SELECT id FROM public.tab_journal_entries WHERE enterprise_id = v_enterprise_id);
  DELETE FROM public.tab_journal_entry_history WHERE enterprise_id = v_enterprise_id;
  DELETE FROM public.tab_journal_entry_metadata_changes WHERE enterprise_id = v_enterprise_id;
  DELETE FROM public.tab_purchase_journal_links WHERE enterprise_id = v_enterprise_id;
  DELETE FROM public.tab_journal_entries WHERE enterprise_id = v_enterprise_id;

  -- Activos fijos
  DELETE FROM public.fixed_asset_depreciation_schedule
    WHERE asset_id IN (SELECT id FROM public.fixed_assets WHERE enterprise_id = v_enterprise_id);
  DELETE FROM public.fixed_asset_event_log
    WHERE asset_id IN (SELECT id FROM public.fixed_assets WHERE enterprise_id = v_enterprise_id);
  DELETE FROM public.fixed_assets WHERE enterprise_id = v_enterprise_id;
  DELETE FROM public.fixed_asset_categories WHERE enterprise_id = v_enterprise_id;

  -- Bancos / conciliación
  DELETE FROM public.tab_bank_reconciliation_adjustments WHERE enterprise_id = v_enterprise_id;
  DELETE FROM public.tab_bank_reconciliation_quadratic WHERE enterprise_id = v_enterprise_id;
  DELETE FROM public.tab_bank_reconciliations
    WHERE bank_account_id IN (SELECT id FROM public.tab_bank_accounts WHERE enterprise_id = v_enterprise_id);
  DELETE FROM public.tab_bank_movements WHERE enterprise_id = v_enterprise_id;
  DELETE FROM public.tab_bank_documents WHERE enterprise_id = v_enterprise_id;
  DELETE FROM public.tab_bank_accounts WHERE enterprise_id = v_enterprise_id;
  DELETE FROM public.tab_bank_import_templates WHERE enterprise_id = v_enterprise_id;

  -- Compras / ventas / libros
  DELETE FROM public.tab_purchase_ledger WHERE enterprise_id = v_enterprise_id;
  DELETE FROM public.tab_sales_ledger WHERE enterprise_id = v_enterprise_id;
  DELETE FROM public.tab_purchase_books WHERE enterprise_id = v_enterprise_id;
  DELETE FROM public.tab_book_folio_consumption WHERE enterprise_id = v_enterprise_id;
  DELETE FROM public.tab_book_authorizations WHERE enterprise_id = v_enterprise_id;

  -- Nómina
  DELETE FROM public.tab_payroll_entries WHERE enterprise_id = v_enterprise_id;
  DELETE FROM public.tab_payroll_periods WHERE enterprise_id = v_enterprise_id;

  -- FX
  DELETE FROM public.tab_fx_settlements WHERE enterprise_id = v_enterprise_id;
  DELETE FROM public.tab_fx_open_balances WHERE enterprise_id = v_enterprise_id;
  DELETE FROM public.tab_fx_revaluation_runs WHERE enterprise_id = v_enterprise_id;

  -- Impuestos
  DELETE FROM public.tab_tax_forms WHERE enterprise_id = v_enterprise_id;
  DELETE FROM public.tab_enterprise_tax_config WHERE enterprise_id = v_enterprise_id;
  DELETE FROM public.tab_tax_due_date_config WHERE enterprise_id = v_enterprise_id;

  -- Períodos
  DELETE FROM public.tab_period_inventory_closing WHERE enterprise_id = v_enterprise_id;
  DELETE FROM public.tab_accounting_periods WHERE enterprise_id = v_enterprise_id;

  -- Estados financieros
  DELETE FROM public.tab_financial_statement_section_accounts
    WHERE section_id IN (
      SELECT id FROM public.tab_financial_statement_sections
      WHERE format_id IN (SELECT id FROM public.tab_financial_statement_formats WHERE enterprise_id = v_enterprise_id)
    );
  DELETE FROM public.tab_financial_statement_sections
    WHERE format_id IN (SELECT id FROM public.tab_financial_statement_formats WHERE enterprise_id = v_enterprise_id);
  DELETE FROM public.tab_financial_statement_formats WHERE enterprise_id = v_enterprise_id;

  -- Integridad
  DELETE FROM public.tab_integrity_validations WHERE enterprise_id = v_enterprise_id;
  DELETE FROM public.tab_integrity_rules_config WHERE enterprise_id = v_enterprise_id;

  -- Cuentas (jerarquía: hijos primero)
  LOOP
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.tab_accounts WHERE enterprise_id = v_enterprise_id);
    DELETE FROM public.tab_accounts
    WHERE enterprise_id = v_enterprise_id
      AND id NOT IN (SELECT parent_account_id FROM public.tab_accounts WHERE enterprise_id = v_enterprise_id AND parent_account_id IS NOT NULL);
  END LOOP;

  -- Configuración / catálogos por empresa
  DELETE FROM public.tab_enterprise_config WHERE enterprise_id = v_enterprise_id;
  DELETE FROM public.tab_enterprise_currencies WHERE enterprise_id = v_enterprise_id;
  DELETE FROM public.tab_enterprise_documents WHERE enterprise_id = v_enterprise_id;
  DELETE FROM public.tab_alert_config WHERE enterprise_id = v_enterprise_id;
  DELETE FROM public.tab_dashboard_card_config WHERE enterprise_id = v_enterprise_id;
  DELETE FROM public.tab_custom_reminders WHERE enterprise_id = v_enterprise_id;
  DELETE FROM public.tab_notifications WHERE enterprise_id = v_enterprise_id;
  DELETE FROM public.tab_exchange_rates WHERE enterprise_id = v_enterprise_id;
  DELETE FROM public.tab_import_logs WHERE enterprise_id = v_enterprise_id;
  DELETE FROM public.tab_backup_history WHERE enterprise_id = v_enterprise_id;
  DELETE FROM public.tab_user_enterprises WHERE enterprise_id = v_enterprise_id;
  DELETE FROM public.tab_audit_log WHERE enterprise_id = v_enterprise_id;
  DELETE FROM public.tab_legacy_import_jobs WHERE enterprise_id = v_enterprise_id;

  -- Empresa
  DELETE FROM public.tab_enterprises WHERE id = v_enterprise_id;

  SET LOCAL session_replication_role = 'origin';
END $$;
