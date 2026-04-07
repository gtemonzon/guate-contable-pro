import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { FileEdit, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getSafeErrorMessage } from "@/utils/errorMessages";

interface MetadataEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryId: number;
  entryNumber: string;
  currentValues: {
    description: string;
    beneficiary_name: string | null;
    bank_reference: string | null;
    document_reference: string | null;
  };
  onSuccess: () => void;
}

export function MetadataEditDialog({
  open,
  onOpenChange,
  entryId,
  entryNumber,
  currentValues,
  onSuccess,
}: MetadataEditDialogProps) {
  const [description, setDescription] = useState(currentValues.description);
  const [beneficiaryName, setBeneficiaryName] = useState(currentValues.beneficiary_name || "");
  const [bankReference, setBankReference] = useState(currentValues.bank_reference || "");
  const [documentReference, setDocumentReference] = useState(currentValues.document_reference || "");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Reset when opening
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setDescription(currentValues.description);
      setBeneficiaryName(currentValues.beneficiary_name || "");
      setBankReference(currentValues.bank_reference || "");
      setDocumentReference(currentValues.document_reference || "");
      setReason("");
    }
    onOpenChange(newOpen);
  };

  const hasChanges =
    description !== currentValues.description ||
    beneficiaryName !== (currentValues.beneficiary_name || "") ||
    bankReference !== (currentValues.bank_reference || "") ||
    documentReference !== (currentValues.document_reference || "");

  const handleSave = async () => {
    if (!reason.trim()) {
      toast({ title: "Razón requerida", description: "Debe indicar la razón del cambio", variant: "destructive" });
      return;
    }
    if (!hasChanges) {
      toast({ title: "Sin cambios", description: "No se detectaron cambios en los datos", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);

      // Build params: only send changed fields
      const rpcParams = {
        p_journal_entry_id: entryId,
        p_reason: reason.trim(),
        p_description: description !== currentValues.description ? description : undefined,
        p_beneficiary_name: beneficiaryName !== (currentValues.beneficiary_name || "") ? (beneficiaryName || null) : undefined,
        p_bank_reference: bankReference !== (currentValues.bank_reference || "") ? (bankReference || null) : undefined,
        p_document_reference: documentReference !== (currentValues.document_reference || "") ? (documentReference || null) : undefined,
      };

      const { error } = await supabase.rpc("update_posted_entry_metadata", rpcParams as any);
      if (error) throw error;

      toast({ title: "Metadatos actualizados", description: `Partida ${entryNumber} actualizada exitosamente` });
      onSuccess();
      onOpenChange(false);
    } catch (error: unknown) {
      toast({ title: "Error al actualizar", description: getSafeErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileEdit className="h-5 w-5 text-amber-500" />
            Editar datos no contables
          </DialogTitle>
          <DialogDescription>
            Partida <Badge variant="outline" className="font-mono ml-1">{entryNumber}</Badge> — contabilizada.
            Solo puede modificar datos administrativos. Los montos y cuentas permanecen inmutables.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>Para cambios contables (montos, cuentas) use <strong>Anular/Reversión</strong>.</span>
          </div>

          <div>
            <Label htmlFor="meta-description">Descripción / Memo</Label>
            <Textarea
              id="meta-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="meta-beneficiary">Nombre del beneficiario</Label>
            <Input
              id="meta-beneficiary"
              value={beneficiaryName}
              onChange={(e) => setBeneficiaryName(e.target.value)}
              className="mt-1.5"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="meta-bank-ref">Referencia bancaria</Label>
              <Input
                id="meta-bank-ref"
                value={bankReference}
                onChange={(e) => setBankReference(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="meta-doc-ref">Referencia documento</Label>
              <Input
                id="meta-doc-ref"
                value={documentReference}
                onChange={(e) => setDocumentReference(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="meta-reason" className="text-destructive">Razón del cambio *</Label>
            <Textarea
              id="meta-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describa la razón de la corrección..."
              rows={2}
              className="mt-1.5"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading || !hasChanges || !reason.trim()}>
            <FileEdit className="mr-2 h-4 w-4" />
            Guardar cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
