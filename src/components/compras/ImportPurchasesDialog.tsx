import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useFileDrop } from "@/hooks/use-file-drop";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, Download, CheckCircle2, XCircle, AlertTriangle, Loader2, FileWarning } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSafeErrorMessage, sanitizeCSVField } from "@/utils/errorMessages";
import {
  normalizeHeader,
  SAT_PURCHASES_MAPPING,
  findSATColumnIndex,
  parseDateFlexible,
  parseNumber,
  isSATFormat,
  isAnulado,
  calculateVATFromTotal,
} from "@/utils/satImportMapping";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ImportPurchasesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enterpriseId: number | null;
  enterpriseNit?: string;
  onSuccess: () => void;
  expenseAccounts?: Array<{ id: number; account_code: string; account_name: string }>;
  operationTypes?: Array<{ id: number; code: string; name: string }>;
}

interface ValidationError {
  row: number;
  field: string;
  value: string;
  message: string;
}

interface ValidPurchase {
  enterprise_id: number;
  purchase_book_id: number;
  invoice_series: string;
  invoice_number: string;
  invoice_date: string;
  fel_document_type: string;
  supplier_nit: string;
  supplier_name: string;
  base_amount: number;
  vat_amount: number;
  net_amount: number;
  total_amount: number;
  expense_account_id?: number | null;
  operation_type_id?: number | null;
}

interface ValidationResult {
  validRecords: ValidPurchase[];
  errors: ValidationError[];
  skippedAnuladas: number;
  periodSummary: { period: string; count: number }[];
}

type DialogState = "initial" | "validating" | "options" | "summary";

// Helper function to find or create purchase book for a given month/year
async function findOrCreatePurchaseBook(
  enterpriseId: number,
  month: number,
  year: number
): Promise<{ id: number }> {
  const { data: existing, error: fetchError } = await supabase
    .from("tab_purchase_books")
    .select("id")
    .eq("enterprise_id", enterpriseId)
    .eq("month", month)
    .eq("year", year)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (existing) return existing;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuario no autenticado");

  const { data: newBook, error: createError } = await supabase
    .from("tab_purchase_books")
    .insert({
      enterprise_id: enterpriseId,
      month,
      year,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (createError) throw createError;
  return newBook;
}

// Parse file (CSV or Excel) and return rows as 2D array
async function parseFile(file: File): Promise<any[][]> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  
  if (extension === "xls" || extension === "xlsx") {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: false }) as any[][];
    return data.filter(row => row.some(cell => cell !== undefined && cell !== null && cell !== ""));
  } else {
    const text = await file.text();
    const lines = text.split("\n").filter(line => line.trim());
    return lines.map(line => parseCSVLine(line));
  }
}

// Helper to parse CSV line handling quoted fields
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

