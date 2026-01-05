import { useState, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useFileDrop } from "@/hooks/use-file-drop";
import { ColumnMappingForm } from "./ColumnMappingForm";
import { BankStatementPreviewTable } from "./BankStatementPreviewTable";
import {
  ColumnMapping,
  ParsedBankRow,
  ValidationSummary,
  autoDetectColumns,
  validateData,
  generateExampleTemplate,
} from "@/utils/bankStatementParsing";
import {
  Upload,
  FileSpreadsheet,
  Download,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  FileX,
  Loader2,
  Save,
} from "lucide-react";
import * as XLSX from "xlsx";

type WizardStep = "upload" | "mapping" | "confirm";

interface BankAccount {
  id: number;
  account_code: string;
  account_name: string;
}

interface ImportTemplate {
  id: number;
  template_name: string;
  column_mapping: ColumnMapping;
  header_row: number;
  bank_account_id: number | null;
}

interface ImportBankStatementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enterpriseId: string;
  onImportSuccess: () => void;
}

export function ImportBankStatementDialog({
  open,
  onOpenChange,
  enterpriseId,
  onImportSuccess,
}: ImportBankStatementDialogProps) {
  const { toast } = useToast();
  
  // Wizard state
  const [step, setStep] = useState<WizardStep>("upload");
  const [isLoading, setIsLoading] = useState(false);
  
  // Upload step state
  const [file, setFile] = useState<File | null>(null);
  const [rawData, setRawData] = useState<(string | number | null | undefined)[][]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [templates, setTemplates] = useState<ImportTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  
  // Mapping step state
  const [headers, setHeaders] = useState<string[]>([]);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>({
    fecha: null,
    descripcion: null,
    referencia: null,
    debito: null,
    credito: null,
    saldo: null,
  });
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  
  // Confirm step state
  const [parsedRows, setParsedRows] = useState<ParsedBankRow[]>([]);
  const [summary, setSummary] = useState<ValidationSummary>({
    totalRows: 0,
    validRows: 0,
    errorRows: 0,
    emptyRows: 0,
  });

  // Fetch bank accounts and templates
  useEffect(() => {
    if (open && enterpriseId) {
      fetchBankAccounts();
      fetchTemplates();
    }
  }, [open, enterpriseId]);

  const fetchBankAccounts = async () => {
    const { data, error } = await supabase
      .from("tab_accounts")
      .select("id, account_code, account_name")
      .eq("enterprise_id", parseInt(enterpriseId))
      .eq("is_bank_account", true)
      .eq("is_active", true)
      .order("account_code");

    if (error) {
      console.error("Error fetching bank accounts:", error);
      return;
    }

    setBankAccounts(data || []);
  };

  const fetchTemplates = async () => {
    const { data, error } = await supabase
      .from("tab_bank_import_templates")
      .select("id, template_name, column_mapping, header_row, bank_account_id")
      .eq("enterprise_id", parseInt(enterpriseId))
      .order("template_name");

    if (error) {
      console.error("Error fetching templates:", error);
      return;
    }

    setTemplates((data || []).map(t => ({
      ...t,
      column_mapping: t.column_mapping as unknown as ColumnMapping,
    })));
  };

  // File drop handler
  const handleFile = useCallback(async (uploadedFile: File) => {
    setFile(uploadedFile);
    setIsLoading(true);

    try {
      const data = await parseExcelFile(uploadedFile);
      setRawData(data);
      
      // Extraer headers de la primera fila
      if (data.length > 0) {
        const headerValues = data[0].map(cell => String(cell ?? ''));
        setHeaders(headerValues);
        
        // Auto-detectar columnas
        const detectedMapping = autoDetectColumns(headerValues);
        setMapping(detectedMapping);
      }
      
      toast({
        title: "Archivo cargado",
        description: `${data.length} filas encontradas`,
      });
    } catch (error) {
      console.error("Error parsing file:", error);
      toast({
        title: "Error al leer archivo",
        description: "No se pudo procesar el archivo. Verifique el formato.",
        variant: "destructive",
      });
      setFile(null);
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const { isDragging, dragProps } = useFileDrop({
    accept: [".xlsx", ".xls", ".csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "text/csv"],
    maxSize: 10 * 1024 * 1024, // 10MB
    onFile: handleFile,
    onError: (message) => toast({ title: "Error", description: message, variant: "destructive" }),
  });

  // Parse Excel/CSV file
  const parseExcelFile = async (file: File): Promise<(string | number | null | undefined)[][]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: "array", cellDates: true });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json<(string | number | null | undefined)[]>(firstSheet, { header: 1 });
          resolve(jsonData);
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => reject(new Error("Error reading file"));
      reader.readAsArrayBuffer(file);
    });
  };

  // Apply template
  const handleApplyTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find(t => t.id.toString() === templateId);
    if (template) {
      setMapping(template.column_mapping);
      setHeaderRow(template.header_row);
      if (template.bank_account_id) {
        setSelectedAccountId(template.bank_account_id.toString());
      }
    }
  };

  // Download example template
  const handleDownloadTemplate = () => {
    const templateData = generateExampleTemplate();
    const ws = XLSX.utils.aoa_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Extracto Bancario");
    XLSX.writeFile(wb, "plantilla_extracto_bancario.xlsx");
  };

  // Validate mapping
  const isMappingValid = (): boolean => {
    return (
      mapping.fecha !== null &&
      mapping.descripcion !== null &&
      mapping.debito !== null &&
      mapping.credito !== null
    );
  };

  // Move to mapping step
  const handleNextToMapping = () => {
    if (!selectedAccountId) {
      toast({
        title: "Seleccione cuenta bancaria",
        description: "Debe seleccionar la cuenta bancaria destino",
        variant: "destructive",
      });
      return;
    }
    setStep("mapping");
  };

  // Move to confirm step
  const handleNextToConfirm = () => {
    if (!isMappingValid()) {
      toast({
        title: "Mapeo incompleto",
        description: "Debe mapear los campos requeridos: Fecha, Descripción, Débito y Crédito",
        variant: "destructive",
      });
      return;
    }

    const { rows, summary: validationSummary } = validateData(rawData, mapping, headerRow);
    setParsedRows(rows);
    setSummary(validationSummary);
    setStep("confirm");
  };

  // Toggle row selection
  const handleToggleRow = (rowNumber: number) => {
    setParsedRows(prev =>
      prev.map(row =>
        row.rowNumber === rowNumber ? { ...row, selected: !row.selected } : row
      )
    );
  };

  // Toggle all rows
  const handleToggleAll = (selected: boolean) => {
    setParsedRows(prev =>
      prev.map(row => (row.isValid ? { ...row, selected } : row))
    );
  };

  // Update mapping field
  const handleMappingChange = (field: keyof ColumnMapping, value: number | null) => {
    setMapping(prev => ({ ...prev, [field]: value }));
  };

  // Save template
  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      toast({
        title: "Nombre requerido",
        description: "Ingrese un nombre para la plantilla",
        variant: "destructive",
      });
      return;
    }

    const { error } = await supabase.from("tab_bank_import_templates").insert([{
      enterprise_id: parseInt(enterpriseId),
      bank_account_id: selectedAccountId ? parseInt(selectedAccountId) : null,
      template_name: templateName.trim(),
      column_mapping: JSON.parse(JSON.stringify(mapping)),
      header_row: headerRow,
    }]);

    if (error) {
      toast({
        title: "Error",
        description: "No se pudo guardar la plantilla",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Plantilla guardada",
      description: `"${templateName}" guardada exitosamente`,
    });
    
    setSaveAsTemplate(false);
    setTemplateName("");
    fetchTemplates();
  };

  // Import movements
  const handleImport = async () => {
    const selectedRows = parsedRows.filter(row => row.selected && row.isValid);
    
    if (selectedRows.length === 0) {
      toast({
        title: "Sin movimientos",
        description: "No hay movimientos seleccionados para importar",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const movements = selectedRows.map(row => ({
        enterprise_id: parseInt(enterpriseId),
        bank_account_id: parseInt(selectedAccountId),
        movement_date: row.fecha?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
        description: row.descripcion,
        reference: row.referencia || null,
        debit_amount: row.debito,
        credit_amount: row.credito,
        balance: row.saldo,
        is_reconciled: false,
      }));

      const { error } = await supabase.from("tab_bank_movements").insert(movements);

      if (error) throw error;

      toast({
        title: "Importación exitosa",
        description: `${selectedRows.length} movimientos importados correctamente`,
      });

      onImportSuccess();
      handleClose();
    } catch (error) {
      console.error("Error importing movements:", error);
      toast({
        title: "Error de importación",
        description: "No se pudieron importar los movimientos",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Reset and close
  const handleClose = () => {
    setStep("upload");
    setFile(null);
    setRawData([]);
    setHeaders([]);
    setMapping({
      fecha: null,
      descripcion: null,
      referencia: null,
      debito: null,
      credito: null,
      saldo: null,
    });
    setParsedRows([]);
    setSummary({ totalRows: 0, validRows: 0, errorRows: 0, emptyRows: 0 });
    setSelectedAccountId("");
    setSelectedTemplateId("");
    setSaveAsTemplate(false);
    setTemplateName("");
    setHeaderRow(0);
    onOpenChange(false);
  };

  // Get selected count
  const selectedCount = parsedRows.filter(r => r.selected && r.isValid).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Importar Extracto Bancario
          </DialogTitle>
          <DialogDescription>
            {step === "upload" && "Paso 1 de 3: Cargar archivo"}
            {step === "mapping" && "Paso 2 de 3: Mapear columnas"}
            {step === "confirm" && "Paso 3 de 3: Confirmar importación"}
          </DialogDescription>
        </DialogHeader>

        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 py-2">
          {["upload", "mapping", "confirm"].map((s, i) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step === s
                    ? "bg-primary text-primary-foreground"
                    : i < ["upload", "mapping", "confirm"].indexOf(step)
                    ? "bg-green-500 text-white"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {i < ["upload", "mapping", "confirm"].indexOf(step) ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  i + 1
                )}
              </div>
              {i < 2 && (
                <div
                  className={`w-12 h-0.5 mx-1 ${
                    i < ["upload", "mapping", "confirm"].indexOf(step)
                      ? "bg-green-500"
                      : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-auto py-4">
          {/* Step 1: Upload */}
          {step === "upload" && (
            <div className="space-y-6">
              {/* Bank account selector */}
              <div className="space-y-2">
                <Label htmlFor="bank-account">Cuenta Bancaria Destino *</Label>
                <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                  <SelectTrigger id="bank-account">
                    <SelectValue placeholder="Seleccionar cuenta bancaria" />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id.toString()}>
                        {account.account_code} - {account.account_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Template selector */}
              {templates.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="template">Usar plantilla guardada (opcional)</Label>
                  <Select value={selectedTemplateId} onValueChange={handleApplyTemplate}>
                    <SelectTrigger id="template">
                      <SelectValue placeholder="Seleccionar plantilla" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id.toString()}>
                          {template.template_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Drop zone */}
              <div
                {...dragProps}
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  isDragging
                    ? "border-primary bg-primary/5"
                    : file
                    ? "border-green-500 bg-green-500/5"
                    : "border-muted-foreground/25 hover:border-primary/50"
                }`}
              >
                {isLoading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p>Procesando archivo...</p>
                  </div>
                ) : file ? (
                  <div className="flex flex-col items-center gap-2">
                    <FileSpreadsheet className="h-10 w-10 text-green-500" />
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {rawData.length} filas encontradas
                    </p>
                    <Button variant="ghost" size="sm" onClick={() => setFile(null)}>
                      <FileX className="h-4 w-4 mr-1" />
                      Cambiar archivo
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-10 w-10 text-muted-foreground" />
                    <p className="font-medium">Arrastrar archivo aquí o</p>
                    <label>
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                      />
                      <Button variant="secondary" asChild>
                        <span>Seleccionar archivo</span>
                      </Button>
                    </label>
                    <p className="text-sm text-muted-foreground">
                      Formatos aceptados: Excel (.xlsx, .xls) o CSV
                    </p>
                  </div>
                )}
              </div>

              {/* Download template button */}
              <div className="flex justify-center">
                <Button variant="outline" onClick={handleDownloadTemplate}>
                  <Download className="h-4 w-4 mr-2" />
                  Descargar plantilla de ejemplo
                </Button>
              </div>

              {/* Preview of first 5 rows */}
              {rawData.length > 0 && (
                <div className="space-y-2">
                  <Label>Vista previa (primeras 5 filas)</Label>
                  <ScrollArea className="h-[150px] border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {headers.map((header, i) => (
                            <TableHead key={i} className="whitespace-nowrap">
                              Col {i + 1}: {header || "(vacía)"}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rawData.slice(1, 6).map((row, i) => (
                          <TableRow key={i}>
                            {row.map((cell, j) => (
                              <TableCell key={j} className="whitespace-nowrap">
                                {cell !== null && cell !== undefined ? String(cell) : ""}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Mapping */}
          {step === "mapping" && (
            <div className="space-y-6">
              <ColumnMappingForm
                headers={headers}
                mapping={mapping}
                onMappingChange={handleMappingChange}
              />

              {/* Save as template option */}
              <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="save-template"
                    checked={saveAsTemplate}
                    onCheckedChange={(checked) => setSaveAsTemplate(checked as boolean)}
                  />
                  <Label htmlFor="save-template">Guardar como plantilla para futuros extractos</Label>
                </div>
                
                {saveAsTemplate && (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Nombre de la plantilla (ej: Banco Industrial)"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                    />
                    <Button onClick={handleSaveTemplate} disabled={!templateName.trim()}>
                      <Save className="h-4 w-4 mr-1" />
                      Guardar
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Confirm */}
          {step === "confirm" && (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-4 gap-3">
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold">{summary.totalRows}</p>
                    <p className="text-sm text-muted-foreground">Total filas</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold text-green-600">{summary.validRows}</p>
                    <p className="text-sm text-muted-foreground">Válidas</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold text-destructive">{summary.errorRows}</p>
                    <p className="text-sm text-muted-foreground">Con errores</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold text-muted-foreground">{summary.emptyRows}</p>
                    <p className="text-sm text-muted-foreground">Vacías</p>
                  </CardContent>
                </Card>
              </div>

              {/* Selection info */}
              <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg">
                <span className="text-sm">
                  <strong>{selectedCount}</strong> de {summary.validRows} movimientos seleccionados para importar
                </span>
                <Badge variant={selectedCount > 0 ? "default" : "secondary"}>
                  {selectedCount > 0 ? "Listo para importar" : "Seleccione movimientos"}
                </Badge>
              </div>

              {/* Preview table */}
              <BankStatementPreviewTable
                rows={parsedRows}
                onToggleRow={handleToggleRow}
                onToggleAll={handleToggleAll}
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          <div>
            {step !== "upload" && (
              <Button
                variant="outline"
                onClick={() => setStep(step === "confirm" ? "mapping" : "upload")}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Anterior
              </Button>
            )}
          </div>
          
          <div className="flex gap-2">
            <Button variant="ghost" onClick={handleClose}>
              Cancelar
            </Button>
            
            {step === "upload" && (
              <Button
                onClick={handleNextToMapping}
                disabled={!file || !selectedAccountId || rawData.length === 0}
              >
                Siguiente
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            )}
            
            {step === "mapping" && (
              <Button onClick={handleNextToConfirm} disabled={!isMappingValid()}>
                Siguiente
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            )}
            
            {step === "confirm" && (
              <Button
                onClick={handleImport}
                disabled={selectedCount === 0 || isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                )}
                Importar {selectedCount} movimientos
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
