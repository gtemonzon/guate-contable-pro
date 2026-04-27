import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Upload, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { parseLegacyFile } from "./parser";
import { importLegacyData, ImportProgress, ImportResult } from "./importer";
import { ParsedDataset } from "./types";

interface LegacyImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enterpriseId: number;
  enterpriseName: string;
}

type Step = 1 | 2 | 3 | 4;

export function LegacyImportWizard({ open, onOpenChange, enterpriseId, enterpriseName }: LegacyImportWizardProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>(1);
  const [, setFile] = useState<File | null>(null);
  const [dataset, setDataset] = useState<ParsedDataset | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress>({ step: "", current: 0, total: 0 });
  const [result, setResult] = useState<ImportResult | null>(null);

  const reset = () => {
    setStep(1);
    setFile(null);
    setDataset(null);
    setResult(null);
    setProgress({ step: "", current: 0, total: 0 });
  };

  const handleClose = () => {
    if (importing) return;
    reset();
    onOpenChange(false);
  };

  const handleFile = async (f: File) => {
    setFile(f);
    setParsing(true);
    try {
      const ds = await parseLegacyFile(f);
      setDataset(ds);
      setStep(2);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error al leer archivo", description: e.message });
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (!dataset) return;
    setImporting(true);
    setStep(4);
    try {
      const res = await importLegacyData(enterpriseId, dataset, setProgress);
      setResult(res);
      toast({ title: "Importación completa", description: `${res.journalEntriesCreated} partidas creadas` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error en importación", description: e.message });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Importación de datos legado</DialogTitle>
          <DialogDescription>
            Empresa: <strong>{enterpriseName}</strong> · Paso {step} de 4
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto min-h-0">
          {/* PASO 1: Subir archivo */}
          {step === 1 && (
            <div className="space-y-4">
              <Card>
                <CardContent className="p-6">
                  <div className="border-2 border-dashed rounded-lg p-8 text-center">
                    {parsing ? (
                      <div className="space-y-2">
                        <Loader2 className="h-12 w-12 mx-auto animate-spin text-primary" />
                        <p>Analizando archivo...</p>
                      </div>
                    ) : (
                      <>
                        <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <p className="text-sm mb-4">Sube el archivo .xlsx exportado del sistema legado</p>
                        <input
                          type="file"
                          accept=".xlsx,.xls"
                          id="legacy-file"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleFile(f);
                          }}
                        />
                        <label htmlFor="legacy-file">
                          <Button variant="outline" asChild><span>Seleccionar archivo</span></Button>
                        </label>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
              <div className="text-xs text-muted-foreground">
                <p className="font-medium mb-1">Hojas reconocidas:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li><code>tbl_cuentas</code> — Catálogo de cuentas (se importan todas)</li>
                  <li><code>tbl_compras</code> — Libro de compras</li>
                  <li><code>tbl_ventas</code> — Libro de ventas (con sucursales si existen)</li>
                  <li><code>tbl_diario</code> + <code>tbl_diario_Detalle</code> — Partidas (solo líneas con <code>mostrar=Verdadero</code>)</li>
                  <li><code>tbl_grupoActivos</code> + <code>tbl_ActivosFijo</code> — Activos fijos</li>
                </ul>
              </div>
            </div>
          )}

          {/* PASO 2: Resumen detectado */}
          {step === 2 && dataset && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <Card><CardContent className="p-3"><div className="text-2xl font-bold">{dataset.accounts.length}</div><div className="text-xs text-muted-foreground">Cuentas</div></CardContent></Card>
                <Card><CardContent className="p-3"><div className="text-2xl font-bold">{dataset.purchases.length}</div><div className="text-xs text-muted-foreground">Compras</div></CardContent></Card>
                <Card><CardContent className="p-3"><div className="text-2xl font-bold">{dataset.sales.length}</div><div className="text-xs text-muted-foreground">Ventas</div></CardContent></Card>
                <Card><CardContent className="p-3"><div className="text-2xl font-bold">{dataset.journalEntries.length}</div><div className="text-xs text-muted-foreground">Partidas</div></CardContent></Card>
                <Card><CardContent className="p-3"><div className="text-2xl font-bold">{dataset.assetCategories.length}</div><div className="text-xs text-muted-foreground">Grupos activos</div></CardContent></Card>
                <Card><CardContent className="p-3"><div className="text-2xl font-bold">{dataset.fixedAssets.length}</div><div className="text-xs text-muted-foreground">Activos fijos</div></CardContent></Card>
              </div>

              <Card>
                <CardContent className="p-4 text-sm space-y-1">
                  <div>📒 Catálogo de cuentas: <strong>se importará completo</strong> ({dataset.accounts.length} cuentas).</div>
                  <div>🧾 Diario: solo se incluyen líneas con <strong>mostrar = Verdadero</strong> (cuentas de movimiento).</div>
                  <div>🏬 Sucursales en ventas: <strong>{dataset.hasBranches ? "detectadas" : "no, todas se asignan a la única sucursal"}</strong>.</div>
                </CardContent>
              </Card>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(1)}>Atrás</Button>
                <Button onClick={() => setStep(3)}>Continuar</Button>
              </div>
            </div>
          )}

          {/* PASO 3: Vista previa */}
          {step === 3 && dataset && (
            <div className="space-y-3">
              <h3 className="font-semibold">Vista previa</h3>
              <ScrollArea className="h-72 border rounded">
                <div className="p-3 space-y-3 text-xs">
                  <div>
                    <p className="font-medium mb-1">Compras (primeros 5 de {dataset.purchases.length}):</p>
                    {dataset.purchases.slice(0, 5).map((p, i) => (
                      <div key={i} className="flex gap-2 border-b py-1">
                        <span className="w-20">{p.date}</span>
                        <span className="w-16">{p.felDocType}</span>
                        <span className="w-24">{p.supplierNit}</span>
                        <span className="flex-1 truncate">{p.supplierName}</span>
                        <span className="font-mono">Q{p.totalAmount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="font-medium mb-1">Ventas (primeros 5 de {dataset.sales.length}):</p>
                    {dataset.sales.slice(0, 5).map((s, i) => (
                      <div key={i} className="flex gap-2 border-b py-1">
                        <span className="w-20">{s.date}</span>
                        <span className="w-16">{s.felDocType}</span>
                        <span className="w-24">{s.customerNit}</span>
                        <span className="flex-1 truncate">{s.customerName}{s.branchCode ? ` [Suc.${s.branchCode}]` : ""}</span>
                        <span className="font-mono">Q{s.totalAmount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="font-medium mb-1">Partidas (primeras 3):</p>
                    {dataset.journalEntries.slice(0, 3).map((e, i) => {
                      const td = e.lines.reduce((s, l) => s + l.debit, 0);
                      const tc = e.lines.reduce((s, l) => s + l.credit, 0);
                      const balanced = Math.abs(td - tc) < 0.01;
                      return (
                        <div key={i} className="border rounded p-2 mb-1">
                          <div className="flex justify-between mb-1">
                            <span className="font-medium">{e.date} · {e.description.slice(0, 60)}</span>
                            <Badge variant={balanced ? "default" : "destructive"}>{balanced ? "Cuadrada" : `Δ ${(td - tc).toFixed(2)}`}</Badge>
                          </div>
                          {e.lines.slice(0, 4).map((l, j) => (
                            <div key={j} className="grid grid-cols-12 gap-1 text-[11px]">
                              <span className="col-span-2 font-mono">{l.accountCode}</span>
                              <span className="col-span-7 truncate">{l.description}</span>
                              <span className="col-span-2 text-right font-mono">{l.debit > 0 ? l.debit.toFixed(2) : ""}</span>
                              <span className="col-span-1 text-right font-mono">{l.credit > 0 ? l.credit.toFixed(2) : ""}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                  {dataset.fixedAssets.length > 0 && (
                    <div>
                      <p className="font-medium mb-1">Activos fijos (primeros 5 de {dataset.fixedAssets.length}):</p>
                      {dataset.fixedAssets.slice(0, 5).map((a, i) => (
                        <div key={i} className="flex gap-2 border-b py-1">
                          <span className="w-20 font-mono">{a.code}</span>
                          <span className="flex-1 truncate">{a.name}</span>
                          <span className="font-mono">Q{a.cost.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </ScrollArea>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(2)}>Atrás</Button>
                <Button onClick={handleImport}>Importar todo</Button>
              </div>
            </div>
          )}

          {/* PASO 4: Importando / Resultado */}
          {step === 4 && (
            <div className="space-y-4">
              {importing && (
                <div className="space-y-2">
                  <p className="text-sm">{progress.step}</p>
                  <Progress value={progress.total > 0 ? (progress.current / progress.total) * 100 : 0} />
                  <p className="text-xs text-muted-foreground text-center">{progress.current} / {progress.total}</p>
                </div>
              )}
              {result && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-success">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="font-semibold">Importación finalizada</span>
                  </div>
                  <Card>
                    <CardContent className="p-4 grid grid-cols-2 gap-2 text-sm">
                      <div>Cuentas: <strong>{result.accountsCreated}</strong></div>
                      <div>Períodos: <strong>{result.periodsCreated}</strong></div>
                      <div>Compras: <strong>{result.purchasesCreated}</strong></div>
                      <div>Ventas: <strong>{result.salesCreated}</strong></div>
                      <div>Partidas creadas: <strong>{result.journalEntriesCreated}</strong></div>
                      <div>Publicadas: <strong>{result.journalEntriesPosted}</strong></div>
                      <div>Borrador (descuadradas): <strong>{result.journalEntriesAsDraft}</strong></div>
                      <div>Grupos activos: <strong>{result.assetCategoriesCreated}</strong></div>
                      <div>Activos fijos: <strong>{result.fixedAssetsCreated}</strong></div>
                    </CardContent>
                  </Card>
                  {result.errors.length > 0 && (
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 text-destructive mb-2">
                          <AlertCircle className="h-4 w-4" />
                          <span className="font-medium">{result.errors.length} errores</span>
                        </div>
                        <ScrollArea className="h-32">
                          <ul className="text-xs space-y-1">
                            {result.errors.slice(0, 50).map((e, i) => (<li key={i}>• {e}</li>))}
                          </ul>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  )}
                  <div className="flex justify-end">
                    <Button onClick={handleClose}>Cerrar</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
