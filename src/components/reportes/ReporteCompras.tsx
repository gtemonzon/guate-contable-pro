import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRecords } from "@/utils/supabaseHelpers";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Download, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { exportToExcel, exportToPDF } from "@/utils/reportExport";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { formatCurrency } from "@/lib/utils";
import { FolioExportDialog, FolioExportOptions } from "./FolioExportDialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PurchaseData {
  invoice_date: string;
  invoice_series: string;
  invoice_number: string;
  fel_document_type: string;
  supplier_nit: string;
  supplier_name: string;
  base_amount: number;
  vat_amount: number;
  total_amount: number;
  operation_type_id?: number | null;
}

interface FELDocumentType {
  id: number;
  code: string;
  name: string;
  affects_total: number;
}

interface OperationType {
  id: number;
  code: string;
  name: string;
}

export default function ReporteCompras() {
  const [currentEnterpriseId, setCurrentEnterpriseId] = useState<string | null>(null);
  const [enterpriseName, setEnterpriseName] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [purchases, setPurchases] = useState<PurchaseData[]>([]);
  const [felDocTypes, setFelDocTypes] = useState<FELDocumentType[]>([]);
  const [operationTypes, setOperationTypes] = useState<OperationType[]>([]);
  const [loading, setLoading] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const { toast } = useToast();

  const monthNames = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];

  useEffect(() => {
    const enterpriseId = localStorage.getItem("currentEnterpriseId");
    setCurrentEnterpriseId(enterpriseId);
    
    if (enterpriseId) {
      fetchEnterpriseName(enterpriseId);
      fetchFelDocTypes();
      fetchOperationTypes();
    }
  }, []);

  const fetchEnterpriseName = async (enterpriseId: string) => {
    try {
      const { data, error } = await supabase
        .from("tab_enterprises")
        .select("business_name")
        .eq("id", parseInt(enterpriseId))
        .single();

      if (error) throw error;
      setEnterpriseName(data?.business_name || "");
    } catch (error: unknown) {
      console.error("Error fetching enterprise:", error);
    }
  };

  const fetchFelDocTypes = async () => {
    try {
      const { data, error } = await supabase
        .from("tab_fel_document_types")
        .select("id, code, name, affects_total")
        .eq("is_active", true);

      if (error) throw error;
      setFelDocTypes(data || []);
    } catch (error: unknown) {
      console.error("Error fetching FEL doc types:", error);
    }
  };

  const fetchOperationTypes = async () => {
    try {
      const { data, error } = await supabase
        .from("tab_operation_types")
        .select("id, code, name")
        .eq("is_active", true)
        .in("applies_to", ["purchases", "both"]);

      if (error) throw error;
      setOperationTypes(data || []);
    } catch (error: unknown) {
      console.error("Error fetching operation types:", error);
    }
  };

  // Calcular totales aplicando affects_total
  const calculatedTotals = useMemo(() => {
    const totalBase = purchases.reduce((sum, p) => {
      const docType = felDocTypes.find(dt => dt.code === p.fel_document_type);
      const multiplier = docType?.affects_total ?? 1;
      return sum + ((Number(p.base_amount) || 0) * multiplier);
    }, 0);

    const totalVAT = purchases.reduce((sum, p) => {
      const docType = felDocTypes.find(dt => dt.code === p.fel_document_type);
      const multiplier = docType?.affects_total ?? 1;
      return sum + ((Number(p.vat_amount) || 0) * multiplier);
    }, 0);

    const totalAmount = purchases.reduce((sum, p) => {
      const docType = felDocTypes.find(dt => dt.code === p.fel_document_type);
      const multiplier = docType?.affects_total ?? 1;
      return sum + ((Number(p.total_amount) || 0) * multiplier);
    }, 0);

    // Por tipo de documento
    const byDocType = purchases.reduce((acc, p) => {
      const docTypeCode = p.fel_document_type || 'SIN_TIPO';
      const docType = felDocTypes.find(dt => dt.code === p.fel_document_type);
      const multiplier = docType?.affects_total ?? 1;
      
      if (!acc[docTypeCode]) {
        acc[docTypeCode] = { total: 0, count: 0 };
      }
      acc[docTypeCode].total += (Number(p.base_amount) || 0) * multiplier;
      acc[docTypeCode].count += 1;
      return acc;
    }, {} as Record<string, { total: number; count: number }>);

    // Por tipo de operación
    const byOperation = purchases.reduce((acc, p) => {
      if (!p.operation_type_id) return acc;
      const opType = operationTypes.find(o => o.id === p.operation_type_id);
      if (!opType) return acc;
      
      const docType = felDocTypes.find(dt => dt.code === p.fel_document_type);
      const multiplier = docType?.affects_total ?? 1;
      const key = opType.name;
      
      if (!acc[key]) {
        acc[key] = { total: 0, count: 0 };
      }
      acc[key].total += (Number(p.base_amount) || 0) * multiplier;
      acc[key].count += 1;
      return acc;
    }, {} as Record<string, { total: number; count: number }>);

    return {
      totalBase,
      totalVAT,
      totalAmount,
      documentCount: purchases.length,
      byDocType,
      byOperation,
    };
  }, [purchases, felDocTypes, operationTypes]);

  const generateReport = async () => {
    if (!currentEnterpriseId) {
      toast({
        title: "Error",
        description: "Selecciona una empresa primero",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      const startDate = new Date(selectedYear, selectedMonth - 1, 1).toISOString().split('T')[0];
      const endDate = new Date(selectedYear, selectedMonth, 0).toISOString().split('T')[0];

      const data = await fetchAllRecords<any>(
        supabase
          .from("tab_purchase_ledger")
          .select("*")
          .eq("enterprise_id", parseInt(currentEnterpriseId))
          .gte("invoice_date", startDate)
          .lte("invoice_date", endDate)
          .order("invoice_date", { ascending: true })
          .order("invoice_number", { ascending: true })
      );
      setPurchases(data || []);
      
      if (!data || data.length === 0) {
        toast({
          title: "Sin datos",
          description: "No hay compras registradas para el período seleccionado",
        });
      }
    } catch (error: unknown) {
      toast({
        title: "Error al generar reporte",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatistics = () => {
    const statistics: { label: string; items: { name: string; value: string; count: number }[] }[] = [];

    // Por tipo de documento
    const docTypeItems = Object.entries(calculatedTotals.byDocType).map(([key, data]) => ({
      name: key,
      value: `Q ${formatCurrency(data.total)}`,
      count: data.count,
    }));
    if (docTypeItems.length > 0) {
      statistics.push({ label: 'Por Tipo de Documento', items: docTypeItems });
    }

    // Por tipo de operación
    const opTypeItems = Object.entries(calculatedTotals.byOperation).map(([key, data]) => ({
      name: key,
      value: `Q ${formatCurrency(data.total)}`,
      count: data.count,
    }));
    if (opTypeItems.length > 0) {
      statistics.push({ label: 'Por Tipo de Operación', items: opTypeItems });
    }

    return statistics;
  };

  const handleExport = (options: FolioExportOptions) => {
    const headers = ["Fecha", "Serie", "Número", "Tipo Doc", "NIT", "Proveedor", "Base", "IVA", "Total"];
    const data = purchases.map(p => {
      const docType = felDocTypes.find(dt => dt.code === p.fel_document_type);
      const multiplier = docType?.affects_total ?? 1;
      return [
        new Date(p.invoice_date + 'T00:00:00').toLocaleDateString('es-GT'),
        p.invoice_series || '',
        p.invoice_number,
        p.fel_document_type,
        p.supplier_nit,
        p.supplier_name,
        options.format === 'excel' 
          ? (p.base_amount * multiplier).toFixed(2) 
          : `Q ${(p.base_amount * multiplier).toFixed(2)}`,
        options.format === 'excel' 
          ? (p.vat_amount * multiplier).toFixed(2) 
          : `Q ${(p.vat_amount * multiplier).toFixed(2)}`,
        options.format === 'excel' 
          ? (p.total_amount * multiplier).toFixed(2) 
          : `Q ${(p.total_amount * multiplier).toFixed(2)}`,
      ];
    });

    const exportOptions = {
      filename: `Compras_${monthNames[selectedMonth - 1]}_${selectedYear}`,
      title: `Libro de Compras - ${monthNames[selectedMonth - 1]} ${selectedYear}`,
      enterpriseName,
      headers,
      data,
      totals: [
        { label: "Total Base", value: `Q ${formatCurrency(calculatedTotals.totalBase)}` },
        { label: "Total IVA", value: `Q ${formatCurrency(calculatedTotals.totalVAT)}` },
        { label: "Total con IVA", value: `Q ${formatCurrency(calculatedTotals.totalAmount)}` },
        { label: "Total documentos", value: `${calculatedTotals.documentCount}` },
      ],
      statistics: getStatistics(),
    };

    if (options.format === 'excel') {
      exportToExcel(exportOptions);
    } else {
      exportToPDF({
        ...exportOptions,
        folioOptions: {
          includeFolio: options.includeFolio,
          startingFolio: options.startingFolio,
        },
      });
    }

    toast({
      title: "Exportado",
      description: `El reporte se ha exportado a ${options.format.toUpperCase()} correctamente`,
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <Label htmlFor="month">Mes</Label>
          <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
            <SelectTrigger id="month">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthNames.map((name, index) => (
                <SelectItem key={index + 1} value={String(index + 1)}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="year">Año</Label>
          <Input
            id="year"
            type="number"
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            min="2020"
            max="2099"
          />
        </div>

        <div className="flex items-end">
          <Button onClick={generateReport} disabled={loading} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Generar Reporte
          </Button>
        </div>

        {purchases.length > 0 && (
          <div className="flex items-end">
            <Button variant="outline" onClick={() => setExportDialogOpen(true)} className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Exportar
            </Button>
          </div>
        )}
      </div>

      <FolioExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        onExport={handleExport}
        title="Exportar Libro de Compras"
      />

      {purchases.length > 0 && (
        <div className="space-y-4">
          <div className="rounded-lg border overflow-auto max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Serie</TableHead>
                  <TableHead>Número</TableHead>
                  <TableHead>Tipo Doc</TableHead>
                  <TableHead>NIT</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead className="text-right">Base</TableHead>
                  <TableHead className="text-right">IVA</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((purchase, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{new Date(purchase.invoice_date + 'T00:00:00').toLocaleDateString('es-GT')}</TableCell>
                    <TableCell>{purchase.invoice_series || '-'}</TableCell>
                    <TableCell>{purchase.invoice_number}</TableCell>
                    <TableCell>{purchase.fel_document_type}</TableCell>
                    <TableCell>{purchase.supplier_nit}</TableCell>
                    <TableCell>{purchase.supplier_name}</TableCell>
                    <TableCell className="text-right">Q {formatCurrency(purchase.base_amount)}</TableCell>
                    <TableCell className="text-right">Q {formatCurrency(purchase.vat_amount)}</TableCell>
                    <TableCell className="text-right">Q {formatCurrency(purchase.total_amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Estadísticas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.keys(calculatedTotals.byDocType).length > 0 && (
              <div className="p-4 bg-muted rounded-lg">
                <span className="text-sm font-medium text-muted-foreground">Por Documento:</span>
                <div className="mt-2 space-y-1">
                  {Object.entries(calculatedTotals.byDocType).map(([key, data]) => (
                    <div key={key} className="flex justify-between text-sm">
                      <span>{key}</span>
                      <span className="font-medium">Q {formatCurrency(data.total)} ({data.count})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {Object.keys(calculatedTotals.byOperation).length > 0 && (
              <div className="p-4 bg-muted rounded-lg">
                <span className="text-sm font-medium text-muted-foreground">Por Operación:</span>
                <div className="mt-2 space-y-1">
                  {Object.entries(calculatedTotals.byOperation).map(([key, data]) => (
                    <div key={key} className="flex justify-between text-sm">
                      <span>{key}</span>
                      <span className="font-medium">Q {formatCurrency(data.total)} ({data.count})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-8 p-4 bg-muted rounded-lg">
            <div>
              <span className="text-muted-foreground">Documentos: </span>
              <span className="font-semibold">{calculatedTotals.documentCount}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Total Base: </span>
              <span className="font-semibold">Q {formatCurrency(calculatedTotals.totalBase)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Total IVA: </span>
              <span className="font-semibold">Q {formatCurrency(calculatedTotals.totalVAT)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Total con IVA: </span>
              <span className="font-semibold">Q {formatCurrency(calculatedTotals.totalAmount)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}