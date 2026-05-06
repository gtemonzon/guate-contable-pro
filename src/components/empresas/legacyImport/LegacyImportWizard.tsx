import { useEffect, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Upload, CheckCircle2, AlertCircle, Loader2, Info, Trash2 } from "lucide-react";
import { parseLegacyFile } from "./parser";
import { ParsedDataset } from "./types";
import { supabase } from "@/integrations/supabase/client";

interface LegacyImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enterpriseId: number;
  enterpriseName: string;
}

type Step = 1 | 2 | 3 | 4;

interface JobRow {
  id: string;
  status: string;
  current_step: string | null;
  current_count: number;
  total_count: number;
  errors: string[];
  result: any;
  error_message: string | null;
  finished_at: string | null;
  updated_at?: string | null;
  started_at?: string | null;
}

export function LegacyImportWizard({ open, onOpenChange, enterpriseId, enterpriseName }: LegacyImportWizardProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>(1);
  const [, setFile] = useState<File | null>(null);
  const [dataset, setDataset] = useState<ParsedDataset | null>(null);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState<JobRow | null>(null);
  const [clearing, setClearing] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [now, setNow] = useState(Date.now());

  // tick cada segundo cuando hay job activo (para mostrar segundos desde última actualización)
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [open]);

  const handleResume = async () => {
    if (!job?.id) return;
    setResuming(true);
    try {
      await supabase.functions.invoke("legacy-import-runner", { body: { jobId: job.id } });
      toast({ title: "Reanudado", description: "Se solicitó al servidor continuar el proceso." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "No se pudo reanudar", description: e.message });
    } finally {
      setResuming(false);
    }
  };

  const reset = () => {
    setStep(1);
    setFile(null);
    setDataset(null);
    setJob(null);
  };

  // Buscar job activo de la empresa al abrir
  const fetchActiveJob = useCallback(async () => {
    const { data } = await supabase
      .from("tab_legacy_import_jobs")
      .select("id, status, current_step, current_count, total_count, errors, result, error_message, finished_at, updated_at, started_at")
      .eq("enterprise_id", enterpriseId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data && (data.status === "running" || data.status === "pending")) {
      setJob(data as JobRow);
      setStep(4);
    } else if (data && (data.status === "completed" || data.status === "failed")) {
      // Mostrar último resultado solo si fue muy reciente (<10 min)
      const finished = data.finished_at ? new Date(data.finished_at).getTime() : 0;
      if (Date.now() - finished < 10 * 60 * 1000) {
        setJob(data as JobRow);
        setStep(4);
      }
    }
  }, [enterpriseId]);

  useEffect(() => {
    if (open) fetchActiveJob();
  }, [open, fetchActiveJob]);

  // Realtime: suscribirse al job activo
  useEffect(() => {
    if (!job?.id) return;
    const channel = supabase
      .channel(`legacy-job-${job.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tab_legacy_import_jobs", filter: `id=eq.${job.id}` },
        (payload) => {
          setJob((prev) => ({ ...(prev as JobRow), ...(payload.new as any) }));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [job?.id]);

  const handleClose = () => {
    // Permitir cerrar siempre — el proceso continúa en backend
    onOpenChange(false);
    // No resetear si hay job en curso (para que al reabrir mantengamos contexto)
    if (!job || job.status === "completed" || job.status === "failed") {
      reset();
    }
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
    setSubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("No hay sesión");

      // tenant_id de la empresa
      const { data: ent } = await supabase
        .from("tab_enterprises")
        .select("tenant_id")
        .eq("id", enterpriseId)
        .single();
      if (!ent) throw new Error("Empresa no encontrada");

      // Subir el dataset (potencialmente grande) a Storage para evitar timeouts del INSERT JSONB
      const payloadPath = `${userData.user.id}/${enterpriseId}-${Date.now()}.json`;
      const payloadBlob = new Blob([JSON.stringify(dataset)], { type: "application/json" });
      const { error: upErr } = await supabase.storage
        .from("legacy-imports")
        .upload(payloadPath, payloadBlob, { contentType: "application/json", upsert: true });
      if (upErr) throw new Error(`No se pudo subir el archivo de importación: ${upErr.message}`);

      // Crear job (sin payload inline — solo la ruta)
      const { data: jobData, error: jobErr } = await supabase
        .from("tab_legacy_import_jobs")
        .insert({
          enterprise_id: enterpriseId,
          tenant_id: (ent as any).tenant_id,
          created_by: userData.user.id,
          payload_path: payloadPath,
          status: "pending",
        })
        .select("*")
        .single();
      if (jobErr || !jobData) throw jobErr ?? new Error("No se pudo crear el job");

      setJob(jobData as JobRow);
      setStep(4);

      // Disparar edge function (fire-and-forget — no esperamos)
      supabase.functions.invoke("legacy-import-runner", {
        body: { jobId: jobData.id },
      }).catch((e) => {
        console.error("Error invocando runner", e);
      });

      toast({
        title: "Importación iniciada",
        description: "El proceso continuará en segundo plano. Puedes cerrar esta ventana.",
      });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error al iniciar importación", description: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClearEnterpriseData = async () => {
    const confirmed = window.confirm(`¿Borrar los datos importados de ${enterpriseName} para volver a probar?`);
    if (!confirmed) return;

    setClearing(true);
    try {
      const { error } = await supabase.functions.invoke("legacy-import-runner", {
        body: {
          action: "clear",
          enterpriseId,
        },
      });

      if (error) throw error;

      reset();
      await fetchActiveJob();
      toast({
        title: "Datos borrados",
        description: "La empresa quedó limpia para una nueva prueba de importación.",
      });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Error al borrar datos",
        description: e.message,
      });
    } finally {
      setClearing(false);
    }
  };

  const isRunning = job?.status === "running" || job?.status === "pending";
  const isDone = job?.status === "completed";
  const isFailed = job?.status === "failed";
  const result = job?.result;

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
          {/* PASO 1 */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button variant="destructive" onClick={handleClearEnterpriseData} disabled={parsing || clearing}>
                  {clearing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                  Borrar datos de la empresa
                </Button>
              </div>
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
                  <li><code>tbl_cuentas</code> — Catálogo de cuentas</li>
                  <li><code>tbl_compras</code> — Libro de compras</li>
                  <li><code>tbl_ventas</code> — Libro de ventas</li>
                  <li><code>tbl_diario</code> + <code>tbl_diario_Detalle</code> — Partidas</li>
                  <li><code>tbl_grupoActivos</code> + <code>tbl_ActivosFijo</code> — Activos fijos</li>
                </ul>
              </div>
            </div>
          )}

          {/* PASO 2 */}
          {step === 2 && dataset && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button variant="destructive" onClick={handleClearEnterpriseData} disabled={clearing}>
                  {clearing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                  Borrar datos de la empresa
                </Button>
              </div>
              {(() => {
                const years = Array.from(new Set(
                  dataset.journalEntries
                    .map((e) => (e.date || "").slice(0, 4))
                    .filter((y) => /^\d{4}$/.test(y))
                )).sort();
                const yearsLabel = years.length > 0 ? `[${years.join(", ")}]` : "—";
                return (
                  <div className="grid grid-cols-3 gap-2 text-center text-sm">
                    <Card><CardContent className="p-3"><div className="text-2xl font-bold">{dataset.accounts.length}</div><div className="text-xs text-muted-foreground">Cuentas</div></CardContent></Card>
                    <Card><CardContent className="p-3"><div className="text-2xl font-bold">{dataset.purchases.length}</div><div className="text-xs text-muted-foreground">Compras</div></CardContent></Card>
                    <Card><CardContent className="p-3"><div className="text-2xl font-bold">{dataset.sales.length}</div><div className="text-xs text-muted-foreground">Ventas</div></CardContent></Card>
                    <Card><CardContent className="p-3"><div className="text-2xl font-bold">{dataset.journalEntries.length}</div><div className="text-xs text-muted-foreground">Partidas</div></CardContent></Card>
                    <Card><CardContent className="p-3"><div className="text-2xl font-bold">{years.length}</div><div className="text-xs text-muted-foreground">Períodos {yearsLabel}</div></CardContent></Card>
                    <Card><CardContent className="p-3"><div className="text-2xl font-bold">{dataset.assetCategories.length}</div><div className="text-xs text-muted-foreground">Grupos activos</div></CardContent></Card>
                    <Card><CardContent className="p-3"><div className="text-2xl font-bold">{dataset.fixedAssets.length}</div><div className="text-xs text-muted-foreground">Activos fijos</div></CardContent></Card>
                  </div>
                );
              })()}

              <Card>
                <CardContent className="p-4 text-sm space-y-1">
                  <div>📒 Catálogo: <strong>{dataset.accounts.length} cuentas</strong>.</div>
                  <div>🧾 Diario: solo líneas con <strong>mostrar = Verdadero</strong>.</div>
                  <div>🏬 Sucursales: <strong>{dataset.hasBranches ? "detectadas" : "no, asignadas a sucursal única"}</strong>.</div>
                </CardContent>
              </Card>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(1)}>Atrás</Button>
                <Button onClick={() => setStep(3)}>Continuar</Button>
              </div>
            </div>
          )}

          {/* PASO 3 */}
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
                </div>
              </ScrollArea>
              <div className="flex justify-between gap-2">
                <div>
                  <Button variant="destructive" onClick={handleClearEnterpriseData} disabled={submitting || clearing}>
                    {clearing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                    Borrar datos de la empresa
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(2)}>Atrás</Button>
                  <Button onClick={handleImport} disabled={submitting || clearing}>
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Importar todo
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* PASO 4: Job en curso o resultado */}
          {step === 4 && (
            <div className="space-y-4">
              {!job && (
                <div className="text-center text-sm text-muted-foreground py-8">
                  No hay importaciones recientes para esta empresa.
                </div>
              )}
              {isRunning && job && (
                <>
                  <div className="flex items-start gap-2 p-3 rounded bg-muted text-xs">
                    <Info className="h-4 w-4 shrink-0 mt-0.5" />
                    <div>
                      Este proceso corre en <strong>segundo plano en el servidor</strong>. Puedes cerrar esta ventana o el navegador
                      — incluso seguir desde otro equipo o tu celular abriendo nuevamente "Importar datos legado" en esta empresa.
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">{job.current_step ?? "Iniciando..."}</p>
                    <Progress value={job.total_count > 0 ? (job.current_count / job.total_count) * 100 : 0} />
                    <p className="text-xs text-muted-foreground text-center">
                      {job.current_count} / {job.total_count}
                    </p>
                  </div>
                  <div className="flex justify-between gap-2">
                    <Button variant="destructive" onClick={handleClearEnterpriseData} disabled={clearing}>
                      {clearing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                      Borrar datos de la empresa
                    </Button>
                    <Button variant="outline" onClick={handleClose}>Cerrar (sigue en segundo plano)</Button>
                  </div>
                </>
              )}
              {(isDone || isFailed) && job && (
                <div className="space-y-3">
                  <div className={`flex items-center gap-2 ${isDone ? "text-success" : "text-destructive"}`}>
                    {isDone ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
                    <span className="font-semibold">
                      {isDone ? "Importación finalizada" : "Importación con error"}
                    </span>
                  </div>
                  {isFailed && job.error_message && (
                    <Card><CardContent className="p-3 text-sm text-destructive">{job.error_message}</CardContent></Card>
                  )}
                  {result && (
                    <Card>
                      <CardContent className="p-4 grid grid-cols-2 gap-2 text-sm">
                        <div>Cuentas: <strong>{result.accountsCreated}</strong></div>
                        <div>Períodos: <strong>{result.periodsCreated}</strong></div>
                        <div>Compras: <strong>{result.purchasesCreated}</strong></div>
                        <div>Ventas: <strong>{result.salesCreated}</strong></div>
                        <div>Partidas creadas: <strong>{result.journalEntriesCreated}</strong></div>
                        <div>Publicadas: <strong>{result.journalEntriesPosted}</strong></div>
                        <div>Borrador: <strong>{result.journalEntriesAsDraft}</strong></div>
                        <div>Grupos activos: <strong>{result.assetCategoriesCreated}</strong></div>
                        <div>Activos fijos: <strong>{result.fixedAssetsCreated}</strong></div>
                      </CardContent>
                    </Card>
                  )}
                  {job.errors && job.errors.length > 0 && (
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 text-destructive mb-2">
                          <AlertCircle className="h-4 w-4" />
                          <span className="font-medium">{job.errors.length} avisos/errores</span>
                        </div>
                        <ScrollArea className="h-32">
                          <ul className="text-xs space-y-1">
                            {job.errors.slice(0, 100).map((e, i) => (<li key={i}>• {e}</li>))}
                          </ul>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  )}
                  <div className="flex justify-between gap-2">
                    <Button variant="destructive" onClick={handleClearEnterpriseData} disabled={clearing}>
                      {clearing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                      Borrar datos de la empresa
                    </Button>
                    <div className="flex gap-2">
                    <Button variant="outline" onClick={() => { reset(); }}>Nueva importación</Button>
                    <Button onClick={handleClose}>Cerrar</Button>
                    </div>
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
