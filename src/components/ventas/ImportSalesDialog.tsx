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
import { Upload, Download, CheckCircle2, XCircle, AlertTriangle, Loader2, FileWarning, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSafeErrorMessage, sanitizeCSVField } from "@/utils/errorMessages";
import {
  normalizeHeader,
  SAT_SALES_MAPPING,
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface ImportSalesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enterpriseId: number | null;
  enterpriseNit?: string;
  onSuccess: () => void;
  incomeAccounts?: Array<{ id: number; account_code: string; account_name: string }>;
  operationTypes?: Array<{ id: number; code: string; name: string }>;
}

interface ValidationError {
  row: number;
  field: string;
  value: string;
  message: string;
}

interface ValidSale {
  enterprise_id: number;
  accounting_period_id: number;
  invoice_series: string;
  invoice_number: string;
  invoice_date: string;
  fel_document_type: string;
  authorization_number: string;
  customer_nit: string;
  customer_name: string;
  net_amount: number;
  vat_amount: number;
  total_amount: number;
  income_account_id?: number | null;
  operation_type_id?: number | null;
  is_annulled: boolean;
  establishment_code?: string | null;
  establishment_name?: string | null;
}

interface ValidationResult {
  validRecords: ValidSale[];
  errors: ValidationError[];
  annulledCount: number;
  duplicatesCount: number;
  periodSummary: { period: string; count: number }[];
}

type DialogState = "initial" | "validating" | "summary";

// Helper to find accounting period for a given date
async function findAccountingPeriod(
  enterpriseId: number,
  invoiceDate: string
): Promise<{ id: number } | null> {
  const { data: period, error } = await supabase
    .from("tab_accounting_periods")
    .select("id")
    .eq("enterprise_id", enterpriseId)
    .lte("start_date", invoiceDate)
    .gte("end_date", invoiceDate)
    .eq("status", "abierto")
    .maybeSingle();

  if (error) throw error;
  return period;
}

// Check if invoice already exists in database (must match unique index: tipo + serie + numero + mes + año + empresa)
function buildSaleUniqueKey(input: {
  fel_document_type: string;
  invoice_series: string;
  invoice_number: string;
  invoice_date: string; // YYYY-MM-DD
}): string {
  const [year, month] = input.invoice_date.split("-");
  return [
    (input.fel_document_type || "").trim(),
    (input.invoice_series || "").trim(),
    (input.invoice_number || "").trim(),
    month,
    year,
  ].join("|");
}

async function checkDuplicates(
  enterpriseId: number,
  records: Array<{
    invoice_date: string;
    fel_document_type: string;
    invoice_series: string;
    invoice_number: string;
  }>
): Promise<Set<string>> {
  const duplicateKeys = new Set<string>();

  if (records.length === 0) return duplicateKeys;

  const invoiceNumbers = Array.from(new Set(records.map((r) => r.invoice_number).filter(Boolean)));
  const docTypes = Array.from(new Set(records.map((r) => r.fel_document_type).filter(Boolean)));
  const minDate = records.reduce(
    (min, r) => (!min || r.invoice_date < min ? r.invoice_date : min),
    ""
  );
  const maxDate = records.reduce(
    (max, r) => (!max || r.invoice_date > max ? r.invoice_date : max),
    ""
  );

  if (!minDate || !maxDate || invoiceNumbers.length === 0) return duplicateKeys;

  // NOTE: We query by enterprise + date range + invoice_number + doc type.
  // Series is checked client-side because the DB uniqueness uses COALESCE(invoice_series,'').
  const { data: existing, error } = await supabase
    .from("tab_sales_ledger")
    .select("fel_document_type, invoice_series, invoice_number, invoice_date")
    .eq("enterprise_id", enterpriseId)
    .gte("invoice_date", minDate)
    .lte("invoice_date", maxDate)
    .in("invoice_number", invoiceNumbers)
    .in("fel_document_type", docTypes);

  if (error) {
    console.error("Error checking duplicates:", error);
    return duplicateKeys;
  }

  for (const row of existing || []) {
    duplicateKeys.add(
      buildSaleUniqueKey({
        fel_document_type: row.fel_document_type,
        invoice_series: row.invoice_series || "",
        invoice_number: row.invoice_number,
        invoice_date: row.invoice_date,
      })
    );
  }

  return duplicateKeys;
}

