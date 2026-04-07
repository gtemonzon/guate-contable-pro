import { useState } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { AlertTriangle, Ban } from "lucide-react";

interface VoidChequeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: {
    id: number;
    entry_number: string;
    entry_date: string;
    description: string;
    total_debit: number;
    total_credit: number;
    is_posted: boolean;
    enterprise_id?: number;
    accounting_period_id?: number | null;
    bank_account_id?: number | null;
    bank_reference?: string;
    beneficiary_name?: string;
    bank_direction?: string;
  } | null;
  formValues?: {
    enterpriseId: number;
    bankAccountId: number | null;
    bankReference: string;
    beneficiaryName: string;
    entryDate: string;
    description: string;
    bankDirection: string;
    draftEntryId?: number | null;
  };
  onSuccess: () => void;
}

/**
 * Find an existing bank document by enterprise + bank_account + document_number.
 * Handles NULL bank_account_id correctly (PostgreSQL NULLs don't match in unique constraints).
 */
async function findExistingBankDocument(
  enterpriseId: number,
  bankAccountId: number | null,
  documentNumber: string,
) {
  let query = supabase
    .from("tab_bank_documents")
    .select("id")
    .eq("enterprise_id", enterpriseId)
    .eq("document_number", documentNumber);

  if (bankAccountId != null) {
    query = query.eq("bank_account_id", bankAccountId);
  } else {
    query = query.is("bank_account_id", null);
  }

  const { data } = await query.maybeSingle();
  return data;
}

