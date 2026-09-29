import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { AlertTriangle, Ban, Info, Link2Off } from "lucide-react";

/** Resultado de void_bank_document / void_bank_document_number. */
export interface VoidBankDocumentResult {
  mode: "posted" | "draft" | "number_only";
  bank_document_id: number;
  document_number: string;
  original_entry_id?: number;
  original_entry_number?: string;
  reversal_entry_id?: number | null;
  reversal_entry_number?: string | null;
  replacement_entry_id?: number | null;
  replacement_entry_number?: string | null;
  replacement_document_number?: string | null;
  unlinked_purchase_ids?: number[];
  relinked_to_replacement?: boolean;
  warning?: string | null;
}

interface VoidChequeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Partida guardada (borrador o contabilizada). */
  entryId?: number | null;
  /** Formulario sin guardar: solo se anula el número. */
  formValues?: {
    enterpriseId: number;
    bankAccountId: number | null;
    bankReference: string;
    beneficiaryName: string;
    entryDate: string;
    description: string;
    bankDirection: string;
  };
  onSuccess: (result: VoidBankDocumentResult) => void;
}

interface EntryInfo {
  id: number;
  enterprise_id: number;
  entry_number: string;
  entry_date: string;
  description: string;
  status: string | null;
  is_posted: boolean | null;
  bank_account_id: number | null;
  bank_reference: string | null;
  beneficiary_name: string | null;
  bank_direction: string | null;
}

