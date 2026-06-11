import { useState } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryId: number | null;
  entryNumber: string | null;
  onDeleted: () => void;
}

export function DeleteDraftDialog({ open, onOpenChange, entryId, entryNumber, onDeleted }: Props) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleConfirm = async () => {
    if (!entryId) return;
    try {
      setLoading(true);
      const { error } = await supabase.rpc("delete_draft_journal_entry" as never, {
        p_entry_id: entryId,
      } as never);
      if (error) throw error;
      toast({ title: "Borrador eliminado", description: entryNumber ?? undefined });
      onOpenChange(false);
      onDeleted();
    } catch (err) {
      toast({ title: "Error", description: getSafeErrorMessage(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar partida en borrador</AlertDialogTitle>
          <AlertDialogDescription>
            Esta partida en borrador {entryNumber ? <strong>({entryNumber})</strong> : null} se eliminará de forma
            permanente. La acción se registrará en la bitácora.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
