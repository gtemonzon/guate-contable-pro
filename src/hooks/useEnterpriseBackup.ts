import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { fetchAllRecords } from '@/utils/supabaseHelpers';

interface BackupOptions {
  enterpriseId: number;
  enterpriseName: string;
}

export function useEnterpriseBackup() {
  const [isExporting, setIsExporting] = useState(false);

  const exportEnterpriseData = async ({ enterpriseId, enterpriseName }: BackupOptions) => {
    setIsExporting(true);
    
    try {
      const wb = XLSX.utils.book_new();
      
      // 1. Enterprise info
      const { data: enterprise } = await supabase
        .from('tab_enterprises')
        .select('*')
        .eq('id', enterpriseId)
        .single();
      
      if (enterprise) {
        const wsEnterprise = XLSX.utils.json_to_sheet([enterprise]);
        XLSX.utils.book_append_sheet(wb, wsEnterprise, 'Empresa');
      }

      // 2. Accounting Periods
      const periodsQuery = supabase
        .from('tab_accounting_periods')
        .select('*')
        .eq('enterprise_id', enterpriseId)
        .order('year', { ascending: false });
      const periods = await fetchAllRecords(periodsQuery);
      if (periods.length > 0) {
        const wsPeriods = XLSX.utils.json_to_sheet(periods);
        XLSX.utils.book_append_sheet(wb, wsPeriods, 'Periodos');
      }

      // 3. Accounts
      const accountsQuery = supabase
        .from('tab_accounts')
        .select('*')
        .eq('enterprise_id', enterpriseId)
        .is('deleted_at', null)
        .order('account_code');
      const accounts = await fetchAllRecords(accountsQuery);
      if (accounts.length > 0) {
        const wsAccounts = XLSX.utils.json_to_sheet(accounts);
        XLSX.utils.book_append_sheet(wb, wsAccounts, 'Cuentas');
      }

      // 4. Journal Entries
      const entriesQuery = supabase
        .from('tab_journal_entries')
        .select('*')
        .eq('enterprise_id', enterpriseId)
        .is('deleted_at', null)
        .order('entry_date', { ascending: false });
      const entries = await fetchAllRecords(entriesQuery);
      if (entries.length > 0) {
        const wsEntries = XLSX.utils.json_to_sheet(entries);
        XLSX.utils.book_append_sheet(wb, wsEntries, 'Partidas');
      }

      // 5. Journal Entry Details (need to fetch based on entries)
      if (entries.length > 0) {
        const entryIds = entries.map((e: any) => e.id);
        // Fetch in batches if too many
        const allDetails: any[] = [];
        const batchSize = 500;
        for (let i = 0; i < entryIds.length; i += batchSize) {
          const batch = entryIds.slice(i, i + batchSize);
          const { data: details } = await supabase
            .from('tab_journal_entry_details')
            .select('*')
            .in('journal_entry_id', batch)
            .is('deleted_at', null);
          if (details) allDetails.push(...details);
        }
        if (allDetails.length > 0) {
          const wsDetails = XLSX.utils.json_to_sheet(allDetails);
          XLSX.utils.book_append_sheet(wb, wsDetails, 'Detalles Partidas');
        }
      }

      // 6. Purchases
      const purchasesQuery = supabase
        .from('tab_purchase_ledger')
        .select('*')
        .eq('enterprise_id', enterpriseId)
        .is('deleted_at', null)
        .order('invoice_date', { ascending: false });
      const purchases = await fetchAllRecords(purchasesQuery);
      if (purchases.length > 0) {
        const wsPurchases = XLSX.utils.json_to_sheet(purchases);
        XLSX.utils.book_append_sheet(wb, wsPurchases, 'Compras');
      }

      // 7. Sales
      const salesQuery = supabase
        .from('tab_sales_ledger')
        .select('*')
        .eq('enterprise_id', enterpriseId)
        .is('deleted_at', null)
        .order('invoice_date', { ascending: false });
      const sales = await fetchAllRecords(salesQuery);
      if (sales.length > 0) {
        const wsSales = XLSX.utils.json_to_sheet(sales);
        XLSX.utils.book_append_sheet(wb, wsSales, 'Ventas');
      }

      // 8. Purchase Books
      const purchaseBooksQuery = supabase
        .from('tab_purchase_books')
        .select('*')
        .eq('enterprise_id', enterpriseId)
        .order('year', { ascending: false });
      const purchaseBooks = await fetchAllRecords(purchaseBooksQuery);
      if (purchaseBooks.length > 0) {
        const wsPurchaseBooks = XLSX.utils.json_to_sheet(purchaseBooks);
        XLSX.utils.book_append_sheet(wb, wsPurchaseBooks, 'Libros Compras');
      }

      // 9. Bank Accounts
      const { data: bankAccounts } = await supabase
        .from('tab_bank_accounts')
        .select('*')
        .eq('enterprise_id', enterpriseId);
      if (bankAccounts && bankAccounts.length > 0) {
        const wsBankAccounts = XLSX.utils.json_to_sheet(bankAccounts);
        XLSX.utils.book_append_sheet(wb, wsBankAccounts, 'Cuentas Bancarias');
      }

      // 10. Bank Movements
      const { data: bankMovements } = await supabase
        .from('tab_bank_movements')
        .select('*')
        .eq('enterprise_id', enterpriseId)
        .order('movement_date', { ascending: false });
      if (bankMovements && bankMovements.length > 0) {
        const wsBankMovements = XLSX.utils.json_to_sheet(bankMovements);
        XLSX.utils.book_append_sheet(wb, wsBankMovements, 'Movimientos Banco');
      }

      // 11. Tax Forms
      const taxFormsQuery = supabase
        .from('tab_tax_forms')
        .select('*')
        .eq('enterprise_id', enterpriseId)
        .order('payment_date', { ascending: false });
      const taxForms = await fetchAllRecords(taxFormsQuery);
      if (taxForms.length > 0) {
        const wsTaxForms = XLSX.utils.json_to_sheet(taxForms);
        XLSX.utils.book_append_sheet(wb, wsTaxForms, 'Formularios');
      }

      // 12. Enterprise Config
      const { data: config } = await supabase
        .from('tab_enterprise_config')
        .select('*')
        .eq('enterprise_id', enterpriseId);
      if (config && config.length > 0) {
        const wsConfig = XLSX.utils.json_to_sheet(config);
        XLSX.utils.book_append_sheet(wb, wsConfig, 'Configuracion');
      }

      // 13. Enterprise Tax Config
      const { data: taxConfig } = await supabase
        .from('tab_enterprise_tax_config')
        .select('*')
        .eq('enterprise_id', enterpriseId);
      if (taxConfig && taxConfig.length > 0) {
        const wsTaxConfig = XLSX.utils.json_to_sheet(taxConfig);
        XLSX.utils.book_append_sheet(wb, wsTaxConfig, 'Config Impuestos');
      }

      // 14. Tax Due Date Config
      const { data: taxDueDateConfig } = await supabase
        .from('tab_tax_due_date_config')
        .select('*')
        .eq('enterprise_id', enterpriseId);
      if (taxDueDateConfig && taxDueDateConfig.length > 0) {
        const wsTaxDueDateConfig = XLSX.utils.json_to_sheet(taxDueDateConfig);
        XLSX.utils.book_append_sheet(wb, wsTaxDueDateConfig, 'Vencimientos');
      }

      // 15. Enterprise Documents (metadata only, not files)
      const { data: documents } = await supabase
        .from('tab_enterprise_documents')
        .select('*')
        .eq('enterprise_id', enterpriseId)
        .eq('is_active', true);
      if (documents && documents.length > 0) {
        const wsDocuments = XLSX.utils.json_to_sheet(documents);
        XLSX.utils.book_append_sheet(wb, wsDocuments, 'Documentos');
      }

      // 16. Financial Statement Formats
      const { data: formats } = await supabase
        .from('tab_financial_statement_formats')
        .select('*')
        .eq('enterprise_id', enterpriseId);
      if (formats && formats.length > 0) {
        const wsFormats = XLSX.utils.json_to_sheet(formats);
        XLSX.utils.book_append_sheet(wb, wsFormats, 'Formatos EEFF');

        // 17. Financial Statement Sections
        const formatIds = formats.map(f => f.id);
        const { data: sections } = await supabase
          .from('tab_financial_statement_sections')
          .select('*')
          .in('format_id', formatIds);
        if (sections && sections.length > 0) {
          const wsSections = XLSX.utils.json_to_sheet(sections);
          XLSX.utils.book_append_sheet(wb, wsSections, 'Secciones EEFF');
        }
      }

      // 18. Role Permissions
      const { data: permissions } = await supabase
        .from('tab_role_permissions')
        .select('*')
        .eq('enterprise_id', enterpriseId);
      if (permissions && permissions.length > 0) {
        const wsPermissions = XLSX.utils.json_to_sheet(permissions);
        XLSX.utils.book_append_sheet(wb, wsPermissions, 'Permisos');
      }

      // 19. Notifications
      const { data: notifications } = await supabase
        .from('tab_notifications')
        .select('*')
        .eq('enterprise_id', enterpriseId);
      if (notifications && notifications.length > 0) {
        const wsNotifications = XLSX.utils.json_to_sheet(notifications);
        XLSX.utils.book_append_sheet(wb, wsNotifications, 'Notificaciones');
      }

      // 20. Alert Config
      const { data: alertConfig } = await supabase
        .from('tab_alert_config')
        .select('*')
        .eq('enterprise_id', enterpriseId);
      if (alertConfig && alertConfig.length > 0) {
        const wsAlertConfig = XLSX.utils.json_to_sheet(alertConfig);
        XLSX.utils.book_append_sheet(wb, wsAlertConfig, 'Config Alertas');
      }

      // 21. Operation Types
      const { data: operationTypes } = await supabase
        .from('tab_operation_types')
        .select('*')
        .eq('enterprise_id', enterpriseId);
      if (operationTypes && operationTypes.length > 0) {
        const wsOperationTypes = XLSX.utils.json_to_sheet(operationTypes);
        XLSX.utils.book_append_sheet(wb, wsOperationTypes, 'Tipos Operacion');
      }

      // 22. Holidays
      const { data: holidays } = await supabase
        .from('tab_holidays')
        .select('*')
        .eq('enterprise_id', enterpriseId);
      if (holidays && holidays.length > 0) {
        const wsHolidays = XLSX.utils.json_to_sheet(holidays);
        XLSX.utils.book_append_sheet(wb, wsHolidays, 'Feriados');
      }

      // 23. Custom Reminders
      const { data: reminders } = await supabase
        .from('tab_custom_reminders')
        .select('*')
        .eq('enterprise_id', enterpriseId);
      if (reminders && reminders.length > 0) {
        const wsReminders = XLSX.utils.json_to_sheet(reminders);
        XLSX.utils.book_append_sheet(wb, wsReminders, 'Recordatorios');
      }

      // Generate filename with date
      const today = new Date().toISOString().split('T')[0];
      const safeName = enterpriseName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
      const filename = `Backup_${safeName}_${today}.xlsx`;

      // Download file
      XLSX.writeFile(wb, filename);

      toast.success('Backup descargado exitosamente', {
        description: `Se exportaron todos los datos de ${enterpriseName}`,
      });
    } catch (error: unknown) {
      console.error('Error exporting enterprise data:', error);
      toast.error('Error al exportar datos', {
        description: error instanceof Error ? error.message : String(error) || 'Ocurrió un error al generar el backup',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return {
    exportEnterpriseData,
    isExporting,
  };
}
