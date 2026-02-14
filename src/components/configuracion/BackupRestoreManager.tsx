import { useState, useRef } from 'react';
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
import { Download, Upload, FileJson, AlertTriangle, CheckCircle, Loader2, Database } from 'lucide-react';
import { useEnterpriseBackupRestore } from '@/hooks/useEnterpriseBackupRestore';
import { useEnterpriseBackup } from '@/hooks/useEnterpriseBackup';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

export function BackupRestoreManager() {
  const {
    exportBackup, previewBackup, restoreBackup, clearPreview,
    isExporting, isRestoring, exportProgress, restoreProgress, backupPreview,
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
    ? (exportProgress.current / exportProgress.total) * 100
    : 0;

  const restoreProgressPercent = restoreProgress
    ? (restoreProgress.recordsProcessed / Math.max(restoreProgress.totalRecords, 1)) * 100
    : 0;

  return (
    <div className="space-y-6">
      {/* Export Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Exportar Respaldo
          </CardTitle>
          <CardDescription>
            Descarga toda la información de la empresa en un archivo
          </CardDescription>
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
        </CardContent>
      </Card>

      {/* Import/Restore Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Restaurar desde Respaldo
          </CardTitle>
          <CardDescription>
            Importa datos desde un archivo JSON de respaldo
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
              disabled={isRestoring}
            />
          </div>

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
                  <Button variant="ghost" size="sm" onClick={handleClearFile}>
                    Limpiar
                  </Button>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Empresa origen:</span>
                  <span className="font-medium">{backupPreview.metadata.source_enterprise_name}</span>
                  <span className="text-muted-foreground">Fecha export:</span>
                  <span>{new Date(backupPreview.metadata.export_date).toLocaleString('es-GT')}</span>
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
                    <span className="text-xs text-muted-foreground ml-2">
                      (agrega los datos sin borrar los existentes)
                    </span>
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="restore" id="restore" />
                  <Label htmlFor="restore" className="cursor-pointer">
                    <span className="font-medium text-destructive">Restaurar en esta empresa</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      (borra datos actuales y los reemplaza)
                    </span>
                  </Label>
                </div>
              </RadioGroup>

              {restoreMode === 'restore' && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    La restauración eliminará TODOS los datos actuales de la empresa antes de importar.
                    Esta acción es irreversible.
                  </AlertDescription>
                </Alert>
              )}

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
            </div>
          )}

          {isRestoring && restoreProgress && (
            <div className="space-y-2">
              <Progress value={restoreProgressPercent} />
              <p className="text-xs text-muted-foreground">
                Procesando {restoreProgress.currentTable.replace('tab_', '')}...
                ({restoreProgress.recordsProcessed}/{restoreProgress.totalRecords} registros)
              </p>
            </div>
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