export default function VoidChequeDialog({
  open,
  onOpenChange,
  entry,
  formValues,
  onSuccess,
}: VoidChequeDialogProps) {
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState("");
  const { toast } = useToast();

  const enterpriseId = entry?.enterprise_id ?? formValues?.enterpriseId;
  const bankAccountId = entry?.bank_account_id ?? formValues?.bankAccountId;
  const documentNumber = entry?.bank_reference ?? formValues?.bankReference ?? "";
  const beneficiary = entry?.beneficiary_name ?? formValues?.beneficiaryName ?? "";
  const docDate = entry?.entry_date ?? formValues?.entryDate ?? "";
  const concept = entry?.description ?? formValues?.description ?? "";
  const direction = entry?.bank_direction ?? formValues?.bankDirection ?? "OUT";
  const isPosted = entry?.is_posted ?? false;

  /**
   * Idempotent upsert: SELECT-first to handle NULL bank_account_id,
   * then UPDATE-if-found or INSERT-if-not.
   */
  async function upsertBankDocument(
    resolvedBankAccountId: number | null,
    fields: Record<string, any>,
  ) {
    const existing = await findExistingBankDocument(
      enterpriseId!,
      resolvedBankAccountId,
      documentNumber,
    );

    if (existing) {
      const { error } = await supabase
        .from("tab_bank_documents")
        .update(fields)
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const insertRow: Record<string, any> = {
        enterprise_id: enterpriseId!,
        bank_account_id: resolvedBankAccountId,
        document_number: documentNumber,
        ...fields,
      };
      const { error } = await supabase
        .from("tab_bank_documents")
        .insert([insertRow as any]);
      if (error) throw error;
    }
  }

  const handleVoidCheque = async () => {
    if (!reason.trim()) {
      toast({ title: "Campo requerido", description: "Debes ingresar un motivo para la anulación del cheque", variant: "destructive" });
      return;
    }
    if (!enterpriseId || !bankAccountId) {
      toast({ title: "Datos incompletos", description: "Se requiere empresa y cuenta bancaria para anular un cheque", variant: "destructive" });
      return;
    }
    if (!documentNumber.trim()) {
      toast({ title: "Número de cheque requerido", description: "Ingresa el número del cheque a anular", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);

      // Resolve the tab_bank_accounts.id from the GL account id
      let resolvedBankAccountId: number | null = null;
      if (bankAccountId) {
        const { data: bankAcct } = await supabase
          .from("tab_bank_accounts")
          .select("id")
          .eq("account_id", bankAccountId)
          .eq("enterprise_id", enterpriseId!)
          .maybeSingle();
        resolvedBankAccountId = bankAcct?.id ?? null;
      }

      if (isPosted) {
        // ─── Posted entry: create reversal + void document ───
        const { data: details, error: detailsError } = await supabase
          .from("tab_journal_entry_details")
          .select("*")
          .eq("journal_entry_id", entry!.id)
          .is("deleted_at", null)
          .order("line_number");

        if (detailsError) throw detailsError;
        if (!details || details.length === 0) throw new Error("La partida no tiene líneas de detalle");

        // Generate reversal entry number (REV-YYYY-MM-####)
        const originalDate = new Date(entry!.entry_date + "T00:00:00");
        const revYear = originalDate.getFullYear();
        const revMonth = String(originalDate.getMonth() + 1).padStart(2, "0");
        const revPrefix = `REV-${revYear}-${revMonth}-`;
        const { data: existingReversals } = await supabase
          .from("tab_journal_entries")
          .select("entry_number")
          .eq("enterprise_id", enterpriseId)
          .like("entry_number", `${revPrefix}%`)
          .order("entry_number", { ascending: false })
          .limit(1);

        let nextNumber = 1;
        if (existingReversals?.length) {
          const match = existingReversals[0].entry_number.match(/REV-\d{4}-\d{2}-(\d+)/);
          if (match) nextNumber = parseInt(match[1]) + 1;
        }
        const reversalEntryNumber = `REV-${revYear}-${revMonth}-${String(nextNumber).padStart(4, "0")}`;

        // Create reversal entry as draft first
        const { data: reversalEntry, error: reversalError } = await supabase
          .from("tab_journal_entries")
          .insert({
            enterprise_id: enterpriseId,
            entry_number: reversalEntryNumber,
            entry_date: entry!.entry_date,
            entry_type: "ajuste",
            description: `ANULACIÓN CHEQUE: ${documentNumber} - ${reason}`,
            total_debit: entry!.total_credit,
            total_credit: entry!.total_debit,
            is_posted: false,
            status: "borrador",
            document_reference: `REF: ${entry!.entry_number}`,
            bank_account_id: bankAccountId,
            bank_reference: documentNumber,
            beneficiary_name: beneficiary,
            accounting_period_id: entry!.accounting_period_id ?? null,
          })
          .select()
          .single();

        if (reversalError) throw reversalError;

        // Create reversed detail lines
        const reversalDetails = details.map((d: any, index: number) => ({
          journal_entry_id: reversalEntry.id,
          line_number: index + 1,
          account_id: d.account_id,
          description: `Anulación Cheque ${documentNumber}: ${d.description || ""}`,
          debit_amount: d.credit_amount || 0,
          credit_amount: d.debit_amount || 0,
          cost_center: d.cost_center,
          is_bank_line: d.is_bank_line || false,
        }));

        const { error: detailsInsertError } = await supabase
          .from("tab_journal_entry_details")
          .insert(reversalDetails);

        if (detailsInsertError) throw detailsInsertError;

        // Idempotent VOID bank document
        await upsertBankDocument(resolvedBankAccountId, {
          direction: direction,
          document_date: docDate,
          beneficiary_name: beneficiary,
          concept: `${concept} — ANULADO: ${reason}`,
          status: "VOID",
          void_date: entry!.entry_date,
          void_reason: reason,
          journal_entry_id: entry!.id,
          reversal_journal_entry_id: reversalEntry.id,
        });

        toast({
          title: "Cheque anulado con reversión",
          description: `Se creó la partida de reversión ${reversalEntryNumber} y se registró el cheque ${documentNumber} como ANULADO.`,
        });
      } else {
        // ─── Not posted: idempotent VOID bank document ───
        await upsertBankDocument(resolvedBankAccountId, {
          direction: direction,
          document_date: docDate,
          beneficiary_name: beneficiary,
          concept: `${concept} — ANULADO: ${reason}`,
          status: "VOID",
          void_date: new Date().toISOString().split("T")[0],
          void_reason: reason,
          journal_entry_id: entry?.id ?? null,
        });

        toast({
          title: "Cheque anulado",
          description: `El cheque ${documentNumber} fue registrado como ANULADO para efectos de auditoría.`,
        });
      }

      setReason("");
      onOpenChange(false);
      onSuccess();
    } catch (error: unknown) {
      toast({ title: "Error al anular cheque", description: getSafeErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
            <Ban className="h-5 w-5" />
            Anular Cheque
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4 pt-2">
              <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800 dark:text-amber-300">
                  {isPosted ? (
                    <>
                      <p className="font-medium">El cheque tiene una partida contabilizada</p>
                      <p className="mt-1">
                        Se creará automáticamente una <strong>partida de reversión</strong> y el cheque
                        quedará registrado como ANULADO en el libro de bancos.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium">Registro de cheque anulado (sin movimiento contable)</p>
                      <p className="mt-1">
                        El cheque será registrado como ANULADO en el libro de bancos para
                        efectos de auditoría, sin crear movimiento contable.
                      </p>
                    </>
                  )}
                </div>
              </div>

              <div className="text-sm space-y-1 p-3 bg-muted rounded-lg">
                <p><span className="font-medium">Cheque N°:</span> {documentNumber || <span className="text-muted-foreground italic">Sin número</span>}</p>
                <p><span className="font-medium">Fecha:</span> {docDate}</p>
                <p><span className="font-medium">Beneficiario:</span> {beneficiary || <span className="text-muted-foreground italic">Sin beneficiario</span>}</p>
                <p><span className="font-medium">Concepto:</span> {concept}</p>
                {entry && (
                  <p className="flex items-center gap-2">
                    <span className="font-medium">Estado:</span>
                    <Badge variant={isPosted ? "default" : "secondary"} className="text-[10px]">
                      {isPosted ? "Contabilizado" : "Borrador"}
                    </Badge>
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="void-reason">Motivo de la anulación *</Label>
                <Input
                  id="void-reason"
                  placeholder="Ej: Cheque dañado, error en monto, cancelación de pago"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleVoidCheque();
            }}
            disabled={loading || !reason.trim() || !documentNumber.trim()}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {loading ? "Procesando..." : isPosted ? "Anular con Reversión" : "Anular Cheque"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
