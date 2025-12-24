import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Upload, X, FileText } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface TaxForm {
  id: number;
  enterprise_id: number;
  form_number: string;
  access_code: string;
  payment_date: string;
  amount_paid: number;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  notes: string | null;
}

interface TaxFormDialogProps {
  open: boolean;
  onOpenChange: (success?: boolean) => void;
  enterpriseId: number;
  editingForm: TaxForm | null;
}

export default function TaxFormDialog({
  open,
  onOpenChange,
  enterpriseId,
  editingForm,
}: TaxFormDialogProps) {
  const [formNumber, setFormNumber] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [paymentDate, setPaymentDate] = useState<Date | undefined>();
  const [amountPaid, setAmountPaid] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [existingFileName, setExistingFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      if (editingForm) {
        setFormNumber(editingForm.form_number);
        setAccessCode(editingForm.access_code);
        setPaymentDate(new Date(editingForm.payment_date));
        setAmountPaid(editingForm.amount_paid.toString());
        setNotes(editingForm.notes || "");
        setExistingFileName(editingForm.file_name);
        setFile(null);
      } else {
        resetForm();
      }
    }
  }, [open, editingForm]);

  const resetForm = () => {
    setFormNumber("");
    setAccessCode("");
    setPaymentDate(undefined);
    setAmountPaid("");
    setNotes("");
    setFile(null);
    setExistingFileName(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type !== "application/pdf") {
        toast({
          title: "Error",
          description: "Solo se permiten archivos PDF",
          variant: "destructive",
        });
        return;
      }
      if (selectedFile.size > 10 * 1024 * 1024) {
        toast({
          title: "Error",
          description: "El archivo no puede superar los 10 MB",
          variant: "destructive",
        });
        return;
      }
      setFile(selectedFile);
      setExistingFileName(null);
    }
  };

  const handleSubmit = async () => {
    if (!formNumber.trim() || !accessCode.trim() || !paymentDate || !amountPaid) {
      toast({
        title: "Error",
        description: "Por favor completa todos los campos requeridos",
        variant: "destructive",
      });
      return;
    }

    const amount = parseFloat(amountPaid);
    if (isNaN(amount) || amount < 0) {
      toast({
        title: "Error",
        description: "El monto debe ser un número válido",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Check for duplicate form number (excluding current form if editing)
      const { data: existing, error: checkError } = await supabase
        .from("tab_tax_forms")
        .select("id")
        .eq("enterprise_id", enterpriseId)
        .eq("form_number", formNumber.trim())
        .eq("is_active", true)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existing && (!editingForm || existing.id !== editingForm.id)) {
        toast({
          title: "Error",
          description: "Ya existe un formulario con ese número",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      let filePath = editingForm?.file_path || null;
      let fileName = editingForm?.file_name || null;
      let fileSize = editingForm?.file_size || null;

      // Upload new file if provided
      if (file) {
        const fileExt = file.name.split(".").pop();
        const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
        filePath = `${enterpriseId}/${uniqueId}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("tax-forms")
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        fileName = file.name;
        fileSize = file.size;

        // Delete old file if replacing
        if (editingForm?.file_path && editingForm.file_path !== filePath) {
          await supabase.storage.from("tax-forms").remove([editingForm.file_path]);
        }
      }

      const formData = {
        enterprise_id: enterpriseId,
        form_number: formNumber.trim(),
        access_code: accessCode.trim(),
        payment_date: format(paymentDate, "yyyy-MM-dd"),
        amount_paid: amount,
        file_path: filePath,
        file_name: fileName,
        file_size: fileSize,
        notes: notes.trim() || null,
      };

      if (editingForm) {
        const { error } = await supabase
          .from("tab_tax_forms")
          .update(formData)
          .eq("id", editingForm.id);

        if (error) throw error;

        toast({
          title: "Formulario actualizado",
          description: "El formulario fue actualizado correctamente",
        });
      } else {
        const { error } = await supabase.from("tab_tax_forms").insert(formData);

        if (error) throw error;

        toast({
          title: "Formulario creado",
          description: "El formulario fue agregado correctamente",
        });
      }

      onOpenChange(true);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo guardar el formulario",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => onOpenChange()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {editingForm ? "Editar Formulario" : "Nuevo Formulario de Impuestos"}
          </DialogTitle>
          <DialogDescription>
            {editingForm
              ? "Modifica los datos del formulario"
              : "Ingresa los datos del formulario de impuestos"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="formNumber">Número de Formulario *</Label>
            <Input
              id="formNumber"
              value={formNumber}
              onChange={(e) => setFormNumber(e.target.value)}
              placeholder="Ej: 1234567890"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="accessCode">Código de Acceso *</Label>
            <Input
              id="accessCode"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              placeholder="Ej: ABC123XYZ"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Fecha de Pago *</Label>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !paymentDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {paymentDate ? format(paymentDate, "dd/MM/yyyy") : "Seleccionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={paymentDate}
                    onSelect={(date) => {
                      setPaymentDate(date);
                      setCalendarOpen(false);
                    }}
                    locale={es}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amountPaid">Monto Pagado (Q) *</Label>
              <Input
                id="amountPaid"
                type="number"
                step="0.01"
                min="0"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Archivo PDF (Opcional)</Label>
            <div className="border-2 border-dashed border-border rounded-lg p-4">
              {file ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <span className="text-sm truncate max-w-[250px]">{file.name}</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setFile(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : existingFileName ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <span className="text-sm truncate max-w-[250px]">{existingFileName}</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setExistingFileName(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div
                  className="flex flex-col items-center justify-center cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Clic para seleccionar archivo PDF
                  </p>
                  <p className="text-xs text-muted-foreground">Máximo 10 MB</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notas (Opcional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas adicionales..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange()} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Guardando..." : editingForm ? "Actualizar" : "Guardar Formulario"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
