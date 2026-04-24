import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, RefreshCw, AlertCircle, TrendingUp, TrendingDown, Sparkles, Info, Undo2, History, CheckCircle2 } from "lucide-react";
import { useFxRevaluation, type FxRevaluationPreview } from "@/hooks/useFxRevaluation";
import { formatCurrency } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enterpriseId: number;
  defaultYear?: number;
  defaultMonth?: number;
  /** Callback al contabilizar exitosamente. Recibe el id de la partida generada. */
  onPosted?: (journalEntryId: number) => void;
}

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function FxRevaluationWizard({ open, onOpenChange, enterpriseId, defaultYear, defaultMonth, onPosted }: Props) {
  const today = new Date();
  const [year, setYear] = useState(defaultYear ?? today.getFullYear());
  const [month, setMonth] = useState(defaultMonth ?? today.getMonth() + 1);
  const [preview, setPreview] = useState<FxRevaluationPreview | null>(null);
  const [tab, setTab] = useState<"calculate" | "history">("calculate");
  type RunRow = { id: number; year: number; month: number; cutoff_date: string; total_gain: number | null; total_loss: number | null; reversed_at: string | null; tab_journal_entries?: { entry_number?: string } | null };
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const { loading, posting, buildPreview, postRevaluation, listRuns, reverseRun } = useFxRevaluation();

  const refreshRuns = async () => {
    setLoadingRuns(true);
    try {
      const data = await listRuns(enterpriseId);
      setRuns(data);
    } finally {
      setLoadingRuns(false);
    }
  };

  useEffect(() => {
    if (open && tab === "history") refreshRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab, enterpriseId]);

  const handleCalculate = async () => {
    const result = await buildPreview({ enterpriseId, year, month });
    setPreview(result);
  };

  const handlePost = async () => {
    if (!preview) return;
    const id = await postRevaluation(preview);
    if (id) {
      onPosted?.(id);
      onOpenChange(false);
      setPreview(null);
    }
  };

  const handleReverse = async (runId: number) => {
    const newId = await reverseRun(runId);
    if (newId) {
      await refreshRuns();
      onPosted?.(newId);
    }
  };

  const years = Array.from({ length: 6 }, (_, i) => today.getFullYear() - i);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            Revaluación Cambiaria — Diferencial NO Realizado
          </DialogTitle>
          <DialogDescription>
            Recalcula el saldo de cuentas monetarias en moneda extranjera a la tasa de cierre del mes.
            Genera una partida DIFC-NR contra las cuentas de diferencial cambiario no realizado configuradas.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "calculate" | "history")}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="calculate"><Sparkles className="h-4 w-4 mr-2" />Calcular nueva</TabsTrigger>
            <TabsTrigger value="history"><History className="h-4 w-4 mr-2" />Historial y reverso</TabsTrigger>
          </TabsList>

          <TabsContent value="calculate" className="space-y-4 mt-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>¿Qué cuentas se revalúan?</AlertTitle>
              <AlertDescription className="text-xs">
                Solo cuentas marcadas como <strong>"Cuenta monetaria"</strong> en el catálogo (bancos, cuentas por cobrar/pagar en ME).
                Activos fijos, inventarios y capital <strong>no se revalúan</strong> (norma SAT - Decreto 26-92).
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Año</Label>
                <Select value={String(year)} onValueChange={(v) => { setYear(Number(v)); setPreview(null); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Mes de cierre</Label>
                <Select value={String(month)} onValueChange={(v) => { setMonth(Number(v)); setPreview(null); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={handleCalculate} disabled={loading} className="w-full">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  Calcular Diferencial
                </Button>
              </div>
            </div>

            {preview && (
              <div className="space-y-4">
                {preview.rows.length === 0 ? (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Sin diferencial que registrar</AlertTitle>
                    <AlertDescription>
                      No hay cuentas monetarias con saldo en moneda extranjera al {preview.cutoff_date},
                      o no se encontraron tipos de cambio del mes para revaluar.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <SummaryCard label="Ganancia total" value={preview.total_gain} icon={TrendingUp} positive />
                      <SummaryCard label="Pérdida total" value={preview.total_loss} icon={TrendingDown} negative />
                      <SummaryCard label="Efecto neto" value={preview.net_effect} icon={RefreshCw} positive={preview.net_effect >= 0} negative={preview.net_effect < 0} />
                    </div>

                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Cuenta</TableHead>
                            <TableHead>Mon.</TableHead>
                            <TableHead className="text-right">Saldo ME</TableHead>
                            <TableHead className="text-right">Tasa hist.</TableHead>
                            <TableHead className="text-right">Tasa cierre</TableHead>
                            <TableHead className="text-right">Saldo libros ({preview.base_currency})</TableHead>
                            <TableHead className="text-right">Saldo revaluado</TableHead>
                            <TableHead className="text-right">Diferencial</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {preview.rows.map(r => (
                            <TableRow key={`${r.account_id}-${r.currency_code}`}>
                              <TableCell className="font-medium">
                                <div className="text-xs text-muted-foreground">{r.account_code}</div>
                                <div className="text-sm">{r.account_name}</div>
                              </TableCell>
                              <TableCell><Badge variant="outline">{r.currency_code}</Badge></TableCell>
                              <TableCell className="text-right font-mono">{formatCurrency(r.fx_balance)}</TableCell>
                              <TableCell className="text-right font-mono text-muted-foreground">{r.current_rate.toFixed(4)}</TableCell>
                              <TableCell className="text-right font-mono">{r.cutoff_rate.toFixed(4)}</TableCell>
                              <TableCell className="text-right font-mono">{formatCurrency(r.book_functional_balance)}</TableCell>
                              <TableCell className="text-right font-mono">{formatCurrency(r.revalued_functional_balance)}</TableCell>
                              <TableCell className={`text-right font-mono font-semibold ${r.delta >= 0 ? "text-success" : "text-destructive"}`}>
                                {r.delta >= 0 ? "+" : ""}{formatCurrency(r.delta)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        Al confirmar se generará la partida <strong>DIFC-{preview.year}-{String(preview.month).padStart(2, "0")}-####</strong> con
                        {" "}{preview.rows.length * 2} líneas y se contabilizará automáticamente.
                        El diferencial NO realizado <strong>no afecta el cálculo del ISR</strong> (Decreto 10-2012 Art. 21).
                      </AlertDescription>
                    </Alert>
                  </>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-3 mt-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Reverso de revaluación NO realizada</AlertTitle>
              <AlertDescription className="text-xs">
                Las revaluaciones NO realizadas se reversan el <strong>primer día del mes siguiente</strong> al corte
                para no afectar saldos del nuevo período. El sistema genera una partida espejo automáticamente vinculada.
              </AlertDescription>
            </Alert>

            {loadingRuns ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando historial...
              </div>
            ) : runs.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground">
                No hay revaluaciones registradas todavía.
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Período</TableHead>
                      <TableHead>Corte</TableHead>
                      <TableHead>Partida</TableHead>
                      <TableHead className="text-right">Ganancia</TableHead>
                      <TableHead className="text-right">Pérdida</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.map((r) => {
                      const reversed = !!r.reversed_at;
                      return (
                        <TableRow key={r.id}>
                          <TableCell>{MONTHS[r.month - 1]} {r.year}</TableCell>
                          <TableCell className="font-mono text-xs">{r.cutoff_date}</TableCell>
                          <TableCell className="font-mono text-xs">{r.tab_journal_entries?.entry_number || "—"}</TableCell>
                          <TableCell className="text-right font-mono text-success">{formatCurrency(Number(r.total_gain || 0))}</TableCell>
                          <TableCell className="text-right font-mono text-destructive">{formatCurrency(Number(r.total_loss || 0))}</TableCell>
                          <TableCell>
                            {reversed ? (
                              <Badge variant="outline" className="gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Reversada
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Pendiente reverso</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant={reversed ? "ghost" : "outline"}
                              disabled={reversed || posting}
                              onClick={() => handleReverse(r.id)}
                            >
                              {posting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5 mr-1" />}
                              {reversed ? "Reversada" : "Reversar"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={posting}>Cerrar</Button>
          {tab === "calculate" && (
            <Button onClick={handlePost} disabled={!preview || preview.rows.length === 0 || posting}>
              {posting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Contabilizar Partida
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({ label, value, icon: Icon, positive, negative }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; positive?: boolean; negative?: boolean }) {
  const colorClass = positive ? "text-success" : negative ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className={`mt-1 text-xl font-bold font-mono ${colorClass}`}>
        {formatCurrency(value)}
      </div>
    </div>
  );
}
