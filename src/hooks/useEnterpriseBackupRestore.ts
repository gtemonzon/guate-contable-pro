import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
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
  'tab_audit_log',
  'tab_bank_import_templates',
  'tab_integrity_rules_config',
] as const;

type BackupTable = typeof BACKUP_TABLES[number];

// The backup file is a generic dump of ~30 different tables, each with its
// own row shape. Within the shared export/restore loop below, a row's exact
// shape is only known once you're looking at a specific table — genuinely
// not something a single static type can express here, so it's represented
// as a plain object with unknown field values rather than `any`.
type BackupRow = Record<string, unknown>;

// Used only where Supabase's typed .insert() must be called against a
// dynamically-selected table (tableName here is a union of ~30 tables).
// Unlike reads (which have the untyped .filter() escape hatch used below),
// .insert() has no equivalent — this asserts through the real generated
// Insert union for these tables; which specific member actually applies is
// only known at runtime, by construction of this generic restore loop.
type BackupTableInsert = Database['public']['Tables'][BackupTable]['Insert'];

// Tables that do NOT need ID remapping (no child tables reference them)
const BATCH_INSERT_TABLES = new Set([
  'tab_notifications',
  'tab_alert_config',
  'tab_holidays',
  'tab_custom_reminders',
  'tab_dashboard_card_config',
  'tab_import_logs',
  'tab_audit_log',
  'tab_role_permissions',
  'tab_tax_due_date_config',
  'tab_enterprise_documents',
  'tab_integrity_rules_config',
  'tab_tax_forms',
]);

interface BackupMetadata {
  export_date: string;
  source_enterprise_id: number;
  source_enterprise_name: string;
  app_version: string;
  table_counts: Record<string, number>;
  total_records: number;
}

interface BackupFile {
  metadata: BackupMetadata;
  data: Record<string, BackupRow[]>;
}

export interface RestoreProgress {
  currentTable: string;
  currentIndex: number;
  totalTables: number;
  recordsProcessed: number;
  totalRecords: number;
}

export interface BackupPreview {
  metadata: BackupMetadata;
  tableCounts: Record<string, number>;
  totalRecords: number;
}

export interface FailedRecord {
  table: string;
  record: BackupRow;
  error: string;
}

export interface RestoreResult {
  success: boolean;
  recordsProcessed: number;
  recordsFailed: number;
  failedRecords: FailedRecord[];
  tableResults: Record<string, { inserted: number; failed: number }>;
  duration: number;
}

