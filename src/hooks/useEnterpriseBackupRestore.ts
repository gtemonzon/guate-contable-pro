import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { fetchAllRecords } from '@/utils/supabaseHelpers';

// Tables in topological order (parents first)
const BACKUP_TABLES = [
  'tab_enterprise_config',
  'tab_enterprise_tax_config',
  'tab_accounts',
  'tab_accounting_periods',
  'tab_bank_accounts',
  'tab_operation_types',
  'tab_purchase_books',
  'tab_journal_entries',
  'tab_journal_entry_details',
  'tab_journal_entry_history',
  'tab_purchase_ledger',
  'tab_sales_ledger',
  'tab_bank_movements',
  'tab_bank_reconciliations',
  'tab_import_logs',
  'tab_financial_statement_formats',
  'tab_financial_statement_sections',
  'tab_financial_statement_section_accounts',
  'tab_role_permissions',
  'tab_notifications',
  'tab_alert_config',
  'tab_holidays',
  'tab_custom_reminders',
  'tab_tax_forms',
  'tab_tax_due_date_config',
  'tab_enterprise_documents',
  'tab_period_inventory_closing',
  'tab_dashboard_card_config',
] as const;

type BackupTable = typeof BACKUP_TABLES[number];

interface BackupMetadata {
  export_date: string;
  source_enterprise_id: number;
  source_enterprise_name: string;
  app_version: string;
  table_counts: Record<string, number>;
}

interface BackupFile {
  metadata: BackupMetadata;
  data: Record<string, any[]>;
}

interface RestoreProgress {
  currentTable: string;
  currentIndex: number;
  totalTables: number;
  recordsProcessed: number;
  totalRecords: number;
}

interface BackupPreview {
  metadata: BackupMetadata;
  tableCounts: Record<string, number>;
  totalRecords: number;
}