/** Fecha local (no UTC) en formato YYYY-MM-DD. */
function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function VoidChequeDialog({
  open,
  onOpenChange,
  entryId,
  formValues,
  onSuccess,
}: VoidChequeDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [entry, setEntry] = useState<EntryInfo | null>(null);
  const [purchaseCount, setPurchaseCount] = useState(0);
  const [reason, setReason] = useState("");
  const [voidDate, setVoidDate] = useState(todayLocal());
  const [createReplacement, setCreateReplacement] = useState(false);
  const [replacementNumber, setReplacementNumber] = useState("");
  const [replacementDate, setReplacementDate] = useState(todayLocal());

  const enterpriseId = entry?.enterprise_id ?? formValues?.enterpriseId ?? null;
  const bankAccountId = entry?.bank_account_id ?? formValues?.bankAccountId ?? null;
  const documentNumber = (entry?.bank_reference ?? formValues?.bankReference ?? "").trim();
  const beneficiary = entry?.beneficiary_name ?? formValues?.beneficiaryName ?? "";
  const docDate = entry?.entry_date ?? formValues?.entryDate ?? "";
  const concept = entry?.description ?? formValues?.description ?? "";
  const direction = entry?.bank_direction ?? formValues?.bankDirection ?? "OUT";
  const isSaved = !!entryId;
  const isPosted = !!entry && (entry.status === "contabilizado" || !!entry.is_posted);

  // Cargar la partida, contar facturas vinculadas y sugerir el número de reemplazo.
  useEffect(() => {
    if (!open) return;
    setReason("");
    setCreateReplacement(false);
    setReplacementNumber("");
    setPurchaseCount(0);
    setEntry(null);

    let cancelled = false;
    (async () => {
      setLoadingInfo(true);
      try {
        let info: EntryInfo | null = null;
        if (entryId) {
          const { data, error } = await supabase
            .from("tab_journal_entries")
            .select("id, enterprise_id, entry_number, entry_date, description, status, is_posted, bank_account_id, bank_reference, beneficiary_name, bank_direction")
            .eq("id", entryId)
            .single();
          if (error) throw error;
          info = data as EntryInfo;

          const posted = info.status === "contabilizado" || !!info.is_posted;
          if (posted) {
            // Mismo criterio que la función: vínculos + vínculos legados.
            const [{ data: links }, { data: legacy }] = await Promise.all([
              supabase.from("tab_purchase_journal_links").select("purchase_id").eq("journal_entry_id", entryId),
              supabase.from("tab_purchase_ledger").select("id").eq("journal_entry_id", entryId).is("deleted_at", null),
            ]);
            const ids = new Set<number>([
              ...(links || []).map((l) => Number(l.purchase_id)),
              ...(legacy || []).map((p) => Number(p.id)),
            ]);
            if (!cancelled) setPurchaseCount(ids.size);
          }
        }

        const baseDate = info?.entry_date ?? formValues?.entryDate ?? "";
        const today = todayLocal();
        const defaultVoidDate = baseDate && today < baseDate ? baseDate : today;

        const entId = info?.enterprise_id ?? formValues?.enterpriseId;
        const glId = info?.bank_account_id ?? formValues?.bankAccountId;
        let suggestion = "";
        if (entId && glId) {
          const { data: next } = await supabase.rpc("next_bank_document_number", {
            p_enterprise_id: entId,
            p_bank_gl_account_id: glId,
            p_direction: info?.bank_direction ?? formValues?.bankDirection ?? "OUT",
          });
          suggestion = next ?? "";
        }

        if (!cancelled) {
          setEntry(info);
          setVoidDate(defaultVoidDate);
          setReplacementDate(defaultVoidDate);
          setReplacementNumber(suggestion);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          toast({ title: "No se pudo cargar el documento", description: getSafeErrorMessage(err), variant: "destructive" });
        }
      } finally {
        if (!cancelled) setLoadingInfo(false);
      }
    })();
    return () => { cancelled = true; };
    // formValues se lee al abrir; no debe recargar en cada tecla del formulario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entryId]);

  const reasonValid = reason.trim().length >= 3;
  const voidDateValid = !!voidDate && (!docDate || voidDate >= docDate);
  // Número de reemplazo vacío = el servidor usa next_bank_document_number.
  const canSubmit = !loading && !loadingInfo && reasonValid && voidDateValid
    && !!documentNumber && !!enterpriseId && !!bankAccountId;

  const handleVoid = async () => {
    if (!canSubmit) return;
    try {
      setLoading(true);
      let result: VoidBankDocumentResult;

      if (isSaved) {
        const { data, error } = await supabase.rpc("void_bank_document", {
          p_entry_id: entryId!,
          p_void_date: voidDate,
          p_reason: reason.trim(),
          p_create_replacement: createReplacement,
          p_replacement_date: createReplacement && isPosted ? replacementDate : undefined,
          p_replacement_number: createReplacement && replacementNumber.trim() ? replacementNumber.trim() : undefined,
        });
        if (error) throw error;
        result = data as unknown as VoidBankDocumentResult;
      } else {
        const { data, error } = await supabase.rpc("void_bank_document_number", {
          p_enterprise_id: enterpriseId!,
          p_bank_gl_account_id: bankAccountId!,
          p_document_number: documentNumber,
          p_direction: direction,
          p_document_date: docDate,
          p_reason: reason.trim(),
          p_beneficiary_name: beneficiary || undefined,
          p_concept: concept || undefined,
          p_void_date: voidDate,
        });
        if (error) throw error;
        result = data as unknown as VoidBankDocumentResult;
      }

      const parts: string[] = [`Documento ${result.document_number} registrado como ANULADO.`];
      if (result.reversal_entry_number) parts.push(`Reversión ${result.reversal_entry_number} creada en borrador.`);
      if (result.replacement_entry_number && result.mode === "posted") {
        parts.push(`Borrador de reemplazo ${result.replacement_entry_number} (documento ${result.replacement_document_number}).`);
      } else if (result.replacement_document_number && result.mode === "draft") {
        parts.push(`La partida ahora usa el documento ${result.replacement_document_number}.`);
      }
      const unlinked = result.unlinked_purchase_ids?.length ?? 0;
      if (unlinked > 0) {
        parts.push(result.relinked_to_replacement
          ? `${unlinked} factura(s) re-vinculada(s) al reemplazo.`
          : `${unlinked} factura(s) desvinculada(s).`);
      }
      toast({ title: "Documento anulado", description: parts.join(" ") });
      if (result.warning) {
        toast({ title: "Atención", description: result.warning });
      }

      onOpenChange(false);
      onSuccess(result);
    } catch (error: unknown) {
      toast({ title: "Error al anular documento", description: getSafeErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!loading) onOpenChange(o); }}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
            <Ban className="h-5 w-5" />
            Anular documento
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4 pt-2 text-foreground">
              <div className="text-sm space-y-1 p-3 bg-muted rounded-lg">
                <p><span className="font-medium">Documento N°:</span> {documentNumber || <span className="text-muted-foreground italic">Sin número</span>}</p>
                <p><span className="font-medium">Fecha:</span> {formatDate(docDate)}</p>
                <p><span className="font-medium">Beneficiario:</span> {beneficiary || <span className="text-muted-foreground italic">Sin beneficiario</span>}</p>
                <p><span className="font-medium">Concepto:</span> {concept}</p>
                {entry && (
                  <p className="flex items-center gap-2">
                    <span className="font-medium">Partida:</span> {entry.entry_number}
                    <Badge variant={isPosted ? "default" : "secondary"} className="text-[10px]">
                      {isPosted ? "Contabilizada" : "Borrador"}
                    </Badge>
                  </p>
                )}
              </div>

              {isPosted ? (
                <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-800 dark:text-amber-300 space-y-1">
                    <p>
                      Se creará una <strong>partida de reversión en borrador</strong> con la fecha de anulación.
                      Mientras no se contabilice, el gasto original sigue en el mayor.
                    </p>
                    <p>Contabilízala junto con el documento de reemplazo.</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 p-3 bg-muted/60 border rounded-lg">
                  <Info className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">
                    {isSaved
                      ? "La partida está en borrador: no se crea reversión. El número queda registrado como ANULADO en el libro de bancos."
                      : "El número queda registrado como ANULADO en el libro de bancos, sin movimiento contable."}
                  </p>
                </div>
              )}

              {isPosted && purchaseCount > 0 && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-800 dark:text-amber-300">
                  <Link2Off className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <p>
                    Se desvincularán <strong>{purchaseCount}</strong> factura(s) de esta partida
                    {createReplacement ? " y se vincularán al documento de reemplazo." : "."}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="void-reason">Motivo de la anulación *</Label>
                <Input
                  id="void-reason"
                  placeholder="Ej: Cheque dañado, error en monto, cancelación de pago"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                {reason.length > 0 && !reasonValid && (
                  <p className="text-xs text-destructive">Mínimo 3 caracteres.</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="void-date">Fecha de anulación *</Label>
                <Input
                  id="void-date"
                  type="date"
                  value={voidDate}
                  min={docDate || undefined}
                  onChange={(e) => setVoidDate(e.target.value)}
                />
                {!voidDateValid && (
                  <p className="text-xs text-destructive">No puede ser anterior a la fecha del documento ({formatDate(docDate)}).</p>
                )}
              </div>

              {isSaved && (
                <div className="space-y-3 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="void-replacement"
                      checked={createReplacement}
                      onCheckedChange={(v) => setCreateReplacement(v === true)}
                    />
                    <Label htmlFor="void-replacement" className="cursor-pointer">¿Emitir documento de reemplazo?</Label>
                  </div>
                  {createReplacement && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="replacement-number" className="text-xs">Número del reemplazo</Label>
                        <Input
                          id="replacement-number"
                          value={replacementNumber}
                          placeholder="Siguiente disponible"
                          onChange={(e) => setReplacementNumber(e.target.value)}
                        />
                      </div>
                      {isPosted && (
                        <div className="space-y-1">
                          <Label htmlFor="replacement-date" className="text-xs">Fecha del reemplazo</Label>
                          <Input
                            id="replacement-date"
                            type="date"
                            value={replacementDate}
                            onChange={(e) => setReplacementDate(e.target.value)}
                          />
                        </div>
                      )}
                      <p className="col-span-2 text-xs text-muted-foreground">
                        {isPosted
                          ? "Se creará un borrador nuevo con las mismas líneas y facturas."
                          : "La misma partida en borrador pasará a usar este número."}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleVoid();
            }}
            disabled={!canSubmit}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {loading ? "Procesando..." : "Anular documento"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