export function ImportPurchasesDialog({
  open,
  onOpenChange,
  enterpriseId,
  enterpriseNit = "",
  onSuccess,
  expenseAccounts = [],
  operationTypes = [],
}: ImportPurchasesDialogProps) {
  const { toast } = useToast();
  const [dialogState, setDialogState] = useState<DialogState>("initial");
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState<string>("");
  
  // Options for bulk assignment
  const [applyBulkOptions, setApplyBulkOptions] = useState(false);
  const [selectedExpenseAccount, setSelectedExpenseAccount] = useState<number | null>(null);
  const [selectedOperationType, setSelectedOperationType] = useState<number | null>(null);

  const { isDragging, dragProps } = useFileDrop({
    accept: [".csv", ".xls", ".xlsx", "text/csv", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    onFile: (file) => handleValidate(file),
    onError: (message) => toast({ variant: "destructive", title: "Error", description: message }),
    disabled: dialogState !== "initial",
  });

  const resetDialog = () => {
    setDialogState("initial");
    setValidationResult(null);
    setFileName("");
    setApplyBulkOptions(false);
    setSelectedExpenseAccount(null);
    setSelectedOperationType(null);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetDialog();
    }
    onOpenChange(newOpen);
  };

  const downloadTemplate = () => {
    const headers = [
      "Fecha de emisión",
      "Número de Autorización",
      "Tipo de DTE",
      "Serie",
      "Número del DTE",
      "NIT del emisor",
      "Nombre completo del emisor",
      "Gran Total (Moneda Original)",
      "IVA (monto de este impuesto)",
      "Marca de anulado"
    ];

    const csvContent = headers.join(",") + "\n" +
      "15/01/2025,ABC123456789,FACT,A,12345,12345678,Proveedor Ejemplo S.A.,112.00,12.00,No\n" +
      "20/02/2025,DEF987654321,FACT,B,67890,87654321,Otro Proveedor S.A.,224.00,24.00,No";

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "plantilla_compras_sat.csv";
    link.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleValidate(file);
    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  const handleValidate = async (file: File) => {
    if (!enterpriseId) {
      toast({
        title: "Error",
        description: "No se ha seleccionado una empresa",
        variant: "destructive",
      });
      return;
    }

    setFileName(file.name);
    setDialogState("validating");

    try {
      const rows = await parseFile(file);
      
      if (rows.length < 2) {
        throw new Error("El archivo está vacío o no tiene datos");
      }

      // Parse headers
      const rawHeaders = rows[0].map(h => String(h || "").trim());
      const normalizedHeaders = rawHeaders.map(normalizeHeader);
      
      // Detect if SAT format
      const useSATFormat = isSATFormat(rawHeaders);
      
      // Get column indices based on format
      let colIndices: Record<string, number>;
      
      if (useSATFormat) {
        colIndices = {
          fecha: findSATColumnIndex(normalizedHeaders, SAT_PURCHASES_MAPPING.fecha),
          serie: findSATColumnIndex(normalizedHeaders, SAT_PURCHASES_MAPPING.serie),
          numero: findSATColumnIndex(normalizedHeaders, SAT_PURCHASES_MAPPING.numero),
          tipo_documento: findSATColumnIndex(normalizedHeaders, SAT_PURCHASES_MAPPING.tipo_documento),
          nit: findSATColumnIndex(normalizedHeaders, SAT_PURCHASES_MAPPING.nit),
          nombre: findSATColumnIndex(normalizedHeaders, SAT_PURCHASES_MAPPING.nombre),
          total: findSATColumnIndex(normalizedHeaders, SAT_PURCHASES_MAPPING.total),
          iva: findSATColumnIndex(normalizedHeaders, SAT_PURCHASES_MAPPING.iva),
          anulado: findSATColumnIndex(normalizedHeaders, SAT_PURCHASES_MAPPING.anulado),
          nit_receptor: findSATColumnIndex(normalizedHeaders, SAT_PURCHASES_MAPPING.nit_receptor),
        };

        // Validate enterprise NIT from file matches active enterprise
        if (enterpriseNit && colIndices.nit_receptor !== -1 && rows.length > 1) {
          const firstDataRow = rows[1];
          const fileNitReceptor = sanitizeCSVField(String(firstDataRow[colIndices.nit_receptor] || "")).replace(/[-\s]/g, "");
          const cleanEnterpriseNit = enterpriseNit.replace(/[-\s]/g, "");
          
          if (fileNitReceptor && fileNitReceptor !== cleanEnterpriseNit) {
            throw new Error(`El NIT del receptor en el archivo (${fileNitReceptor}) no coincide con el NIT de la empresa activa (${cleanEnterpriseNit}). Asegúrese de seleccionar la empresa correcta.`);
          }
        }
      } else {
        colIndices = {
          fecha: normalizedHeaders.indexOf("fecha"),
          serie: normalizedHeaders.indexOf("serie"),
          numero: normalizedHeaders.indexOf("numero"),
          tipo_documento: normalizedHeaders.indexOf("tipo_documento_fel"),
          nit: normalizedHeaders.indexOf("nit_proveedor"),
          nombre: normalizedHeaders.indexOf("nombre_proveedor"),
          total: normalizedHeaders.indexOf("total"),
          iva: normalizedHeaders.indexOf("iva"),
          anulado: -1,
        };
      }

      // Validate required columns - IVA column is now optional since we calculate from total
      const requiredCols = ["fecha", "numero", "nit", "nombre", "total"];
      const missingCols = requiredCols.filter(c => colIndices[c] === -1);
      
      if (missingCols.length > 0) {
        throw new Error(`No se encontraron las columnas requeridas: ${missingCols.join(", ")}. Asegúrese de usar el formato de exportación de SAT Guatemala.`);
      }

      // Process rows for validation - group by period
      const recordsByPeriod = new Map<string, { month: number; year: number; records: any[] }>();
      const errors: ValidationError[] = [];
      let skippedAnuladas = 0;
      
      for (let i = 1; i < rows.length; i++) {
        const values = rows[i];
        if (!values || values.length < 5) continue;

        const rowNum = i + 1;

        // Check if anulado
        if (colIndices.anulado !== -1 && isAnulado(values[colIndices.anulado])) {
          skippedAnuladas++;
          continue;
        }

        // Parse date
        const rawDate = values[colIndices.fecha];
        const fecha = parseDateFlexible(rawDate);
        
        if (!fecha) {
          errors.push({
            row: rowNum,
            field: "Fecha",
            value: String(rawDate || "(vacío)"),
            message: "Fecha inválida o formato no reconocido"
          });
          continue;
        }

        // Get document type first (needed for VAT calculation)
        const tipoDoc = sanitizeCSVField(String(values[colIndices.tipo_documento] || "FACT"));
        
        // Parse total and calculate VAT from it (ignore SAT's IVA column as it may be incorrect)
        const total = parseNumber(values[colIndices.total]);

        if (total <= 0) {
          errors.push({
            row: rowNum,
            field: "Total",
            value: String(values[colIndices.total] || "0"),
            message: "El total debe ser mayor a cero"
          });
          continue;
        }

        // Calculate VAT based on document type - SAT exports may have incorrect IVA values
        const { vatAmount, baseAmount } = calculateVATFromTotal(total, tipoDoc);

        // Get other fields
        const serie = sanitizeCSVField(String(values[colIndices.serie] || ""));
        const numero = sanitizeCSVField(String(values[colIndices.numero] || ""));
        const nit = sanitizeCSVField(String(values[colIndices.nit] || ""));
        const nombre = sanitizeCSVField(String(values[colIndices.nombre] || ""));

        if (!numero) {
          errors.push({
            row: rowNum,
            field: "Número",
            value: "(vacío)",
            message: "Número de factura es requerido"
          });
          continue;
        }

        if (!nombre) {
          errors.push({
            row: rowNum,
            field: "Nombre",
            value: "(vacío)",
            message: "Nombre del proveedor es requerido"
          });
          continue;
        }

        // Extract year/month for grouping
        const [yearStr, monthStr] = fecha.split("-");
        const year = parseInt(yearStr);
        const month = parseInt(monthStr);
        
        if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
          errors.push({
            row: rowNum,
            field: "Fecha",
            value: fecha,
            message: "Mes o año inválido"
          });
          continue;
        }

        const periodKey = `${year}-${String(month).padStart(2, '0')}`;
        
        if (!recordsByPeriod.has(periodKey)) {
          recordsByPeriod.set(periodKey, { month, year, records: [] });
        }

        recordsByPeriod.get(periodKey)!.records.push({
          invoice_series: serie,
          invoice_number: numero,
          invoice_date: fecha,
          fel_document_type: tipoDoc,
          supplier_nit: nit,
          supplier_name: nombre,
          base_amount: baseAmount,
          vat_amount: vatAmount,
          net_amount: baseAmount,
          total_amount: total,
        });
      }

      // Now create purchase books and build valid records
      const validRecords: ValidPurchase[] = [];
      const periodSummary: { period: string; count: number }[] = [];
      const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

      for (const [, periodData] of recordsByPeriod) {
        const { month, year, records } = periodData;
        
        // Find or create purchase book
        const book = await findOrCreatePurchaseBook(enterpriseId, month, year);

        for (const record of records) {
          validRecords.push({
            enterprise_id: enterpriseId,
            purchase_book_id: book.id,
            ...record
          });
        }

        periodSummary.push({
          period: `${monthNames[month - 1]} ${year}`,
          count: records.length
        });
      }

      setValidationResult({
        validRecords,
        errors,
        skippedAnuladas,
        periodSummary
      });
      
      // If we have expense accounts or operation types available, show options dialog
      if (expenseAccounts.length > 0 || operationTypes.length > 0) {
        setDialogState("options");
      } else {
        setDialogState("summary");
      }

    } catch (error: any) {
      toast({
        title: "Error al validar archivo",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
      resetDialog();
    }
  };

  const handleProceedToSummary = () => {
    if (validationResult && applyBulkOptions) {
      // Apply selected account and operation type to all records
      const updatedRecords = validationResult.validRecords.map(record => ({
        ...record,
        expense_account_id: selectedExpenseAccount,
        operation_type_id: selectedOperationType,
      }));
      setValidationResult({
        ...validationResult,
        validRecords: updatedRecords,
      });
    }
    setDialogState("summary");
  };

  const handleImport = async () => {
    if (!validationResult || validationResult.validRecords.length === 0) return;

    setImporting(true);

    try {
      const { error: insertError } = await supabase
        .from("tab_purchase_ledger")
        .insert(validationResult.validRecords);

      if (insertError) throw insertError;

      const summaryText = validationResult.periodSummary.map(s => `${s.count} en ${s.period}`).join(", ");
      
      toast({
        title: "Importación exitosa",
        description: `Se importaron ${validationResult.validRecords.length} registros: ${summaryText}`,
      });

      onSuccess();
      handleOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error al importar",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Importar Facturas de Compras</DialogTitle>
          <DialogDescription>
            {dialogState === "initial" && "Carga un archivo CSV o Excel exportado de SAT Guatemala."}
            {dialogState === "validating" && `Validando ${fileName}...`}
            {dialogState === "options" && "Opciones de importación"}
            {dialogState === "summary" && `Resultado de validación: ${fileName}`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {/* Initial State - File Upload */}
          {dialogState === "initial" && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button variant="outline" onClick={downloadTemplate} className="flex-1">
                  <Download className="h-4 w-4 mr-2" />
                  Descargar Plantilla
                </Button>
              </div>

              <div
                {...dragProps}
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
                  isDragging && "border-primary bg-primary/5",
                  !isDragging && "border-border"
                )}
              >
                <Upload className={cn("h-12 w-12 mx-auto mb-4", isDragging ? "text-primary" : "text-muted-foreground")} />
                <p className="text-sm text-muted-foreground mb-4">
                  {isDragging ? "Suelta el archivo aquí" : "Arrastra un archivo CSV o Excel, o haz clic para seleccionar"}
                </p>
                <input
                  type="file"
                  accept=".csv,.xls,.xlsx"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="file-upload-purchases"
                />
                <label htmlFor="file-upload-purchases">
                  <Button variant="outline" asChild>
                    <span>Seleccionar Archivo</span>
                  </Button>
                </label>
              </div>

              <div className="text-sm text-muted-foreground bg-muted/50 p-4 rounded-lg">
                <p className="font-medium mb-2">Formato SAT Guatemala - Columnas utilizadas:</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li><strong>Fecha de emisión:</strong> DD/MM/YYYY, YYYY-MM-DD o ISO 8601</li>
                  <li><strong>Serie:</strong> Serie de la factura</li>
                  <li><strong>Número del DTE:</strong> Número de factura</li>
                  <li><strong>Tipo de DTE:</strong> Tipo de documento</li>
                  <li><strong>NIT del emisor:</strong> NIT del proveedor</li>
                  <li><strong>Nombre completo del emisor:</strong> Nombre del proveedor</li>
                  <li><strong>Gran Total (Moneda Original):</strong> Monto total</li>
                  <li><strong>IVA (monto de este impuesto):</strong> Monto del IVA</li>
                  <li><strong>Marca de anulado:</strong> Se excluyen facturas anuladas (S/Si/No)</li>
                </ul>
              </div>
            </div>
          )}

          {/* Validating State - Loading Spinner */}
          {dialogState === "validating" && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
              <p className="text-lg font-medium">Validando archivo...</p>
              <p className="text-sm text-muted-foreground">Verificando formato y datos</p>
            </div>
          )}

          {/* Options State - Account and Operation Type Selection */}
          {dialogState === "options" && validationResult && (
            <div className="space-y-6">
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm">
                  Se encontraron <strong>{validationResult.validRecords.length}</strong> registros válidos para importar.
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-1">
                    <Label htmlFor="apply-bulk-purchases" className="text-base font-medium">
                      ¿Aplicar cuenta y tipo de operación a todos los documentos?
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Si activas esta opción, todos los documentos importados tendrán la misma cuenta contable y tipo de operación.
                    </p>
                  </div>
                  <Switch
                    id="apply-bulk-purchases"
                    checked={applyBulkOptions}
                    onCheckedChange={setApplyBulkOptions}
                  />
                </div>

                {applyBulkOptions && (
                  <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                    {expenseAccounts.length > 0 && (
                      <div className="space-y-2">
                        <Label>Cuenta de Gasto</Label>
                        <Select
                          value={selectedExpenseAccount?.toString() || ""}
                          onValueChange={(val) => setSelectedExpenseAccount(val ? parseInt(val) : null)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar cuenta..." />
                          </SelectTrigger>
                          <SelectContent>
                            {expenseAccounts.map((acc) => (
                              <SelectItem key={acc.id} value={acc.id.toString()}>
                                {acc.account_code} - {acc.account_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {operationTypes.length > 0 && (
                      <div className="space-y-2">
                        <Label>Tipo de Operación</Label>
                        <Select
                          value={selectedOperationType?.toString() || ""}
                          onValueChange={(val) => setSelectedOperationType(val ? parseInt(val) : null)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar tipo..." />
                          </SelectTrigger>
                          <SelectContent>
                            {operationTypes.map((op) => (
                              <SelectItem key={op.id} value={op.id.toString()}>
                                {op.code} - {op.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={resetDialog} className="flex-1">
                  Cancelar
                </Button>
                <Button onClick={handleProceedToSummary} className="flex-1">
                  Continuar
                </Button>
              </div>
            </div>
          )}

          {/* Summary State - Validation Results */}
          {dialogState === "summary" && validationResult && (
            <div className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                    <span className="text-sm font-medium text-green-800 dark:text-green-200">Válidos</span>
                  </div>
                  <p className="text-2xl font-bold text-green-700 dark:text-green-300 mt-1">
                    {validationResult.validRecords.length}
                  </p>
                </div>
                
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    <span className="text-sm font-medium text-amber-800 dark:text-amber-200">Anulados</span>
                  </div>
                  <p className="text-2xl font-bold text-amber-700 dark:text-amber-300 mt-1">
                    {validationResult.skippedAnuladas}
                  </p>
                </div>
                
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                    <span className="text-sm font-medium text-red-800 dark:text-red-200">Errores</span>
                  </div>
                  <p className="text-2xl font-bold text-red-700 dark:text-red-300 mt-1">
                    {validationResult.errors.length}
                  </p>
                </div>
              </div>

              {/* Period Summary */}
              {validationResult.periodSummary.length > 0 && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-sm font-medium mb-2">Distribución por período:</p>
                  <div className="flex flex-wrap gap-2">
                    {validationResult.periodSummary.map((ps) => (
                      <span key={ps.period} className="bg-primary/10 text-primary text-xs px-2 py-1 rounded">
                        {ps.count} en {ps.period}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Error Details Table */}
              {validationResult.errors.length > 0 && (
                <div className="border rounded-lg">
                  <div className="bg-muted/50 px-4 py-2 border-b flex items-center gap-2">
                    <FileWarning className="h-4 w-4 text-destructive" />
                    <span className="text-sm font-medium">Errores Detectados ({validationResult.errors.length})</span>
                  </div>
                  <ScrollArea className="h-[200px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16">Fila</TableHead>
                          <TableHead className="w-24">Campo</TableHead>
                          <TableHead className="w-32">Valor</TableHead>
                          <TableHead>Error</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {validationResult.errors.map((err, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-mono text-xs">{err.row}</TableCell>
                            <TableCell className="text-xs">{err.field}</TableCell>
                            <TableCell className="font-mono text-xs max-w-[120px] truncate" title={err.value}>
                              {err.value}
                            </TableCell>
                            <TableCell className="text-xs text-destructive">{err.message}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              )}

              {/* No valid records warning */}
              {validationResult.validRecords.length === 0 && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-center">
                  <XCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
                  <p className="font-medium text-destructive">No hay registros válidos para importar</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Revisa los errores arriba y corrige el archivo antes de volver a intentar.
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={resetDialog} className="flex-1">
                  Seleccionar Otro Archivo
                </Button>
                <Button 
                  onClick={handleImport} 
                  disabled={validationResult.validRecords.length === 0 || importing}
                  className="flex-1"
                >
                  {importing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Importando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Importar {validationResult.validRecords.length} Registros
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