export function useEnterpriseBackupRestore() {
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null);
  const [restoreProgress, setRestoreProgress] = useState<RestoreProgress | null>(null);
  const [backupPreview, setBackupPreview] = useState<BackupPreview | null>(null);

  // Helper: fetch table data with enterprise_id filter
  const fetchTableData = async (tableName: string, enterpriseId: number): Promise<any[]> => {
    // Tables that don't have enterprise_id directly
    const indirectTables: Record<string, { via: string; parentTable: string; parentFilter: string }> = {
      tab_journal_entry_details: { via: 'journal_entry_id', parentTable: 'tab_journal_entries', parentFilter: 'enterprise_id' },
      tab_journal_entry_history: { via: 'journal_entry_id', parentTable: 'tab_journal_entries', parentFilter: 'enterprise_id' },
      tab_financial_statement_sections: { via: 'format_id', parentTable: 'tab_financial_statement_formats', parentFilter: 'enterprise_id' },
      tab_financial_statement_section_accounts: { via: 'section_id', parentTable: 'tab_financial_statement_sections', parentFilter: 'format_id' },
    };

    try {
      if (tableName === 'tab_journal_entry_details' || tableName === 'tab_journal_entry_history') {
        // Get entry IDs first
        const entriesQuery = supabase
          .from('tab_journal_entries')
          .select('id')
          .eq('enterprise_id', enterpriseId);
        const entries = await fetchAllRecords<any>(entriesQuery);
        if (entries.length === 0) return [];
        
        const entryIds = entries.map((e: any) => e.id);
        const allData: any[] = [];
        const batchSize = 500;
        for (let i = 0; i < entryIds.length; i += batchSize) {
          const batch = entryIds.slice(i, i + batchSize);
          const { data } = await supabase
            .from(tableName as any)
            .select('*')
            .in('journal_entry_id', batch);
          if (data) allData.push(...data);
        }
        return allData;
      }

      if (tableName === 'tab_financial_statement_sections') {
        const { data: formats } = await supabase
          .from('tab_financial_statement_formats')
          .select('id')
          .eq('enterprise_id', enterpriseId);
        if (!formats || formats.length === 0) return [];
        const formatIds = formats.map(f => f.id);
        const { data } = await supabase
          .from('tab_financial_statement_sections')
          .select('*')
          .in('format_id', formatIds);
        return data || [];
      }

      if (tableName === 'tab_financial_statement_section_accounts') {
        const { data: formats } = await supabase
          .from('tab_financial_statement_formats')
          .select('id')
          .eq('enterprise_id', enterpriseId);
        if (!formats || formats.length === 0) return [];
        const formatIds = formats.map(f => f.id);
        const { data: sections } = await supabase
          .from('tab_financial_statement_sections')
          .select('id')
          .in('format_id', formatIds);
        if (!sections || sections.length === 0) return [];
        const sectionIds = sections.map(s => s.id);
        const { data } = await supabase
          .from('tab_financial_statement_section_accounts')
          .select('*')
          .in('section_id', sectionIds);
        return data || [];
      }

      // Standard tables with enterprise_id
      const query = supabase
        .from(tableName as any)
        .select('*')
        .eq('enterprise_id', enterpriseId);
      return await fetchAllRecords<any>(query);
    } catch (error) {
      console.warn(`Could not fetch ${tableName}:`, error);
      return [];
    }
  };

  // EXPORT
  const exportBackup = useCallback(async (enterpriseId: number, enterpriseName: string) => {
    setIsExporting(true);
    setExportProgress({ current: 0, total: BACKUP_TABLES.length });

    try {
      const backupData: Record<string, any[]> = {};
      const tableCounts: Record<string, number> = {};

      for (let i = 0; i < BACKUP_TABLES.length; i++) {
        const tableName = BACKUP_TABLES[i];
        setExportProgress({ current: i + 1, total: BACKUP_TABLES.length });
        
        const data = await fetchTableData(tableName, enterpriseId);
        if (data.length > 0) {
          backupData[tableName] = data;
          tableCounts[tableName] = data.length;
        }
      }

      const backup: BackupFile = {
        metadata: {
          export_date: new Date().toISOString(),
          source_enterprise_id: enterpriseId,
          source_enterprise_name: enterpriseName,
          app_version: '1.0.0',
          table_counts: tableCounts,
        },
        data: backupData,
      };

      // Download
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
      const safeName = enterpriseName.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ]/g, '_').substring(0, 30);
      a.href = url;
      a.download = `backup_${safeName}_${dateStr}.json`;
      a.click();
      URL.revokeObjectURL(url);

      // Log to backup history
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const totalRecords = Object.values(tableCounts).reduce((a, b) => a + b, 0);
        await supabase.from('tab_backup_history').insert({
          enterprise_id: enterpriseId,
          backup_type: 'export',
          file_name: a.download,
          record_count: totalRecords,
          metadata: { table_counts: tableCounts } as any,
          created_by: user.id,
        });
      }

      toast.success('Backup exportado exitosamente', {
        description: `${Object.values(tableCounts).reduce((a, b) => a + b, 0)} registros exportados`,
      });
    } catch (error: any) {
      console.error('Export error:', error);
      toast.error('Error al exportar backup', { description: error.message });
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  }, []);

  // PREVIEW BACKUP FILE
  const previewBackup = useCallback((file: File): Promise<BackupPreview> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const backup: BackupFile = JSON.parse(e.target?.result as string);
          if (!backup.metadata || !backup.data) {
            throw new Error('Archivo de backup inválido');
          }
          const tableCounts = backup.metadata.table_counts || {};
          const totalRecords = Object.values(tableCounts).reduce((a, b) => a + b, 0);
          const preview: BackupPreview = {
            metadata: backup.metadata,
            tableCounts,
            totalRecords,
          };
          setBackupPreview(preview);
          resolve(preview);
        } catch (err: any) {
          reject(new Error('El archivo no es un backup válido: ' + err.message));
        }
      };
      reader.onerror = () => reject(new Error('Error al leer el archivo'));
      reader.readAsText(file);
    });
  }, []);

  // RESTORE
  const restoreBackup = useCallback(async (
    file: File,
    targetEnterpriseId: number,
    mode: 'restore' | 'clone'
  ) => {
    setIsRestoring(true);

    try {
      const text = await file.text();
      const backup: BackupFile = JSON.parse(text);

      if (!backup.metadata || !backup.data) {
        throw new Error('Archivo de backup inválido');
      }

      const totalRecords = Object.values(backup.metadata.table_counts).reduce((a, b) => a + b, 0);
      const idMapping: Record<string, Record<number, number>> = {};
      let recordsProcessed = 0;

      // For restore mode, delete existing data in reverse order
      if (mode === 'restore') {
        const reverseTables = [...BACKUP_TABLES].reverse();
        for (const tableName of reverseTables) {
          try {
            if (['tab_journal_entry_details', 'tab_journal_entry_history'].includes(tableName)) {
              // Delete via journal entries
              const { data: entries } = await supabase
                .from('tab_journal_entries')
                .select('id')
                .eq('enterprise_id', targetEnterpriseId);
              if (entries && entries.length > 0) {
                const ids = entries.map(e => e.id);
                for (let i = 0; i < ids.length; i += 500) {
                  await supabase.from(tableName as any).delete().in('journal_entry_id', ids.slice(i, i + 500));
                }
              }
            } else if (tableName === 'tab_financial_statement_sections' || tableName === 'tab_financial_statement_section_accounts') {
              // Handled via cascade or manual
              const { data: formats } = await supabase
                .from('tab_financial_statement_formats')
                .select('id')
                .eq('enterprise_id', targetEnterpriseId);
              if (formats && formats.length > 0) {
                const formatIds = formats.map(f => f.id);
                if (tableName === 'tab_financial_statement_section_accounts') {
                  const { data: sections } = await supabase
                    .from('tab_financial_statement_sections')
                    .select('id')
                    .in('format_id', formatIds);
                  if (sections && sections.length > 0) {
                    await supabase.from('tab_financial_statement_section_accounts').delete().in('section_id', sections.map(s => s.id));
                  }
                } else {
                  await supabase.from('tab_financial_statement_sections').delete().in('format_id', formatIds);
                }
              }
            } else {
              await supabase.from(tableName as any).delete().eq('enterprise_id', targetEnterpriseId);
            }
          } catch (err) {
            console.warn(`Could not clear ${tableName}:`, err);
          }
        }
      }

      // Insert data in topological order
      for (let tableIdx = 0; tableIdx < BACKUP_TABLES.length; tableIdx++) {
        const tableName = BACKUP_TABLES[tableIdx];
        const records = backup.data[tableName];
        if (!records || records.length === 0) continue;

        setRestoreProgress({
          currentTable: tableName,
          currentIndex: tableIdx,
          totalTables: BACKUP_TABLES.length,
          recordsProcessed,
          totalRecords,
        });

        idMapping[tableName] = {};

        // Process records
        const batchSize = 100;
        for (let i = 0; i < records.length; i += batchSize) {
          const batch = records.slice(i, i + batchSize);
          
          for (const record of batch) {
            const oldId = record.id;
            const newRecord = { ...record };
            delete newRecord.id; // Let DB generate new ID

            // Remap enterprise_id for clone mode
            if (mode === 'clone' && 'enterprise_id' in newRecord) {
              newRecord.enterprise_id = targetEnterpriseId;
            }

            // Remap FKs based on table
            if (tableName === 'tab_accounts' && newRecord.parent_account_id && idMapping['tab_accounts']) {
              newRecord.parent_account_id = idMapping['tab_accounts'][newRecord.parent_account_id] || null;
            }
            if (tableName === 'tab_journal_entry_details') {
              if (newRecord.journal_entry_id && idMapping['tab_journal_entries']) {
                newRecord.journal_entry_id = idMapping['tab_journal_entries'][newRecord.journal_entry_id] || newRecord.journal_entry_id;
              }
              if (newRecord.account_id && idMapping['tab_accounts']) {
                newRecord.account_id = idMapping['tab_accounts'][newRecord.account_id] || newRecord.account_id;
              }
            }
            if (tableName === 'tab_journal_entry_history') {
              if (newRecord.journal_entry_id && idMapping['tab_journal_entries']) {
                newRecord.journal_entry_id = idMapping['tab_journal_entries'][newRecord.journal_entry_id] || newRecord.journal_entry_id;
              }
            }
            if (tableName === 'tab_journal_entries') {
              if (newRecord.accounting_period_id && idMapping['tab_accounting_periods']) {
                newRecord.accounting_period_id = idMapping['tab_accounting_periods'][newRecord.accounting_period_id] || newRecord.accounting_period_id;
              }
              if (newRecord.bank_account_id && idMapping['tab_accounts']) {
                newRecord.bank_account_id = idMapping['tab_accounts'][newRecord.bank_account_id] || newRecord.bank_account_id;
              }
              // Remove user UUIDs for clone (they won't exist in target)
              if (mode === 'clone') {
                delete newRecord.created_by;
                delete newRecord.updated_by;
                delete newRecord.reviewed_by;
                delete newRecord.deleted_by;
              }
            }
            if (tableName === 'tab_purchase_ledger') {
              if (newRecord.journal_entry_id && idMapping['tab_journal_entries']) {
                newRecord.journal_entry_id = idMapping['tab_journal_entries'][newRecord.journal_entry_id] || newRecord.journal_entry_id;
              }
              if (newRecord.purchase_book_id && idMapping['tab_purchase_books']) {
                newRecord.purchase_book_id = idMapping['tab_purchase_books'][newRecord.purchase_book_id] || newRecord.purchase_book_id;
              }
              if (newRecord.accounting_period_id && idMapping['tab_accounting_periods']) {
                newRecord.accounting_period_id = idMapping['tab_accounting_periods'][newRecord.accounting_period_id] || newRecord.accounting_period_id;
              }
              if (newRecord.expense_account_id && idMapping['tab_accounts']) {
                newRecord.expense_account_id = idMapping['tab_accounts'][newRecord.expense_account_id] || newRecord.expense_account_id;
              }
              if (newRecord.bank_account_id && idMapping['tab_accounts']) {
                newRecord.bank_account_id = idMapping['tab_accounts'][newRecord.bank_account_id] || newRecord.bank_account_id;
              }
              if (newRecord.operation_type_id && idMapping['tab_operation_types']) {
                newRecord.operation_type_id = idMapping['tab_operation_types'][newRecord.operation_type_id] || newRecord.operation_type_id;
              }
            }
            if (tableName === 'tab_sales_ledger') {
              if (newRecord.journal_entry_id && idMapping['tab_journal_entries']) {
                newRecord.journal_entry_id = idMapping['tab_journal_entries'][newRecord.journal_entry_id] || newRecord.journal_entry_id;
              }
              if (newRecord.accounting_period_id && idMapping['tab_accounting_periods']) {
                newRecord.accounting_period_id = idMapping['tab_accounting_periods'][newRecord.accounting_period_id] || newRecord.accounting_period_id;
              }
              if (newRecord.operation_type_id && idMapping['tab_operation_types']) {
                newRecord.operation_type_id = idMapping['tab_operation_types'][newRecord.operation_type_id] || newRecord.operation_type_id;
              }
            }
            if (tableName === 'tab_bank_movements') {
              if (newRecord.bank_account_id && idMapping['tab_bank_accounts']) {
                newRecord.bank_account_id = idMapping['tab_bank_accounts'][newRecord.bank_account_id] || newRecord.bank_account_id;
              }
              if (newRecord.journal_entry_id && idMapping['tab_journal_entries']) {
                newRecord.journal_entry_id = idMapping['tab_journal_entries'][newRecord.journal_entry_id] || newRecord.journal_entry_id;
              }
              if (newRecord.reconciliation_id && idMapping['tab_bank_reconciliations']) {
                newRecord.reconciliation_id = idMapping['tab_bank_reconciliations'][newRecord.reconciliation_id] || newRecord.reconciliation_id;
              }
            }
            if (tableName === 'tab_bank_reconciliations') {
              if (newRecord.bank_account_id && idMapping['tab_bank_accounts']) {
                newRecord.bank_account_id = idMapping['tab_bank_accounts'][newRecord.bank_account_id] || newRecord.bank_account_id;
              }
            }
            if (tableName === 'tab_bank_accounts') {
              if (newRecord.account_id && idMapping['tab_accounts']) {
                newRecord.account_id = idMapping['tab_accounts'][newRecord.account_id] || newRecord.account_id;
              }
            }
            if (tableName === 'tab_financial_statement_formats') {
              // No FK remapping needed beyond enterprise_id
            }
            if (tableName === 'tab_financial_statement_sections') {
              if (newRecord.format_id && idMapping['tab_financial_statement_formats']) {
                newRecord.format_id = idMapping['tab_financial_statement_formats'][newRecord.format_id] || newRecord.format_id;
              }
            }
            if (tableName === 'tab_financial_statement_section_accounts') {
              if (newRecord.section_id && idMapping['tab_financial_statement_sections']) {
                newRecord.section_id = idMapping['tab_financial_statement_sections'][newRecord.section_id] || newRecord.section_id;
              }
              if (newRecord.account_id && idMapping['tab_accounts']) {
                newRecord.account_id = idMapping['tab_accounts'][newRecord.account_id] || newRecord.account_id;
              }
            }
            if (tableName === 'tab_period_inventory_closing') {
              if (newRecord.accounting_period_id && idMapping['tab_accounting_periods']) {
                newRecord.accounting_period_id = idMapping['tab_accounting_periods'][newRecord.accounting_period_id] || newRecord.accounting_period_id;
              }
              if (newRecord.journal_entry_id && idMapping['tab_journal_entries']) {
                newRecord.journal_entry_id = idMapping['tab_journal_entries'][newRecord.journal_entry_id] || newRecord.journal_entry_id;
              }
            }

            // Remove fields that shouldn't be inserted
            delete newRecord.created_at;

            try {
              const { data: inserted, error } = await supabase
                .from(tableName as any)
                .insert(newRecord as any)
                .select('id')
                .single();

              if (error) {
                console.warn(`Error inserting into ${tableName}:`, error.message, newRecord);
              } else if (inserted && oldId) {
                idMapping[tableName][oldId] = (inserted as any).id;
              }
            } catch (err) {
              console.warn(`Skipping record in ${tableName}:`, err);
            }

            recordsProcessed++;
          }
        }

        // Second pass for self-referencing tables (accounts with parent_account_id)
        if (tableName === 'tab_accounts' && Object.keys(idMapping['tab_accounts'] || {}).length > 0) {
          for (const record of records) {
            if (record.parent_account_id && idMapping['tab_accounts'][record.id]) {
              const newParentId = idMapping['tab_accounts'][record.parent_account_id];
              if (newParentId) {
                await supabase
                  .from('tab_accounts')
                  .update({ parent_account_id: newParentId })
                  .eq('id', idMapping['tab_accounts'][record.id]);
              }
            }
          }
        }
      }

      // Log to backup history
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('tab_backup_history').insert({
          enterprise_id: targetEnterpriseId,
          backup_type: mode,
          file_name: file.name,
          record_count: recordsProcessed,
          metadata: { source: backup.metadata.source_enterprise_name, table_counts: backup.metadata.table_counts } as any,
          created_by: user.id,
        });
      }

      toast.success(`${mode === 'restore' ? 'Restauración' : 'Clonación'} completada`, {
        description: `${recordsProcessed} registros procesados`,
      });
    } catch (error: any) {
      console.error('Restore error:', error);
      toast.error('Error en la restauración', { description: error.message });
    } finally {
      setIsRestoring(false);
      setRestoreProgress(null);
    }
  }, []);

  const clearPreview = useCallback(() => setBackupPreview(null), []);

  return {
    exportBackup,
    previewBackup,
    restoreBackup,
    clearPreview,
    isExporting,
    isRestoring,
    exportProgress,
    restoreProgress,
    backupPreview,
  };
}
