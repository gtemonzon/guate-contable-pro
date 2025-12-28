import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useFileDrop } from "@/hooks/use-file-drop";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Upload, X, FileText, Search, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
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
import { Separator } from "@/components/ui/separator";
import * as pdfjsLib from "pdfjs-dist";

// Set the worker source for pdf.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface TaxForm {
  id: number;
  enterprise_id: number;
  form_number: string;
  access_code: string;
  tax_type: string | null;
  period_type: string | null;
  period_month: number | null;
  period_year: number | null;
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

interface ExtractedPdfData {
  formNumber?: string;
  accessCode?: string;
  taxType?: string;
  periodType?: string;
  periodMonth?: number;
  periodYear?: number;
  paymentDate?: string;
  amountPaid?: number;
  fieldsFound: number;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const MONTHS = [
  { value: 1, label: "Enero" },
  { value: 2, label: "Febrero" },
  { value: 3, label: "Marzo" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Mayo" },
  { value: 6, label: "Junio" },
  { value: 7, label: "Julio" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Septiembre" },
  { value: 10, label: "Octubre" },
  { value: 11, label: "Noviembre" },
  { value: 12, label: "Diciembre" },
];

const QUARTERS = [
  { value: 1, label: "Enero - Marzo (Q1)" },
  { value: 4, label: "Abril - Junio (Q2)" },
  { value: 7, label: "Julio - Septiembre (Q3)" },
  { value: 10, label: "Octubre - Diciembre (Q4)" },
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i);

export default function TaxFormDialog({
  open,
  onOpenChange,
  enterpriseId,
  editingForm,
}: TaxFormDialogProps) {
  const [formNumber, setFormNumber] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [taxType, setTaxType] = useState("");
  const [taxTypeSuggestions, setTaxTypeSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [periodType, setPeriodType] = useState<string>("");
  const [periodMonth, setPeriodMonth] = useState<string>("");
  const [periodYear, setPeriodYear] = useState<string>(currentYear.toString());
  const [paymentDate, setPaymentDate] = useState<Date | undefined>();
  const [amountPaid, setAmountPaid] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [existingFileName, setExistingFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const taxTypeInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { isDragging, dragProps } = useFileDrop({
    accept: [".pdf", "application/pdf"],
    maxSize: MAX_FILE_SIZE,
    onFile: (f) => {
      setFile(f);
      setExistingFileName(null);
    },
    onError: (message) => toast({ variant: "destructive", title: "Error", description: message }),
    disabled: loading || isAnalyzing,
  });

  useEffect(() => {
    if (open) {
      fetchTaxTypeSuggestions();
      if (editingForm) {
        setFormNumber(editingForm.form_number);
        setAccessCode(editingForm.access_code);
        setTaxType(editingForm.tax_type || "");
        setPeriodType(editingForm.period_type || "");
        setPeriodMonth(editingForm.period_month?.toString() || "");
        setPeriodYear(editingForm.period_year?.toString() || currentYear.toString());
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

  const fetchTaxTypeSuggestions = async () => {
    try {
      const { data, error } = await supabase
        .from("tab_tax_forms")
        .select("tax_type")
        .eq("enterprise_id", enterpriseId)
        .eq("is_active", true)
        .not("tax_type", "is", null)
        .order("tax_type");

      if (error) throw error;

      const uniqueTypes = [...new Set(data?.map((d) => d.tax_type).filter(Boolean))] as string[];
      setTaxTypeSuggestions(uniqueTypes);
    } catch (error) {
      console.error("Error fetching tax type suggestions:", error);
    }
  };

  const resetForm = () => {
    setFormNumber("");
    setAccessCode("");
    setTaxType("");
    setPeriodType("");
    setPeriodMonth("");
    setPeriodYear(currentYear.toString());
    setPaymentDate(undefined);
    setAmountPaid("");
    setNotes("");
    setFile(null);
    setExistingFileName(null);
    setShowSuggestions(false);
  };

  const filteredSuggestions = taxTypeSuggestions.filter((suggestion) =>
    suggestion.toLowerCase().includes(taxType.toLowerCase())
  );

  const handleTaxTypeSelect = (suggestion: string) => {
    setTaxType(suggestion);
    setShowSuggestions(false);
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
      if (selectedFile.size > MAX_FILE_SIZE) {
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

  const extractTextFromPdf = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(" ");
      fullText += pageText + "\n";
    }
    
    return fullText;
  };

  const handleAnalyzePdf = async () => {
    if (!file) return;

    setIsAnalyzing(true);
    try {
      // Extract text from PDF in client-side
      const pdfText = await extractTextFromPdf(file);

      const { data, error } = await supabase.functions.invoke("parse-tax-form-pdf", {
        body: { pdfText },
      });

      if (error) throw error;

      const extractedData = data as ExtractedPdfData;

      if (extractedData.fieldsFound === 0) {
        toast({
          title: "Sin datos detectados",
          description: "No se pudo extraer información del PDF. Completa los campos manualmente.",
          variant: "destructive",
        });
        return;
      }

      // Pre-fill fields with extracted data
      if (extractedData.formNumber) setFormNumber(extractedData.formNumber);
      if (extractedData.accessCode) setAccessCode(extractedData.accessCode);
      if (extractedData.taxType) setTaxType(extractedData.taxType);
      if (extractedData.periodType) setPeriodType(extractedData.periodType);
      if (extractedData.periodMonth) setPeriodMonth(extractedData.periodMonth.toString());
      if (extractedData.periodYear) setPeriodYear(extractedData.periodYear.toString());
      if (extractedData.paymentDate) {
        try {
          setPaymentDate(parseISO(extractedData.paymentDate));
        } catch (e) {
          console.error("Error parsing payment date:", e);
        }
      }
      if (extractedData.amountPaid !== undefined) {
        setAmountPaid(extractedData.amountPaid.toString());
      }

      toast({
        title: "Análisis completado",
        description: `Se detectaron ${extractedData.fieldsFound} campo(s). Revisa los datos antes de guardar.`,
      });
    } catch (error: any) {
      console.error("Error analyzing PDF:", error);
      toast({
        title: "Error al analizar",
        description: error.message || "No se pudo procesar el PDF. Completa los campos manualmente.",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
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
      // Check for duplicate form number
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
        tax_type: taxType.trim() || null,
        period_type: periodType || null,
        period_month: periodMonth ? parseInt(periodMonth) : null,
        period_year: periodYear ? parseInt(periodYear) : null,
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
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingForm ? "Editar Formulario" : "Nuevo Formulario de Impuestos"}
          </DialogTitle>
          <DialogDescription>
            {editingForm
              ? "Modifica los datos del formulario"
              : "Sube un PDF para extraer los datos automáticamente o ingresalos manualmente"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Step 1: PDF Upload - First */}
          <div className="space-y-2">
            <Label className="text-base font-medium flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs">1</span>
              Cargar archivo PDF
            </Label>
            <div
              {...dragProps}
              className={cn(
                "border-2 border-dashed rounded-lg p-4 transition-colors",
                isDragging && "border-primary bg-primary/5",
                !isDragging && "border-border"
              )}
            >
              {file ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                    <span className="text-sm truncate">{file.name}</span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAnalyzePdf}
                      disabled={isAnalyzing || loading}
                      className="gap-1"
                    >
                      {isAnalyzing ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Analizando...
                        </>
                      ) : (
                        <>
                          <Search className="h-4 w-4" />
                          Analizar PDF
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setFile(null)}
                      disabled={isAnalyzing}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
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
                  <Upload className={cn("h-8 w-8 mb-2", isDragging ? "text-primary" : "text-muted-foreground")} />
                  <p className="text-sm text-muted-foreground">
                    {isDragging ? "Suelta el archivo aquí" : "Arrastra un PDF o haz clic para seleccionar"}
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

          <Separator />

          {/* Step 2: Form Data */}
          <div className="space-y-4">
            <Label className="text-base font-medium flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs">2</span>
              Datos del formulario
            </Label>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="formNumber">Número de Formulario *</Label>
                <Input
                  id="formNumber"
                  value={formNumber}
                  onChange={(e) => setFormNumber(e.target.value)}
                  placeholder="Ej: 1234567890"
                  disabled={isAnalyzing}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="accessCode">Código de Acceso *</Label>
                <Input
                  id="accessCode"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder="Ej: ABC123XYZ"
                  disabled={isAnalyzing}
                />
              </div>
            </div>

            <div className="space-y-2 relative">
              <Label htmlFor="taxType">Tipo de Impuesto</Label>
              <Input
                id="taxType"
                ref={taxTypeInputRef}
                value={taxType}
                onChange={(e) => {
                  setTaxType(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => {
                  setTimeout(() => setShowSuggestions(false), 150);
                }}
                placeholder="Ej: IVA, ISR, ISO..."
                autoComplete="off"
                disabled={isAnalyzing}
              />
              {showSuggestions && filteredSuggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md max-h-40 overflow-y-auto">
                  {filteredSuggestions.map((suggestion, index) => (
                    <div
                      key={index}
                      className="px-3 py-2 cursor-pointer hover:bg-accent text-sm"
                      onClick={() => handleTaxTypeSelect(suggestion)}
                    >
                      {suggestion}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Período del impuesto */}
            <div className="space-y-2">
              <Label>Período del Impuesto</Label>
              <div className="grid grid-cols-3 gap-2">
                <Select value={periodType} onValueChange={(v) => {
                  setPeriodType(v);
                  setPeriodMonth("");
                }} disabled={isAnalyzing}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mensual">Mensual</SelectItem>
                    <SelectItem value="trimestral">Trimestral</SelectItem>
                    <SelectItem value="anual">Anual</SelectItem>
                  </SelectContent>
                </Select>

                {periodType === "mensual" && (
                  <Select value={periodMonth} onValueChange={setPeriodMonth} disabled={isAnalyzing}>
                    <SelectTrigger>
                      <SelectValue placeholder="Mes" />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((month) => (
                        <SelectItem key={month.value} value={month.value.toString()}>
                          {month.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {periodType === "trimestral" && (
                  <Select value={periodMonth} onValueChange={setPeriodMonth} disabled={isAnalyzing}>
                    <SelectTrigger>
                      <SelectValue placeholder="Trimestre" />
                    </SelectTrigger>
                    <SelectContent>
                      {QUARTERS.map((quarter) => (
                        <SelectItem key={quarter.value} value={quarter.value.toString()}>
                          {quarter.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {periodType && (
                  <Select value={periodYear} onValueChange={setPeriodYear} disabled={isAnalyzing}>
                    <SelectTrigger>
                      <SelectValue placeholder="Año" />
                    </SelectTrigger>
                    <SelectContent>
                      {YEARS.map((year) => (
                        <SelectItem key={year} value={year.toString()}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
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
                      disabled={isAnalyzing}
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
                      className={cn("p-3 pointer-events-auto")}
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
                  disabled={isAnalyzing}
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
                disabled={isAnalyzing}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange()} disabled={loading || isAnalyzing}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading || isAnalyzing}>
            {loading ? "Guardando..." : editingForm ? "Actualizar" : "Guardar Formulario"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
