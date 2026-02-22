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
  /** Entry context — may be null for standalone void cheque */
  entry: {
    id: number;
    entry_number: string;
    entry_date: string;
    description: string;
    total_debit: number;
    total_credit: number;
    is_posted: boolean;
    enterprise_id?: number;
    bank_account_id?: number | null;
    bank_reference?: string;
    beneficiary_name?: string;
    bank_direction?: string;
  } | null;
  /** Pre-filled values from the journal entry form (for new entries not yet saved) */
  formValues?: {
    enterpriseId: number;
    bankAccountId: number | null;
    bankReference: string;
    beneficiaryName: string;
    entryDate: string;
    description: string;
    bankDirection: string;
  };
  onSuccess: () => void;
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

  // Determine values from entry or formValues
  const enterpriseId = entry?.enterprise_id ?? formValues?.enterpriseId;
  const bankAccountId = entry?.bank_account_id ?? formValues?.bankAccountId;
  const documentNumber = entry?.bank_reference ?? formValues?.bankReference ?? "";
  const beneficiary = entry?.beneficiary_name ?? formValues?.beneficiaryName ?? "";
  const docDate = entry?.entry_date ?? formValues?.entryDate ?? "";
  const concept = entry?.description ?? formValues?.description ?? "";
  const direction = entry?.bank_direction ?? formValues?.bankDirection ?? "OUT";
  const isPosted = entry?.is_posted ?? false;

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

      if (isPosted) {
        // ─── Posted entry: create reversal + void document ───
        // 1. Fetch original details
        const { data: details, error: detailsError } = await supabase
          .from("tab_journal_entry_details")
          .select("*")
          .eq("journal_entry_id", entry!.id)
          .is("deleted_at", null)
          .order("line_number");

        if (detailsError) throw detailsError;
        if (!details || details.length === 0) throw new Error("La partida no tiene líneas de detalle");

        // 2. Generate reversal entry number
        const today = new Date();
        const datePrefix = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
        const { data: existingReversals } = await supabase
          .from("tab_journal_entries")
          .select("entry_number")
          .eq("enterprise_id", enterpriseId)
          .like("entry_number", `REV-${datePrefix}%`)
          .order("entry_number", { ascending: false })
          .limit(1);

        let nextNumber = 1;
        if (existingReversals?.length) {
          const match = existingReversals[0].entry_number.match(/REV-\d{8}-(\d+)/);
          if (match) nextNumber = parseInt(match[1]) + 1;
        }
        const reversalEntryNumber = `REV-${datePrefix}-${String(nextNumber).padStart(3, "0")}`;

        // 3. Create reversal entry
        const { data: reversalEntry, error: reversalError } = await supabase
          .from("tab_journal_entries")
          .insert({
            enterprise_id: enterpriseId,
            entry_number: reversalEntryNumber,
            entry_date: today.toISOString().split("T")[0],
            entry_type: "ajuste",
            description: `ANULACIÓN CHEQUE: ${documentNumber} - ${reason}`,
            total_debit: entry!.total_credit,
            total_credit: entry!.total_debit,
            is_balanced: true,
            is_posted: false,
            status: "borrador",
            document_reference: `REF: ${entry!.entry_number}`,
            bank_account_id: bankAccountId,
            bank_reference: documentNumber,
            beneficiary_name: beneficiary,
          })
          .select()
          .single();

        if (reversalError) throw reversalError;

        // 4. Create reversed detail lines
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

        // 5. Upsert VOID bank document linked to both entries (idempotent)
        const { error: docError } = await supabase
          .from("tab_bank_documents")
          .upsert({
            enterprise_id: enterpriseId,
            bank_account_id: bankAccountId,
            document_number: documentNumber,
            direction: direction,
            document_date: docDate,
            beneficiary_name: beneficiary,
            concept: `${concept} — ANULADO: ${reason}`,
            status: "VOID",
            void_date: today.toISOString().split("T")[0],
            void_reason: reason,
            journal_entry_id: entry!.id,
            reversal_journal_entry_id: reversalEntry.id,
          }, { onConflict: "enterprise_id,bank_account_id,document_number" });

        if (docError) throw docError;

        toast({
          title: "Cheque anulado con reversión",
          description: `Se creó la partida de reversión ${reversalEntryNumber} y se registró el cheque ${documentNumber} como ANULADO.`,
        });
      } else {
        // ─── Not posted: upsert VOID bank document (idempotent) ───
        const { error: docError } = await supabase
          .from("tab_bank_documents")
          .upsert({
            enterprise_id: enterpriseId,
            bank_account_id: bankAccountId,
            document_number: documentNumber,
            direction: direction,
            document_date: docDate,
            beneficiary_name: beneficiary,
            concept: `${concept} — ANULADO: ${reason}`,
            status: "VOID",
            void_date: new Date().toISOString().split("T")[0],
            void_reason: reason,
            journal_entry_id: entry?.id ?? null,
          }, { onConflict: "enterprise_id,bank_account_id,document_number" });

        if (docError) throw docError;

        toast({
          title: "Cheque anulado",
          description: `El cheque ${documentNumber} fue registrado como ANULADO para efectos de auditoría.`,
        });
      }

      setReason("");
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
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
