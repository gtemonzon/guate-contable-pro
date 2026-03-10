import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Search,
  Trash2,
  ChevronDown,
  Clock,
  Database,
  Globe,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { validateNIT, sanitizeNIT } from "@/utils/nitValidation";
import { supabase } from "@/integrations/supabase/client";

interface NitLookupTesterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface StepResult {
  step: string;
  label: string;
  status: "pending" | "running" | "success" | "error" | "skipped";
  message: string;
  detail?: string;
  durationMs?: number;
}

export function NitLookupTester({ open, onOpenChange }: NitLookupTesterProps) {
  const [nit, setNit] = useState("");
  const [searching, setSearching] = useState(false);
  const [steps, setSteps] = useState<StepResult[]>([]);
  const [rawResponse, setRawResponse] = useState<any>(null);
  const [totalDuration, setTotalDuration] = useState<number | null>(null);
  const [rawOpen, setRawOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const updateStep = (
    index: number,
    update: Partial<StepResult>,
    setter: React.Dispatch<React.SetStateAction<StepResult[]>>
  ) => {
    setter((prev) => prev.map((s, i) => (i === index ? { ...s, ...update } : s)));
  };

  const handleSearch = async () => {
    const cleaned = sanitizeNIT(nit).trim().toUpperCase();
    setRawResponse(null);
    setTotalDuration(null);
    setRawOpen(false);

    const initialSteps: StepResult[] = [
      { step: "validation", label: "Validación de formato", status: "pending", message: "" },
      { step: "cache", label: "Caché local (base de datos)", status: "pending", message: "" },
      { step: "history", label: "Historial de compras/ventas", status: "pending", message: "" },
      { step: "guatecompras", label: "Consulta Guatecompras", status: "pending", message: "" },
    ];
    setSteps(initialSteps);
    setSearching(true);

    const globalStart = performance.now();

    // Step 1: Validation
    updateStep(0, { status: "running", message: "Validando formato..." }, setSteps as any);
    await delay(200);

    if (!cleaned || cleaned.length < 2) {
      updateStep(0, { status: "error", message: "NIT vacío o muy corto" }, setSteps as any);
      setSearching(false);
      setTotalDuration(performance.now() - globalStart);
      return;
    }

    if (cleaned === "CF") {
      updateStep(0, { status: "success", message: "NIT válido: CF (Consumidor Final)" }, setSteps as any);
      updateStep(1, { status: "skipped", message: "CF resuelto automáticamente" }, setSteps as any);
      updateStep(2, { status: "skipped", message: "No aplica" }, setSteps as any);
      updateStep(3, { status: "skipped", message: "No aplica" }, setSteps as any);
      setRawResponse({ nit: "CF", name: "Consumidor Final", source: "system", found: true });
      setSearching(false);
      setTotalDuration(performance.now() - globalStart);
      return;
    }

    if (!validateNIT(nit)) {
      updateStep(0, { status: "error", message: `Formato inválido: "${cleaned}"`, detail: "El dígito verificador no coincide con el algoritmo Módulo 11." }, setSteps as any);
      setSteps((prev) => prev.map((s, i) => (i > 0 ? { ...s, status: "skipped" as const, message: "Omitido por NIT inválido" } : s)));
      setSearching(false);
      setTotalDuration(performance.now() - globalStart);
      return;
    }

    updateStep(0, { status: "success", message: `NIT válido: ${cleaned}` }, setSteps as any);

    // Step 2: Local cache
    updateStep(1, { status: "running", message: "Buscando en caché local..." }, setSteps as any);
    const cacheStart = performance.now();
    try {
      const { data: cached, error: cacheError } = await supabase
        .from("taxpayer_cache")
        .select("name, source, last_checked")
        .eq("nit", cleaned)
        .maybeSingle();

      const cacheDuration = Math.round(performance.now() - cacheStart);

      if (cacheError) {
        updateStep(1, {
          status: "error",
          message: `Error de base de datos: ${cacheError.message}`,
          durationMs: cacheDuration,
        }, setSteps as any);
      } else if (cached) {
        updateStep(1, {
          status: "success",
          message: `Encontrado: ${cached.name}`,
          detail: `Fuente: ${cached.source} | Última verificación: ${cached.last_checked}`,
          durationMs: cacheDuration,
        }, setSteps as any);
        updateStep(2, { status: "skipped", message: "No necesario (encontrado en caché)" }, setSteps as any);
        updateStep(3, { status: "skipped", message: "No necesario (encontrado en caché)" }, setSteps as any);
        setRawResponse({ nit: cleaned, name: cached.name, source: cached.source, found: true, last_checked: cached.last_checked });
        setSearching(false);
        setTotalDuration(performance.now() - globalStart);
        return;
      } else {
        updateStep(1, {
          status: "error",
          message: "No encontrado en caché",
          durationMs: cacheDuration,
        }, setSteps as any);
      }
    } catch (err: any) {
      updateStep(1, { status: "error", message: `Error: ${err.message}` }, setSteps as any);
    }

    // Step 3: Purchase/Sales history
    updateStep(2, { status: "running", message: "Buscando en historial local..." }, setSteps as any);
    const histStart = performance.now();
    try {
      const { data: purchaseMatch } = await supabase
        .from("tab_purchase_ledger")
        .select("supplier_name")
        .eq("supplier_nit", cleaned)
        .not("supplier_name", "eq", "")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (purchaseMatch?.supplier_name) {
        const histDuration = Math.round(performance.now() - histStart);
        updateStep(2, {
          status: "success",
          message: `Encontrado en compras: ${purchaseMatch.supplier_name}`,
          durationMs: histDuration,
        }, setSteps as any);
        updateStep(3, { status: "skipped", message: "No necesario (encontrado en historial)" }, setSteps as any);
        setRawResponse({ nit: cleaned, name: purchaseMatch.supplier_name, source: "Historial local (compras)", found: true });
        setSearching(false);
        setTotalDuration(performance.now() - globalStart);
        return;
      }

      const { data: salesMatch } = await supabase
        .from("tab_sales_ledger")
        .select("customer_name")
        .eq("customer_nit", cleaned)
        .not("customer_name", "eq", "")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const histDuration = Math.round(performance.now() - histStart);
      if (salesMatch?.customer_name) {
        updateStep(2, {
          status: "success",
          message: `Encontrado en ventas: ${salesMatch.customer_name}`,
          durationMs: histDuration,
        }, setSteps as any);
        updateStep(3, { status: "skipped", message: "No necesario (encontrado en historial)" }, setSteps as any);
        setRawResponse({ nit: cleaned, name: salesMatch.customer_name, source: "Historial local (ventas)", found: true });
        setSearching(false);
        setTotalDuration(performance.now() - globalStart);
        return;
      }

      updateStep(2, {
        status: "error",
        message: "No encontrado en historial",
        durationMs: histDuration,
      }, setSteps as any);
    } catch (err: any) {
      updateStep(2, { status: "error", message: `Error: ${err.message}` }, setSteps as any);
    }

    // Step 4: Guatecompras
    updateStep(3, { status: "running", message: "Consultando Guatecompras..." }, setSteps as any);
    const gcStart = performance.now();
    try {
      const { data, error } = await supabase.functions.invoke("lookup-nit", {
        body: { nit: cleaned },
      });

      const gcDuration = Math.round(performance.now() - gcStart);

      if (error) {
        updateStep(3, {
          status: "error",
          message: `Error de Edge Function: ${error.message}`,
          durationMs: gcDuration,
        }, setSteps as any);
        setRawResponse({ error: error.message });
      } else if (data?.found) {
        updateStep(3, {
          status: "success",
          message: `Encontrado: ${data.name}`,
          detail: `Fuente: ${data.source}`,
          durationMs: gcDuration,
        }, setSteps as any);
        setRawResponse(data);
      } else {
        updateStep(3, {
          status: "error",
          message: "No encontrado en Guatecompras",
          durationMs: gcDuration,
        }, setSteps as any);
        setRawResponse(data || { found: false });
      }
    } catch (err: any) {
      const satDuration = Math.round(performance.now() - satStart);
      let errorMsg = err.message || "Error desconocido";
      if (err.name === "AbortError" || errorMsg.includes("timeout")) {
        errorMsg = "Timeout: SAT FEL no respondió en el tiempo esperado";
      } else if (errorMsg.includes("Failed to fetch") || errorMsg.includes("NetworkError")) {
        errorMsg = "Error de conexión: No se pudo contactar al servidor";
      }
      updateStep(3, {
        status: "error",
        message: errorMsg,
        durationMs: satDuration,
      }, setSteps as any);
      setRawResponse({ error: errorMsg });
    }

    setSearching(false);
    setTotalDuration(performance.now() - globalStart);
  };

  const handleClear = () => {
    setNit("");
    setSteps([]);
    setRawResponse(null);
    setTotalDuration(null);
    setRawOpen(false);
    inputRef.current?.focus();
  };

  const getStepIcon = (status: StepResult["status"]) => {
    switch (status) {
      case "pending":
        return <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />;
      case "running":
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case "error":
        return <XCircle className="h-4 w-4 text-destructive" />;
      case "skipped":
        return <div className="h-4 w-4 rounded-full bg-muted-foreground/20" />;
    }
  };

  const getStepIconLabel = (step: string) => {
    switch (step) {
      case "validation":
        return <Search className="h-3.5 w-3.5 text-muted-foreground" />;
      case "cache":
        return <Database className="h-3.5 w-3.5 text-muted-foreground" />;
      case "history":
        return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
      case "sat":
        return <Globe className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const foundResult = rawResponse?.found
    ? { name: rawResponse.name, source: rawResponse.source }
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            NIT Lookup Tester
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* NIT Input */}
          <div className="space-y-1.5">
            <Label htmlFor="nit-test-input">NIT</Label>
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                id="nit-test-input"
                value={nit}
                onChange={(e) => setNit(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !searching) handleSearch();
                }}
                placeholder="Ej: 1234567, CF"
                className="font-mono"
                autoFocus
              />
              <Button onClick={handleSearch} disabled={searching || !nit.trim()} size="sm">
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Buscar
              </Button>
              <Button variant="outline" size="sm" onClick={handleClear} disabled={searching}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Result summary */}
          {foundResult && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-1">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                <span className="font-semibold text-sm">{foundResult.name}</span>
              </div>
              <div className="flex items-center gap-2 ml-7">
                <Badge variant="outline" className="text-[10px]">{foundResult.source}</Badge>
                {totalDuration !== null && (
                  <span className="text-[10px] text-muted-foreground">{Math.round(totalDuration)} ms</span>
                )}
              </div>
            </div>
          )}

          {rawResponse && !rawResponse.found && !rawResponse.error && steps.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
              <span className="text-sm font-medium">Contribuyente no encontrado</span>
            </div>
          )}

          {/* Steps */}
          {steps.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Diagnóstico paso a paso</Label>
              <div className="space-y-2">
                {steps.map((step, idx) => (
                  <div
                    key={step.step}
                    className={cn(
                      "flex items-start gap-2.5 p-2 rounded-md text-sm",
                      step.status === "success" && "bg-emerald-500/5",
                      step.status === "error" && "bg-destructive/5",
                      step.status === "running" && "bg-primary/5",
                      step.status === "skipped" && "opacity-50"
                    )}
                  >
                    <div className="mt-0.5">{getStepIcon(step.status)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {getStepIconLabel(step.step)}
                        <span className="font-medium text-xs">{step.label}</span>
                        {step.durationMs !== undefined && (
                          <span className="text-[10px] text-muted-foreground ml-auto">{step.durationMs} ms</span>
                        )}
                      </div>
                      <p className={cn("text-xs mt-0.5", step.status === "error" ? "text-destructive" : "text-muted-foreground")}>
                        {step.message}
                      </p>
                      {step.detail && (
                        <p className="text-[10px] text-muted-foreground/70 mt-0.5">{step.detail}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Raw Response */}
          {rawResponse && (
            <Collapsible open={rawOpen} onOpenChange={setRawOpen}>
              <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", rawOpen && "rotate-180")} />
                Respuesta JSON (debug)
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="mt-2 rounded-md bg-muted p-3 text-[11px] font-mono overflow-x-auto max-h-48 overflow-y-auto">
                  {JSON.stringify(rawResponse, null, 2)}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
