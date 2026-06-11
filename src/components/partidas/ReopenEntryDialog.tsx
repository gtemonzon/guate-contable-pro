import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getSafeErrorMessage } from "@/utils/errorMessages";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryId: number | null;
  entryNumber: string | null;
  onReopened: () => void;
}

export function ReopenEntryDialog({ open, onOpenChange, entryId, entryNumber, onReopened }: Props) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const handleConfirm = async () => {
    if (!entryId) return;
    if (reason.trim().length < 3) {
      toast({ title: "Motivo requerido", description: "Debe indicar el motivo de la reapertura.", variant: "destructive" });
      return;
    }
    try {
      setLoading(true);
      const { error } = await supabase.rpc("reopen_journal_entry" as never, {
        p_entry_id: entryId,
        p_reason: reason.trim(),
      } as never);
      if (error) throw error;
      toast({
        title: "Partida reabierta",
        description: `${entryNumber ?? ""} ahora está en Borrador y no afecta los reportes.`,
      });
      onOpenChange(false);
      onReopened();
    } catch (err) {
      toast({ title: "Error", description: getSafeErrorMessage(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !loading && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reabrir partida para edición</DialogTitle>
          <DialogDescription>
            Esta partida {entryNumber ? <strong>({entryNumber})</strong> : null} se retirará de los reportes
            contables y volverá a estado <strong>Borrador</strong>. Podrá modificar cuentas, montos y
            descripciones antes de volver a contabilizarla. El número de partida se conserva.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="reopen-reason">
            Motivo de la reapertura <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="reopen-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej. Corrección de cuenta contable / monto / descripción…"
            rows={4}
            disabled={loading}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={loading || reason.trim().length < 3}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Reabrir partida
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
