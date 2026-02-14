import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Download, Upload, FileJson, AlertTriangle, CheckCircle, Loader2, Database, XCircle, FileDown, History } from 'lucide-react';
import { useEnterpriseBackupRestore, type RestoreResult } from '@/hooks/useEnterpriseBackupRestore';
import { useEnterpriseBackup } from '@/hooks/useEnterpriseBackup';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';

function RestoreResultSummary({ result, onDownloadErrors }: { result: RestoreResult; onDownloadErrors: () => void }) {
  const successRate = result.recordsProcessed > 0
    ? ((result.recordsProcessed - result.recordsFailed) / result.recordsProcessed * 100)
    : 0;

  return (
    <Card className={result.success ? 'border-green-500/50' : 'border-destructive/50'}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          {result.success ? <CheckCircle className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-destructive" />}
          Resultado de la Restauración
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-green-600">{result.recordsProcessed - result.recordsFailed}</div>
            <p className="text-xs text-muted-foreground">Insertados</p>
          </div>
          <div>
            <div className="text-2xl font-bold text-destructive">{result.recordsFailed}</div>
            <p className="text-xs text-muted-foreground">Fallidos</p>
          </div>
          <div>
            <div className="text-2xl font-bold">{successRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">Éxito</p>
          </div>
        </div>

        <Separator />

        <div className="space-y-1 max-h-48 overflow-y-auto">
          {Object.entries(result.tableResults).map(([table, counts]) => (
            <div key={table} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{table.replace('tab_', '')}</span>
              <div className="flex gap-2">
                <Badge variant="outline" className="text-xs">{counts.inserted} ✓</Badge>
                {counts.failed > 0 && <Badge variant="destructive" className="text-xs">{counts.failed} ✗</Badge>}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Duración: {(result.duration / 1000).toFixed(1)}s</span>
          {result.recordsFailed > 0 && (
            <Button variant="outline" size="sm" onClick={onDownloadErrors}>
              <FileDown className="h-3 w-3 mr-1" /> Descargar errores
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function BackupHistoryList({ enterpriseId }: { enterpriseId: number | null }) {
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    if (!enterpriseId) return;
    supabase
      .from('tab_backup_history')
      .select('*')
      .eq('enterprise_id', enterpriseId)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }) => { if (data) setHistory(data); });
  }, [enterpriseId]);

  if (history.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium flex items-center gap-2">
        <History className="h-4 w-4" /> Historial Reciente
      </h4>
      <div className="space-y-1">
        {history.map(h => (
          <div key={h.id} className="flex items-center justify-between text-xs p-2 rounded border">
            <div>
              <Badge variant="outline" className="text-xs mr-2">
                {h.backup_type === 'export' ? 'Exportación' : h.backup_type === 'clone' ? 'Clonación' : 'Restauración'}
              </Badge>
              <span className="text-muted-foreground">{h.file_name}</span>
            </div>
            <div className="text-muted-foreground">
              {new Date(h.created_at).toLocaleString('es-GT')} • {h.record_count} reg.
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BackupRestoreManager() {
  const {
    exportBackup, previewBackup, restoreBackup, clearPreview, cancelRestore, downloadErrorLog,
    isExporting, isRestoring, exportProgress, restoreProgress, backupPreview, restoreResult,
  } = useEnterpriseBackupRestore();
  const { exportEnterpriseData, isExporting: isExportingXlsx } = useEnterpriseBackup();

  const [restoreMode, setRestoreMode] = useState<'restore' | 'clone'>('clone');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentEnterpriseIdStr = localStorage.getItem('currentEnterpriseId');
  const currentEntId = currentEnterpriseIdStr ? parseInt(currentEnterpriseIdStr) : null;
  const currentEntName = localStorage.getItem('currentEnterpriseName') || 'Empresa';

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreviewError(null);
    setSelectedFile(file);
    try {
      await previewBackup(file);
    } catch (err: any) {
      setPreviewError(err.message);
      clearPreview();
    }
  };

  const handleRestore = () => {
    if (restoreMode === 'restore') {
      setShowConfirmDialog(true);
    } else {
      executeRestore();
    }
  };

  const executeRestore = () => {
    if (!selectedFile || !currentEntId) return;
    setShowConfirmDialog(false);
    restoreBackup(selectedFile, currentEntId, restoreMode);
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    clearPreview();
    setPreviewError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const exportProgressPercent = exportProgress
    ? (exportProgress.current / exportProgress.total) * 100 : 0;
  const restoreProgressPercent = restoreProgress
    ? (restoreProgress.recordsProcessed / Math.max(restoreProgress.totalRecords, 1)) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Export Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Exportar Respaldo
          </CardTitle>
          <CardDescription>Descarga toda la información de la empresa en un archivo</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 flex-wrap">
            <Button
              onClick={() => currentEntId && exportBackup(currentEntId, currentEntName)}
              disabled={isExporting || !currentEntId}
            >
              {isExporting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Exportando...</>
              ) : (
                <><FileJson className="h-4 w-4 mr-2" /> Exportar JSON (Completo)</>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => currentEntId && exportEnterpriseData({ enterpriseId: currentEntId, enterpriseName: currentEntName })}
              disabled={isExportingXlsx || !currentEntId}
            >
              {isExportingXlsx ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Exportando...</>
              ) : (
                <><Database className="h-4 w-4 mr-2" /> Exportar Excel (Lectura)</>
              )}
            </Button>
          </div>
          {isExporting && exportProgress && (
            <div className="space-y-2">
              <Progress value={exportProgressPercent} />
              <p className="text-xs text-muted-foreground">
                Procesando tabla {exportProgress.current} de {exportProgress.total}
              </p>
            </div>
          )}

          <BackupHistoryList enterpriseId={currentEntId} />
        </CardContent>
      </Card>

      {/* Import/Restore Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Restaurar desde Respaldo
          </CardTitle>
          <CardDescription>Importa datos desde un archivo JSON de respaldo</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileSelect}
            className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
            disabled={isRestoring}
          />

          {previewError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{previewError}</AlertDescription>
            </Alert>
          )}

          {backupPreview && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm">Vista Previa del Backup</h4>
                  <Button variant="ghost" size="sm" onClick={handleClearFile}>Limpiar</Button>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Empresa origen:</span>
                  <span className="font-medium">{backupPreview.metadata.source_enterprise_name}</span>
                  <span className="text-muted-foreground">Fecha export:</span>
                  <span>{new Date(backupPreview.metadata.export_date).toLocaleString('es-GT')}</span>
                  <span className="text-muted-foreground">Versión:</span>
                  <span>{backupPreview.metadata.app_version}</span>
                  <span className="text-muted-foreground">Total registros:</span>
                  <span className="font-medium">{backupPreview.totalRecords.toLocaleString()}</span>
                </div>
                <Separator />
                <div className="flex flex-wrap gap-2">
                  {Object.entries(backupPreview.tableCounts).map(([table, count]) => (
                    <Badge key={table} variant="secondary" className="text-xs">
                      {table.replace('tab_', '')}: {count}
                    </Badge>
                  ))}
                </div>
              </div>

              <RadioGroup
                value={restoreMode}
                onValueChange={(v) => setRestoreMode(v as 'restore' | 'clone')}
                className="space-y-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="clone" id="clone" />
                  <Label htmlFor="clone" className="cursor-pointer">
                    <span className="font-medium">Clonar a esta empresa</span>
                    <span className="text-xs text-muted-foreground ml-2">(agrega los datos sin borrar los existentes)</span>
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="restore" id="restore" />
                  <Label htmlFor="restore" className="cursor-pointer">
                    <span className="font-medium text-destructive">Restaurar en esta empresa</span>
                    <span className="text-xs text-muted-foreground ml-2">(borra datos actuales y los reemplaza)</span>
                  </Label>
                </div>
              </RadioGroup>

              {restoreMode === 'restore' && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    La restauración eliminará TODOS los datos actuales de la empresa antes de importar. Esta acción es irreversible.
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={handleRestore}
                  disabled={isRestoring || !currentEntId}
                  variant={restoreMode === 'restore' ? 'destructive' : 'default'}
                >
                  {isRestoring ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Procesando...</>
                  ) : restoreMode === 'restore' ? (
                    <><AlertTriangle className="h-4 w-4 mr-2" /> Restaurar</>
                  ) : (
                    <><CheckCircle className="h-4 w-4 mr-2" /> Clonar datos</>
                  )}
                </Button>
                {isRestoring && (
                  <Button variant="outline" onClick={cancelRestore}>
                    <XCircle className="h-4 w-4 mr-2" /> Cancelar
                  </Button>
                )}
              </div>
            </div>
          )}

          {isRestoring && restoreProgress && (
            <div className="space-y-2">
              <Progress value={restoreProgressPercent} />
              <p className="text-xs text-muted-foreground">
                Procesando {restoreProgress.currentTable.replace('tab_', '')}...
                ({restoreProgress.recordsProcessed}/{restoreProgress.totalRecords} registros)
                — Tabla {restoreProgress.currentIndex + 1}/{restoreProgress.totalTables}
              </p>
            </div>
          )}

          {restoreResult && (
            <RestoreResultSummary result={restoreResult} onDownloadErrors={downloadErrorLog} />
          )}
        </CardContent>
      </Card>

      {/* Confirm Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmar restauración?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará TODOS los datos contables existentes de la empresa
              <strong> {currentEntName}</strong> y los reemplazará con los del backup.
              <br /><br />
              Esta acción <strong>NO SE PUEDE DESHACER</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executeRestore} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Sí, restaurar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