// Parse file (CSV or Excel) and return rows as 2D array
async function parseFile(file: File): Promise<any[][]> {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "xls" || extension === "xlsx") {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: false }) as any[][];
    return data.filter((row) => row.some((cell) => cell !== undefined && cell !== null && cell !== ""));
  } else {
    const text = await file.text();
    const lines = text.split("\n").filter((line) => line.trim());
    return lines.map((line) => parseCSVLine(line));
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
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

export function ImportSalesDialog({
  open,
  onOpenChange,
  enterpriseId,
  enterpriseNit = "",
  incomeAccounts = [],
  operationTypes = [],
  onSuccess,
}: ImportSalesDialogProps) {
  const { toast } = useToast();
  const [dialogState, setDialogState] = useState<DialogState>("initial");
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState<string>("");

  // Options for bulk assignment - shown in summary view
  const [applyBulkOptions, setApplyBulkOptions] = useState(false);
  const [selectedIncomeAccount, setSelectedIncomeAccount] = useState<number | null>(null);
  const [selectedOperationType, setSelectedOperationType] = useState<number | null>(null);

  const { isDragging, dragProps } = useFileDrop({
    accept: [
      ".csv",
      ".xls",
      ".xlsx",
      "text/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
    onFile: (file) => handleValidate(file),
    onError: (message) => toast({ variant: "destructive", title: "Error", description: message }),
    disabled: dialogState !== "initial",
  });

  const resetDialog = () => {
    setDialogState("initial");
    setValidationResult(null);
    setFileName("");
    setApplyBulkOptions(false);
    setSelectedIncomeAccount(null);
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
      "ID del receptor",
      "Nombre completo del receptor",
      "Gran Total (Moneda Original)",
      "IVA (monto de este impuesto)",
      "Marca de anulado",
    ];

    const csvContent =
      headers.join(",") +
      "\n" +
      "15/01/2025,ABC123456789,FACT,A,12345,12345678,Cliente Ejemplo S.A.,112.00,12.00,No\n" +
      "20/02/2025,DEF987654321,FACT,B,67890,87654321,Otro Cliente S.A.,224.00,24.00,No";

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "plantilla_ventas_sat.csv";
    link.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleValidate(file);
    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  const handleValidate = async (file: File) => {
    if (!enterpriseId) return;

    setFileName(file.name);
    setDialogState("validating");

    try {
      const rows = await parseFile(file);

      if (rows.length < 2) {
        throw new Error("El archivo está vacío o no tiene datos");
      }

      // Parse headers
      const rawHeaders = rows[0].map((h) => String(h || "").trim());
      const normalizedHeaders = rawHeaders.map(normalizeHeader);

      // Detect if SAT format
      const useSATFormat = isSATFormat(rawHeaders);

      // Get column indices based on format
      let colIndices: Record<string, number>;

      if (useSATFormat) {
        colIndices = {
          fecha: findSATColumnIndex(normalizedHeaders, SAT_SALES_MAPPING.fecha),
          serie: findSATColumnIndex(normalizedHeaders, SAT_SALES_MAPPING.serie),
          numero: findSATColumnIndex(normalizedHeaders, SAT_SALES_MAPPING.numero),
          tipo_documento: findSATColumnIndex(normalizedHeaders, SAT_SALES_MAPPING.tipo_documento),
          numero_autorizacion: findSATColumnIndex(normalizedHeaders, SAT_SALES_MAPPING.numero_autorizacion),
          nit: findSATColumnIndex(normalizedHeaders, SAT_SALES_MAPPING.nit),
          nombre: findSATColumnIndex(normalizedHeaders, SAT_SALES_MAPPING.nombre),
          total: findSATColumnIndex(normalizedHeaders, SAT_SALES_MAPPING.total),
          iva: findSATColumnIndex(normalizedHeaders, SAT_SALES_MAPPING.iva),
          anulado: findSATColumnIndex(normalizedHeaders, SAT_SALES_MAPPING.anulado),
          nit_emisor: findSATColumnIndex(normalizedHeaders, SAT_SALES_MAPPING.nit_emisor),
          codigo_establecimiento: findSATColumnIndex(normalizedHeaders, SAT_SALES_MAPPING.codigo_establecimiento),
          nombre_establecimiento: findSATColumnIndex(normalizedHeaders, SAT_SALES_MAPPING.nombre_establecimiento),
        };

        // Validate enterprise NIT from file matches active enterprise
        if (enterpriseNit && colIndices.nit_emisor !== -1 && rows.length > 1) {
          const firstDataRow = rows[1];
          const fileNitEmisor = sanitizeCSVField(String(firstDataRow[colIndices.nit_emisor] || "")).replace(
            /[-\s]/g,
            ""
          );
          const cleanEnterpriseNit = enterpriseNit.replace(/[-\s]/g, "");

          if (fileNitEmisor && fileNitEmisor !== cleanEnterpriseNit) {
            throw new Error(
              `El NIT del emisor en el archivo (${fileNitEmisor}) no coincide con el NIT de la empresa activa (${cleanEnterpriseNit}). Asegúrese de seleccionar la empresa correcta.`
            );
          }
        }
      } else {
        colIndices = {
          fecha: normalizedHeaders.indexOf("fecha"),
          serie: normalizedHeaders.indexOf("serie"),
          numero: normalizedHeaders.indexOf("numero"),
          tipo_documento: normalizedHeaders.indexOf("tipo_documento_fel"),
          numero_autorizacion: normalizedHeaders.indexOf("numero_autorizacion"),
          nit: normalizedHeaders.indexOf("nit_cliente"),
          nombre: normalizedHeaders.indexOf("nombre_cliente"),
          total: normalizedHeaders.indexOf("total"),
          iva: normalizedHeaders.indexOf("iva"),
          anulado: -1,
        };
      }

      // Validate required columns - IVA column is now optional since we calculate from total
      const requiredCols = ["fecha", "numero", "numero_autorizacion", "nit", "nombre", "total"];
      const missingCols = requiredCols.filter((c) => colIndices[c] === -1);

      if (missingCols.length > 0) {
        throw new Error(
          `No se encontraron las columnas requeridas: ${missingCols.join(", ")}. Asegúrese de usar el formato de exportación de SAT Guatemala.`
        );
      }

      // First pass: collect all candidate keys for duplicate checking (matches DB unique index)
      const recordsToCheck: Array<{
        invoice_date: string;
        fel_document_type: string;
        invoice_series: string;
        invoice_number: string;
      }> = [];

      for (let i = 1; i < rows.length; i++) {
        const values = rows[i];
        if (!values || values.length < 5) continue;

        const fecha = parseDateFlexible(values[colIndices.fecha]);
        if (!fecha) continue;

        const tipoDoc = sanitizeCSVField(String(values[colIndices.tipo_documento] || "FACT"));
        const serie = sanitizeCSVField(String(values[colIndices.serie] || ""));
        const numero = sanitizeCSVField(String(values[colIndices.numero] || ""));

        if (!numero) continue;

        recordsToCheck.push({
          invoice_date: fecha,
          fel_document_type: tipoDoc,
          invoice_series: serie,
          invoice_number: numero,
        });
      }

      // Check for duplicates in database
      const existingKeys = await checkDuplicates(enterpriseId, recordsToCheck);

      // Process rows for validation
      const validRecords: ValidSale[] = [];
      const errors: ValidationError[] = [];
      let annulledCount = 0;
      let duplicatesCount = 0;
      const periodCounts = new Map<string, number>();
      const seenInFile = new Set<string>(); // Track duplicates within file

      for (let i = 1; i < rows.length; i++) {
        const values = rows[i];
        if (!values || values.length < 5) continue;

        const rowNum = i + 1;

        // Check if anulado - will be imported but marked as annulled
        const isAnnulled = colIndices.anulado !== -1 && isAnulado(values[colIndices.anulado]);

        // Parse date
        const rawDate = values[colIndices.fecha];
        const fecha = parseDateFlexible(rawDate);

        if (!fecha) {
          errors.push({
            row: rowNum,
            field: "Fecha",
            value: String(rawDate || "(vacío)"),
            message: "Fecha inválida o formato no reconocido",
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
            message: "El total debe ser mayor a cero",
          });
          continue;
        }

        // Calculate VAT based on document type - SAT exports may have incorrect IVA values
        const { vatAmount, baseAmount } = calculateVATFromTotal(total, tipoDoc);

        // Get other fields
        const serie = sanitizeCSVField(String(values[colIndices.serie] || ""));
        const numero = sanitizeCSVField(String(values[colIndices.numero] || ""));
        const numAutorizacion = sanitizeCSVField(String(values[colIndices.numero_autorizacion] || ""));
        const nit = sanitizeCSVField(String(values[colIndices.nit] || ""));
        const nombre = sanitizeCSVField(String(values[colIndices.nombre] || ""));

        if (!numero) {
          errors.push({ row: rowNum, field: "Número", value: "(vacío)", message: "Número de factura es requerido" });
          continue;
        }

        if (!numAutorizacion) {
          errors.push({
            row: rowNum,
            field: "Autorización",
            value: "(vacío)",
            message: "Número de autorización es requerido",
          });
          continue;
        }

        if (!nombre) {
          errors.push({ row: rowNum, field: "Nombre", value: "(vacío)", message: "Nombre del cliente es requerido" });
          continue;
        }

        // Check for duplicates in DB and within file using the same key used by DB uniqueness
        const uniqueKey = buildSaleUniqueKey({
          fel_document_type: tipoDoc,
          invoice_series: serie,
          invoice_number: numero,
          invoice_date: fecha,
        });

        if (existingKeys.has(uniqueKey)) {
          errors.push({
            row: rowNum,
            field: "Duplicado",
            value: `${tipoDoc} ${serie}-${numero} (${fecha})`,
            message: "Esta factura ya existe en la base de datos (mismo mes/año)",
          });
          duplicatesCount++;
          continue;
        }

        if (seenInFile.has(uniqueKey)) {
          errors.push({
            row: rowNum,
            field: "Duplicado",
            value: `${tipoDoc} ${serie}-${numero} (${fecha})`,
            message: "Esta factura está duplicada en el archivo",
          });
          duplicatesCount++;
          continue;
        }
        seenInFile.add(uniqueKey);

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

        // Find accounting period for this invoice date
        const period = await findAccountingPeriod(enterpriseId, fecha);
        
        if (!period) {
          errors.push({
            row: rowNum,
            field: "Período",
            value: fecha,
            message: `No existe período contable abierto para esta fecha`
          });
          continue;
        }

        const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
        const periodKey = `${monthNames[month - 1]} ${year}`;
        periodCounts.set(periodKey, (periodCounts.get(periodKey) || 0) + 1);

        if (isAnnulled) {
          annulledCount++;
        }

        // Extract establishment data if available
        const establecimientoCodigo = colIndices.codigo_establecimiento !== -1 
          ? sanitizeCSVField(String(values[colIndices.codigo_establecimiento] || "")).trim() || null
          : null;
        const establecimientoNombre = colIndices.nombre_establecimiento !== -1 
          ? sanitizeCSVField(String(values[colIndices.nombre_establecimiento] || "")).trim() || null
          : null;

        validRecords.push({
          enterprise_id: enterpriseId,
          accounting_period_id: period.id,
          invoice_series: serie,
          invoice_number: numero,
          invoice_date: fecha,
          fel_document_type: tipoDoc,
          authorization_number: numAutorizacion,
          customer_nit: nit,
          customer_name: nombre,
          net_amount: baseAmount,
          vat_amount: vatAmount,
          total_amount: total,
          is_annulled: isAnnulled,
          establishment_code: establecimientoCodigo,
          establishment_name: establecimientoNombre,
        });
      }

      const periodSummary = Array.from(periodCounts.entries()).map(([period, count]) => ({
        period,
        count
      }));

      setValidationResult({
        validRecords,
        errors,
        annulledCount,
        duplicatesCount,
        periodSummary
      });
      
      setDialogState("summary");

    } catch (error: any) {
      toast({
        title: "Error al validar archivo",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
      resetDialog();
    }
  };

  const handleImport = async () => {
    if (!validationResult || validationResult.validRecords.length === 0) return;

    setImporting(true);

    try {
      // Apply bulk options if enabled
      let recordsToInsert = validationResult.validRecords;
      if (applyBulkOptions) {
        recordsToInsert = validationResult.validRecords.map(record => ({
          ...record,
          income_account_id: selectedIncomeAccount,
          operation_type_id: selectedOperationType,
        }));
      }

      const { error: insertError } = await supabase
        .from("tab_sales_ledger")
        .insert(recordsToInsert);

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

  const hasOptions = incomeAccounts.length > 0 || operationTypes.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Importar Facturas de Ventas</DialogTitle>
          <DialogDescription>
            {dialogState === "initial" && "Carga un archivo CSV o Excel exportado de SAT Guatemala."}
            {dialogState === "validating" && `Validando ${fileName}...`}
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
                  id="file-upload-sales"
                />
                <label htmlFor="file-upload-sales">
                  <Button variant="outline" asChild>
                    <span>Seleccionar Archivo</span>
                  </Button>
                </label>
              </div>

              <div className="text-sm text-muted-foreground bg-muted/50 p-4 rounded-lg">
                <p className="font-medium mb-2">Formato SAT Guatemala - Columnas utilizadas:</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li><strong>Fecha de emisión:</strong> DD/MM/YYYY, YYYY-MM-DD o ISO 8601</li>
                  <li><strong>Número de Autorización:</strong> Número de autorización FEL</li>
                  <li><strong>Serie:</strong> Serie de la factura</li>
                  <li><strong>Número del DTE:</strong> Número de factura</li>
                  <li><strong>Tipo de DTE:</strong> Tipo de documento</li>
                  <li><strong>ID del receptor:</strong> NIT del cliente</li>
                  <li><strong>Nombre completo del receptor:</strong> Nombre del cliente</li>
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
              <p className="text-sm text-muted-foreground">Verificando formato, datos y duplicados</p>
            </div>
          )}

          {/* Summary State - Validation Results with Options */}
          {dialogState === "summary" && validationResult && (
            <ScrollArea className="h-[60vh] pr-4">
              <div className="space-y-4">
                {/* Summary Cards */}
                <div className="grid grid-cols-4 gap-3">
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
                      <span className="text-sm font-medium text-amber-800 dark:text-amber-200">Anuladas</span>
                    </div>
                    <p className="text-2xl font-bold text-amber-700 dark:text-amber-300 mt-1">
                      {validationResult.annulledCount}
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-400">Se importarán marcadas</p>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <Copy className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      <span className="text-sm font-medium text-blue-800 dark:text-blue-200">Duplicados</span>
                    </div>
                    <p className="text-2xl font-bold text-blue-700 dark:text-blue-300 mt-1">
                      {validationResult.duplicatesCount}
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

                {/* Bulk Options - Integrated in summary view */}
                {hasOptions && validationResult.validRecords.length > 0 && (
                  <div className="border rounded-lg">
                    <div className="flex items-center justify-between p-4">
                      <div className="space-y-1">
                        <Label htmlFor="apply-bulk" className="text-sm font-medium">
                          Aplicar cuenta y tipo de operación a todos
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Asignar la misma cuenta contable y tipo de operación a los {validationResult.validRecords.length} documentos
                        </p>
                      </div>
                      <Switch
                        id="apply-bulk"
                        checked={applyBulkOptions}
                        onCheckedChange={setApplyBulkOptions}
                      />
                    </div>

                    {applyBulkOptions && (
                      <div className="border-t px-4 py-3 space-y-3 bg-muted/30">
                        {incomeAccounts.length > 0 && (
                          <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                            <Label className="text-sm">Cuenta Ingreso:</Label>
                            <Select
                              value={selectedIncomeAccount?.toString() || ""}
                              onValueChange={(val) => setSelectedIncomeAccount(val ? parseInt(val) : null)}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Seleccionar cuenta..." />
                              </SelectTrigger>
                              <SelectContent>
                                {incomeAccounts.map((acc) => (
                                  <SelectItem key={acc.id} value={acc.id.toString()}>
                                    {acc.account_code} - {acc.account_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {operationTypes.length > 0 && (
                          <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                            <Label className="text-sm">Tipo Operación:</Label>
                            <Select
                              value={selectedOperationType?.toString() || ""}
                              onValueChange={(val) => setSelectedOperationType(val ? parseInt(val) : null)}
                            >
                              <SelectTrigger className="h-9">
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
                )}

                {/* Error Details Table */}
                {validationResult.errors.length > 0 && (
                  <Collapsible defaultOpen={validationResult.errors.length <= 10}>
                    <div className="border rounded-lg">
                      <CollapsibleTrigger className="w-full bg-muted/50 px-4 py-2 border-b flex items-center justify-between hover:bg-muted/70 transition-colors">
                        <div className="flex items-center gap-2">
                          <FileWarning className="h-4 w-4 text-destructive" />
                          <span className="text-sm font-medium">Errores Detectados ({validationResult.errors.length})</span>
                        </div>
                        <span className="text-xs text-muted-foreground">Click para expandir/colapsar</span>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
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
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
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
                <div className="flex gap-3 pt-2 sticky bottom-0 bg-background pb-2">
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
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
