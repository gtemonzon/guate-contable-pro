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
import { useToast } from "@/hooks/use-toast";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface VoidEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: {
    id: number;
    entry_number: string;
    entry_date: string;
    description: string;
    total_debit: number;
    total_credit: number;
    enterprise_id?: number;
    accounting_period_id?: number | null;
  } | null;
  onSuccess: () => void;
}

export default function VoidEntryDialog({
  open,
  onOpenChange,
  entry,
  onSuccess,
}: VoidEntryDialogProps) {
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState("");
  const { toast } = useToast();

  const handleVoid = async () => {
    if (!entry) return;

    if (!reason.trim()) {
      toast({
        title: "Campo requerido",
        description: "Debes ingresar un motivo para la anulación",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);

      // 1. Fetch the original entry's details
      const { data: details, error: detailsError } = await supabase
        .from("tab_journal_entry_details")
        .select("*")
        .eq("journal_entry_id", entry.id)
        .is("deleted_at", null)
        .order("line_number");

      if (detailsError) throw detailsError;

      if (!details || details.length === 0) {
        throw new Error("La partida no tiene líneas de detalle");
      }

      // 2. Generate the reversal entry number
      const today = new Date();
      const datePrefix = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
      
      // Get the next reversal number for today
      const { data: existingReversals } = await supabase
        .from("tab_journal_entries")
        .select("entry_number")
        .eq("enterprise_id", entry.enterprise_id)
        .like("entry_number", `REV-${datePrefix}%`)
        .order("entry_number", { ascending: false })
        .limit(1);

      let nextNumber = 1;
      if (existingReversals && existingReversals.length > 0) {
        const lastNumber = existingReversals[0].entry_number;
        const match = lastNumber.match(/REV-\d{8}-(\d+)/);
        if (match) {
          nextNumber = parseInt(match[1]) + 1;
        }
      }

      const reversalEntryNumber = `REV-${datePrefix}-${String(nextNumber).padStart(3, "0")}`;

      // 3. Create the reversal entry (swap debit/credit, inherit original date & period)
      const { data: reversalEntry, error: reversalError } = await supabase
        .from("tab_journal_entries")
        .insert({
          enterprise_id: entry.enterprise_id,
          accounting_period_id: entry.accounting_period_id,
          entry_number: reversalEntryNumber,
          entry_date: entry.entry_date, // Inherit original date for fiscal consistency
          entry_type: "ajuste",
          description: `REVERSIÓN: ${entry.entry_number} - ${reason}`,
          total_debit: entry.total_credit, // Swapped
          total_credit: entry.total_debit, // Swapped
          is_balanced: true,
          is_posted: false,
          status: "borrador",
          document_reference: `REF: ${entry.entry_number}`,
        })
        .select()
        .single();

      if (reversalError) throw reversalError;

      // 4. Create the reversal details (swap debit/credit)
      const reversalDetails = details.map((d, index) => ({
        journal_entry_id: reversalEntry.id,
        line_number: index + 1,
        account_id: d.account_id,
        description: `Rev. ${entry.entry_number}: ${d.description || ""}`,
        debit_amount: d.credit_amount || 0, // Swapped
        credit_amount: d.debit_amount || 0, // Swapped
        cost_center: d.cost_center,
        bank_reference: d.bank_reference,
      }));

      const { error: detailsInsertError } = await supabase
        .from("tab_journal_entry_details")
        .insert(reversalDetails);

      if (detailsInsertError) throw detailsInsertError;

      toast({
        title: "Partida de reversión creada",
        description: `Se creó la partida ${reversalEntryNumber} para revertir ${entry.entry_number}`,
      });

      setReason("");
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast({
        title: "Error al crear reversión",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
            <RotateCcw className="h-5 w-5" />
            Generar Reversión Contable
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4 pt-2">
              <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800 dark:text-amber-300">
                  <p className="font-medium">Esto creará una nueva partida de reversión</p>
                  <p className="mt-1">
                    Se generará automáticamente una partida de ajuste que invierte los valores de
                    débito y crédito de la partida <strong>{entry?.entry_number}</strong>.
                  </p>
                </div>
              </div>

              {entry && (
                <div className="text-sm space-y-1 p-3 bg-muted rounded-lg">
                  <p><span className="font-medium">Partida a revertir:</span> {entry.entry_number}</p>
                  <p><span className="font-medium">Fecha:</span> {entry.entry_date}</p>
                  <p><span className="font-medium">Descripción:</span> {entry.description}</p>
                  <p><span className="font-medium">Monto:</span> Q{entry.total_debit.toFixed(2)}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="reason">Motivo de la anulación *</Label>
                <Input
                  id="reason"
                  placeholder="Ej: Error en clasificación de cuenta"
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
              handleVoid();
            }}
            disabled={loading || !reason.trim()}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {loading ? "Creando..." : "Generar Reversión"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