export function useEnterpriseBackupRestore() {
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null);
  const [restoreProgress, setRestoreProgress] = useState<RestoreProgress | null>(null);
  const [backupPreview, setBackupPreview] = useState<BackupPreview | null>(null);
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);
  const cancelRef = useRef(false);

  // Helper: fetch table data with enterprise_id filter
  const fetchTableData = async (tableName: BackupTable, enterpriseId: number): Promise<BackupRow[]> => {
    try {
      if (tableName === 'tab_journal_entry_details' || tableName === 'tab_journal_entry_history') {
        const entriesQuery = supabase
          .from('tab_journal_entries')
          .select('id')
          .eq('enterprise_id', enterpriseId);
        const entries = await fetchAllRecords<Pick<Database['public']['Tables']['tab_journal_entries']['Row'], 'id'>>(entriesQuery);
        if (entries.length === 0) return [];

        const entryIds = entries.map((e) => e.id);
        const allData: BackupRow[] = [];
        for (let i = 0; i < entryIds.length; i += 500) {
          const batch = entryIds.slice(i, i + 500);
          const { data } = await supabase
            .from(tableName)
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
        const { data } = await supabase
          .from('tab_financial_statement_sections')
          .select('*')
          .in('format_id', formats.map(f => f.id));
        return data || [];
      }

      if (tableName === 'tab_financial_statement_section_accounts') {
        const { data: formats } = await supabase
          .from('tab_financial_statement_formats')
          .select('id')
          .eq('enterprise_id', enterpriseId);
        if (!formats || formats.length === 0) return [];
        const { data: sections } = await supabase
          .from('tab_financial_statement_sections')
          .select('id')
          .in('format_id', formats.map(f => f.id));
        if (!sections || sections.length === 0) return [];
        const { data } = await supabase
          .from('tab_financial_statement_section_accounts')
          .select('*')
          .in('section_id', sections.map(s => s.id));
        return data || [];
      }

      if (tableName === 'tab_bank_import_templates') {
        const query = supabase
          .from('tab_bank_import_templates')
          .select('*')
          .eq('enterprise_id', enterpriseId);
        return await fetchAllRecords<Database['public']['Tables']['tab_bank_import_templates']['Row']>(query);
      }

      // Standard tables with enterprise_id.
      // Uses .filter() instead of .eq() because `tableName` here is a union
      // of ~25 different tables — Supabase's typed .eq() only allows columns
      // common to ALL of them, but .filter(column, operator, value) is
      // untyped by design for exactly this dynamic-column case, and produces
      // the identical query string ("column=eq.value") under the hood.
      const query = supabase
        .from(tableName)
        .select('*')
        .filter('enterprise_id', 'eq', enterpriseId);
      return await fetchAllRecords<BackupRow>(query);
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
      const backupData: Record<string, BackupRow[]> = {};
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

      const totalRecords = Object.values(tableCounts).reduce((a, b) => a + b, 0);

      const backup: BackupFile = {
        metadata: {
          export_date: new Date().toISOString(),
          source_enterprise_id: enterpriseId,
          source_enterprise_name: enterpriseName,
          app_version: '2.0.0',
          table_counts: tableCounts,
          total_records: totalRecords,
        },
        data: backupData,
      };

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

      // Log to backup history + audit log
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await Promise.all([
          supabase.from('tab_backup_history').insert({
            enterprise_id: enterpriseId,
            backup_type: 'export',
            file_name: a.download,
            record_count: totalRecords,
            metadata: { table_counts: tableCounts },
            created_by: user.id,
          }),
          supabase.from('tab_audit_log').insert({
            enterprise_id: enterpriseId,
            user_id: user.id,
            action: 'backup_export',
            table_name: 'system',
            record_id: enterpriseId,
            new_values: { tables_count: Object.keys(tableCounts).length, records_count: totalRecords, file_name: a.download },
          }),
        ]);
      }

      toast.success('Backup exportado exitosamente', {
        description: `${totalRecords.toLocaleString()} registros en ${Object.keys(tableCounts).length} tablas`,
      });
    } catch (error: unknown) {
      console.error('Export error:', error);
      toast.error('Error al exportar backup', { description: error instanceof Error ? error.message : String(error) });
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
            throw new Error('Archivo de backup inválido: faltan metadata o data');
          }
          const tableCounts = backup.metadata.table_counts || {};
          const totalRecords = backup.metadata.total_records || Object.values(tableCounts).reduce((a, b) => a + b, 0);

          // Validate record counts match actual data
          for (const [table, expectedCount] of Object.entries(tableCounts)) {
            const actualCount = backup.data[table]?.length || 0;
            if (actualCount !== expectedCount) {
              console.warn(`Count mismatch for ${table}: expected ${expectedCount}, got ${actualCount}`);
            }
          }

          const preview: BackupPreview = { metadata: backup.metadata, tableCounts, totalRecords };
          setBackupPreview(preview);
          resolve(preview);
        } catch (err: unknown) {
          reject(new Error('El archivo no es un backup válido: ' + (err instanceof Error ? err.message : String(err))));
        }
      };
      reader.onerror = () => reject(new Error('Error al leer el archivo'));
      reader.readAsText(file);
    });
  }, []);

  // Cancel restore
  const cancelRestore = useCallback(() => {
    cancelRef.current = true;
  }, []);

  // RESTORE
  const restoreBackup = useCallback(async (
    file: File,
    targetEnterpriseId: number,
    mode: 'restore' | 'clone'
  ) => {
    setIsRestoring(true);
    cancelRef.current = false;
    setRestoreResult(null);
    const startTime = Date.now();

    const failedRecords: FailedRecord[] = [];
    const tableResults: Record<string, { inserted: number; failed: number }> = {};

    try {
      const text = await file.text();
      const backup: BackupFile = JSON.parse(text);

      if (!backup.metadata || !backup.data) {
        throw new Error('Archivo de backup inválido');
      }

      // Pre-validation: check critical tables
      const criticalTables = ['tab_accounts', 'tab_accounting_periods'];
      for (const ct of criticalTables) {
        if (backup.data[ct] && backup.data[ct].length === 0) {
          console.warn(`Tabla crítica ${ct} está vacía en el backup`);
        }
      }

      const totalRecords = Object.entries(backup.data).reduce((sum, [, records]) => sum + records.length, 0);
      const idMapping: Record<string, Record<number, number>> = {};
      let recordsProcessed = 0;

      // For restore mode, delete existing data in reverse order
      if (mode === 'restore') {
        const reverseTables = [...BACKUP_TABLES].reverse();
        for (const tableName of reverseTables) {
          try {
            if (['tab_journal_entry_details', 'tab_journal_entry_history'].includes(tableName)) {
              const { data: entries } = await supabase
                .from('tab_journal_entries')
                .select('id')
                .eq('enterprise_id', targetEnterpriseId);
              if (entries && entries.length > 0) {
                const ids = entries.map(e => e.id);
                for (let i = 0; i < ids.length; i += 500) {
                  // .in() is typed per-table; use the documented raw-filter
                  // syntax instead since tableName is a dynamic union here.
                  const batchIds = `(${ids.slice(i, i + 500).join(',')})`;
                  await supabase.from(tableName).delete().filter('journal_entry_id', 'in', batchIds);
                }
              }
            } else if (tableName === 'tab_financial_statement_section_accounts' || tableName === 'tab_financial_statement_sections') {
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
            } else if (tableName === 'tab_bank_import_templates') {
              await supabase.from('tab_bank_import_templates').delete().eq('enterprise_id', targetEnterpriseId);
            } else {
              // Same dynamic-union situation as fetchTableData's fallback below.
              await supabase.from(tableName).delete().filter('enterprise_id', 'eq', targetEnterpriseId);
            }
          } catch (err) {
            console.warn(`Could not clear ${tableName}:`, err);
          }
        }
      }

      // Get tables present in the backup (in topological order)
      const tablesToProcess = BACKUP_TABLES.filter(t => backup.data[t] && backup.data[t].length > 0);

      // Insert data in topological order
      for (let tableIdx = 0; tableIdx < tablesToProcess.length; tableIdx++) {
        if (cancelRef.current) {
          toast.info('Restauración cancelada por el usuario');
          break;
        }

        const tableName = tablesToProcess[tableIdx];
        const records = backup.data[tableName];
        if (!records || records.length === 0) continue;

        setRestoreProgress({
          currentTable: tableName,
          currentIndex: tableIdx,
          totalTables: tablesToProcess.length,
          recordsProcessed,
          totalRecords,
        });

        idMapping[tableName] = {};
        tableResults[tableName] = { inserted: 0, failed: 0 };

        const useBatchInsert = BATCH_INSERT_TABLES.has(tableName) && mode === 'clone';

        if (useBatchInsert) {
          // Batch insert for tables that don't need ID remapping
          const batchSize = 100;
          for (let i = 0; i < records.length; i += batchSize) {
            if (cancelRef.current) break;
            const batch = records.slice(i, i + batchSize).map((record): BackupRow => {
              const newRecord = { ...record };
              delete newRecord.id;
              delete newRecord.created_at;
              if ('enterprise_id' in newRecord) {
                newRecord.enterprise_id = targetEnterpriseId;
              }
              // Remove user UUIDs for clone
              if (mode === 'clone') {
                ['created_by', 'updated_by', 'reviewed_by', 'deleted_by', 'closed_by', 'imported_by', 'confirmed_by', 'user_id', 'run_by'].forEach(f => {
                  if (f in newRecord && typeof newRecord[f] === 'string' && (newRecord[f] as string)?.length === 36) {
                    delete newRecord[f];
                  }
                });
              }
              return newRecord;
            });

            try {
              const { error } = await supabase.from(tableName).insert(batch as unknown as BackupTableInsert[]);
              if (error) {
                // Fallback to one-by-one
                for (const rec of batch) {
                  try {
                    const { error: singleError } = await supabase.from(tableName).insert(rec as never);
                    if (singleError) {
                      failedRecords.push({ table: tableName, record: rec, error: singleError.message });
                      tableResults[tableName].failed++;
                    } else {
                      tableResults[tableName].inserted++;
                    }
                  } catch (err: unknown) {
                    failedRecords.push({ table: tableName, record: rec, error: err instanceof Error ? err.message : String(err) });
                    tableResults[tableName].failed++;
                  }
                }
              } else {
                tableResults[tableName].inserted += batch.length;
              }
            } catch (err: unknown) {
              failedRecords.push({ table: tableName, record: { batch_start: i }, error: err instanceof Error ? err.message : String(err) });
              tableResults[tableName].failed += batch.length;
            }
            recordsProcessed += batch.length;
          }
        } else {
          // Single insert with ID remapping
          for (const record of records) {
            if (cancelRef.current) break;
            const oldId = typeof record.id === 'number' ? record.id : undefined;
            const newRecord = { ...record };
            delete newRecord.id;
            delete newRecord.created_at;

            if (mode === 'clone' && 'enterprise_id' in newRecord) {
              newRecord.enterprise_id = targetEnterpriseId;
            }

            // Remove user UUIDs for clone
            if (mode === 'clone') {
              ['created_by', 'updated_by', 'reviewed_by', 'deleted_by', 'closed_by', 'imported_by', 'confirmed_by'].forEach(f => {
                if (f in newRecord && typeof newRecord[f] === 'string' && (newRecord[f] as string)?.length === 36) {
                  delete newRecord[f];
                }
              });
            }

            // === FK Remapping ===
            this_remapForeignKeys(tableName, newRecord, idMapping, mode);

            try {
              const { data: inserted, error } = await supabase
                .from(tableName)
                .insert(newRecord as never)
                .select('id')
                .single();

              if (error) {
                failedRecords.push({ table: tableName, record: { old_id: oldId, ...newRecord }, error: error instanceof Error ? error.message : String(error) });
                tableResults[tableName].failed++;
              } else if (inserted && oldId) {
                idMapping[tableName][oldId] = (inserted as { id: number }).id;
                tableResults[tableName].inserted++;
              }
            } catch (err: unknown) {
              failedRecords.push({ table: tableName, record: { old_id: oldId }, error: err instanceof Error ? err.message : String(err) });
              tableResults[tableName].failed++;
            }

            recordsProcessed++;
            if (recordsProcessed % 200 === 0) {
              setRestoreProgress({
                currentTable: tableName,
                currentIndex: tableIdx,
                totalTables: tablesToProcess.length,
                recordsProcessed,
                totalRecords,
              });
            }
          }

          // Second pass for self-referencing tables (accounts with parent_account_id)
          if (tableName === 'tab_accounts' && Object.keys(idMapping['tab_accounts'] || {}).length > 0) {
            for (const record of records) {
              const recordId = typeof record.id === 'number' ? record.id : undefined;
              const parentAccountId = typeof record.parent_account_id === 'number' ? record.parent_account_id : undefined;
              if (parentAccountId && recordId !== undefined && idMapping['tab_accounts'][recordId]) {
                const newParentId = idMapping['tab_accounts'][parentAccountId];
                if (newParentId) {
                  await supabase
                    .from('tab_accounts')
                    .update({ parent_account_id: newParentId })
                    .eq('id', idMapping['tab_accounts'][recordId]);
                }
              }
            }
          }
        }
      }

      const duration = Date.now() - startTime;
      const totalFailed = failedRecords.length;
      const result: RestoreResult = {
        success: totalFailed === 0 || (totalFailed / Math.max(recordsProcessed, 1)) < 0.1,
        recordsProcessed,
        recordsFailed: totalFailed,
        failedRecords,
        tableResults,
        duration,
      };
      setRestoreResult(result);

      // Log to backup history + audit log
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await Promise.all([
          supabase.from('tab_backup_history').insert({
            enterprise_id: targetEnterpriseId,
            backup_type: mode,
            file_name: file.name,
            record_count: recordsProcessed,
            metadata: {
              source: backup.metadata.source_enterprise_name,
              table_counts: backup.metadata.table_counts,
              failed_count: totalFailed,
              duration_ms: duration,
            },
            created_by: user.id,
          }),
          supabase.from('tab_audit_log').insert({
            enterprise_id: targetEnterpriseId,
            user_id: user.id,
            action: mode === 'restore' ? 'backup_restore' : 'backup_clone',
            table_name: 'system',
            record_id: targetEnterpriseId,
            new_values: {
              source_enterprise: backup.metadata.source_enterprise_name,
              tables_count: Object.keys(backup.metadata.table_counts).length,
              records_processed: recordsProcessed,
              records_failed: totalFailed,
              duration_ms: duration,
            },
          }),
        ]);
      }

      if (totalFailed > 0) {
        const failRate = (totalFailed / Math.max(recordsProcessed + totalFailed, 1)) * 100;
        if (failRate > 10) {
          toast.error(`Restauración con errores significativos`, {
            description: `${totalFailed} registros fallaron (${failRate.toFixed(1)}%). Revisa el resumen.`,
          });
        } else {
          toast.warning(`Restauración completada con advertencias`, {
            description: `${recordsProcessed} insertados, ${totalFailed} fallaron`,
          });
        }
      } else {
        toast.success(`${mode === 'restore' ? 'Restauración' : 'Clonación'} completada`, {
          description: `${recordsProcessed.toLocaleString()} registros procesados en ${(duration / 1000).toFixed(1)}s`,
        });
      }

      return result;
    } catch (error: unknown) {
      console.error('Restore error:', error);
      toast.error('Error en la restauración', { description: error instanceof Error ? error.message : String(error) });
      const duration = Date.now() - startTime;
      const result: RestoreResult = {
        success: false, recordsProcessed: 0, recordsFailed: 0,
        failedRecords: [], tableResults: {}, duration,
      };
      setRestoreResult(result);
      return result;
    } finally {
      setIsRestoring(false);
      setRestoreProgress(null);
    }
  }, []);

  const clearPreview = useCallback(() => {
    setBackupPreview(null);
    setRestoreResult(null);
  }, []);

  const downloadErrorLog = useCallback(() => {
    if (!restoreResult || restoreResult.failedRecords.length === 0) return;
    const blob = new Blob([JSON.stringify(restoreResult.failedRecords, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `restore_errors_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [restoreResult]);

  return {
    exportBackup,
    previewBackup,
    restoreBackup,
    clearPreview,
    cancelRestore,
    downloadErrorLog,
    isExporting,
    isRestoring,
    exportProgress,
    restoreProgress,
    backupPreview,
    restoreResult,
  };
}

// Extracted FK remapping logic
function this_remapForeignKeys(
  tableName: BackupTable,
  newRecord: BackupRow,
  idMapping: Record<string, Record<number, number>>,
  mode: 'restore' | 'clone'
) {
  // Backup rows are generic (BackupRow = Record<string, unknown>), but every
  // FK field touched below is a serial `id` reference — i.e. always a
  // (truthy) number when present. `fk` narrows a field to that number, and
  // `remap` applies the exact same "truthy + has a mapping" check the
  // original per-table `if` blocks used, just without repeating it ~25 times.
  const fk = (field: string): number | undefined => {
    const v = newRecord[field];
    return typeof v === 'number' && v ? v : undefined;
  };
  const remap = (field: string, table: string) => {
    const id = fk(field);
    if (id !== undefined && idMapping[table]?.[id]) {
      newRecord[field] = idMapping[table][id];
    }
  };

  // Accounts: parent handled in 2nd pass, but clear it on first insert
  if (tableName === 'tab_accounts') {
    const parentId = fk('parent_account_id');
    if (parentId !== undefined) {
      if (mode === 'clone') {
        newRecord.parent_account_id = null; // Set in second pass
      } else {
        remap('parent_account_id', 'tab_accounts');
      }
    }
  }

  if (tableName === 'tab_journal_entries') {
    remap('accounting_period_id', 'tab_accounting_periods');
    remap('bank_account_id', 'tab_accounts');
  }

  if (tableName === 'tab_journal_entry_details') {
    remap('journal_entry_id', 'tab_journal_entries');
    remap('account_id', 'tab_accounts');
  }

  if (tableName === 'tab_journal_entry_history') {
    remap('journal_entry_id', 'tab_journal_entries');
  }

  if (tableName === 'tab_purchase_ledger') {
    remap('journal_entry_id', 'tab_journal_entries');
    remap('purchase_book_id', 'tab_purchase_books');
    remap('accounting_period_id', 'tab_accounting_periods');
    remap('expense_account_id', 'tab_accounts');
    remap('bank_account_id', 'tab_accounts');
    remap('operation_type_id', 'tab_operation_types');
  }

  if (tableName === 'tab_sales_ledger') {
    remap('journal_entry_id', 'tab_journal_entries');
    remap('accounting_period_id', 'tab_accounting_periods');
    remap('operation_type_id', 'tab_operation_types');
    remap('income_account_id', 'tab_accounts');
  }

  if (tableName === 'tab_bank_movements') {
    remap('bank_account_id', 'tab_bank_accounts');
    remap('journal_entry_id', 'tab_journal_entries');
    remap('reconciliation_id', 'tab_bank_reconciliations');
  }

  if (tableName === 'tab_bank_reconciliations') {
    remap('bank_account_id', 'tab_bank_accounts');
  }

  if (tableName === 'tab_bank_accounts') {
    remap('account_id', 'tab_accounts');
  }

  if (tableName === 'tab_financial_statement_sections') {
    remap('format_id', 'tab_financial_statement_formats');
  }

  if (tableName === 'tab_financial_statement_section_accounts') {
    remap('section_id', 'tab_financial_statement_sections');
    remap('account_id', 'tab_accounts');
  }

  if (tableName === 'tab_period_inventory_closing') {
    remap('accounting_period_id', 'tab_accounting_periods');
    remap('journal_entry_id', 'tab_journal_entries');
  }

  if (tableName === 'tab_enterprise_config') {
    const accountFields = [
      'vat_credit_account_id', 'vat_debit_account_id', 'period_result_account_id',
      'initial_inventory_account_id', 'final_inventory_account_id', 'purchases_account_id',
      'sales_account_id', 'customers_account_id', 'suppliers_account_id',
      'inventory_account_id', 'cost_of_sales_account_id',
    ];
    for (const field of accountFields) {
      remap(field, 'tab_accounts');
    }
  }

  if (tableName === 'tab_bank_import_templates') {
    remap('bank_account_id', 'tab_accounts');
  }
}
