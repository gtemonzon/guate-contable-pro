import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRecords } from "@/utils/supabaseHelpers";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { exportToExcel, exportToPDF } from "@/utils/reportExport";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { formatCurrency } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface SaleData {
  invoice_date: string;
  invoice_series: string;
  invoice_number: string;
  fel_document_type: string;
  customer_nit: string;
  customer_name: string;
  net_amount: number;
  vat_amount: number;
  total_amount: number;
  is_annulled?: boolean;
  operation_type_id?: number | null;
  establishment_code?: string | null;
  establishment_name?: string | null;
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

export default function ReporteVentas() {
  const [currentEnterpriseId, setCurrentEnterpriseId] = useState<string | null>(null);
  const [enterpriseName, setEnterpriseName] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [sales, setSales] = useState<SaleData[]>([]);
  const [felDocTypes, setFelDocTypes] = useState<FELDocumentType[]>([]);
  const [operationTypes, setOperationTypes] = useState<OperationType[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedEstablishment, setSelectedEstablishment] = useState<string>("all");
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
    } catch (error: any) {
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
    } catch (error: any) {
      console.error("Error fetching FEL doc types:", error);
    }
  };

  const fetchOperationTypes = async () => {
    try {
      const { data, error } = await supabase
        .from("tab_operation_types")
        .select("id, code, name")
        .eq("is_active", true)
        .in("applies_to", ["sales", "both"]);

      if (error) throw error;
      setOperationTypes(data || []);
    } catch (error: any) {
      console.error("Error fetching operation types:", error);
    }
  };

  // Get unique establishments from sales data
  const establishments = useMemo(() => {
    const uniqueEstablishments = new Map<string, string>();
    sales.forEach(s => {
      if (s.establishment_code && s.establishment_name) {
        uniqueEstablishments.set(s.establishment_code, s.establishment_name);
      }
    });
    return Array.from(uniqueEstablishments.entries()).map(([code, name]) => ({
      code,
      name,
    })).sort((a, b) => a.code.localeCompare(b.code));
  }, [sales]);

  // Filter sales by selected establishment
  const filteredSales = useMemo(() => {
    if (selectedEstablishment === "all") return sales;
    return sales.filter(s => s.establishment_code === selectedEstablishment);
  }, [sales, selectedEstablishment]);

  // Calcular totales aplicando affects_total
  const calculatedTotals = useMemo(() => {
    const activeSales = filteredSales.filter(s => !s.is_annulled);
    
    const totalNet = activeSales.reduce((sum, s) => {
      const docType = felDocTypes.find(dt => dt.code === s.fel_document_type);
      const multiplier = docType?.affects_total ?? 1;
      return sum + ((Number(s.net_amount) || 0) * multiplier);
    }, 0);

    const totalVAT = activeSales.reduce((sum, s) => {
      const docType = felDocTypes.find(dt => dt.code === s.fel_document_type);
      const multiplier = docType?.affects_total ?? 1;
      return sum + ((Number(s.vat_amount) || 0) * multiplier);
    }, 0);

    const totalAmount = activeSales.reduce((sum, s) => {
      const docType = felDocTypes.find(dt => dt.code === s.fel_document_type);
      const multiplier = docType?.affects_total ?? 1;
      return sum + ((Number(s.total_amount) || 0) * multiplier);
    }, 0);

    // Por tipo de documento
    const byDocType = activeSales.reduce((acc, s) => {
      const docTypeCode = s.fel_document_type || 'SIN_TIPO';
      const docType = felDocTypes.find(dt => dt.code === s.fel_document_type);
      const multiplier = docType?.affects_total ?? 1;
      
      if (!acc[docTypeCode]) {
        acc[docTypeCode] = { total: 0, count: 0 };
      }
      acc[docTypeCode].total += (Number(s.net_amount) || 0) * multiplier;
      acc[docTypeCode].count += 1;
      return acc;
    }, {} as Record<string, { total: number; count: number }>);

    // Por tipo de operación
    const byOperation = activeSales.reduce((acc, s) => {
      if (!s.operation_type_id) return acc;
      const opType = operationTypes.find(o => o.id === s.operation_type_id);
      if (!opType) return acc;
      
      const docType = felDocTypes.find(dt => dt.code === s.fel_document_type);
      const multiplier = docType?.affects_total ?? 1;
      const key = opType.name;
      
      if (!acc[key]) {
        acc[key] = { total: 0, count: 0 };
      }
      acc[key].total += (Number(s.net_amount) || 0) * multiplier;
      acc[key].count += 1;
      return acc;
    }, {} as Record<string, { total: number; count: number }>);

    return {
      totalNet,
      totalVAT,
      totalAmount,
      activeCount: activeSales.length,
      annulledCount: filteredSales.filter(s => s.is_annulled).length,
      byDocType,
      byOperation,
    };
  }, [filteredSales, felDocTypes, operationTypes]);

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
          .from("tab_sales_ledger")
          .select("*")
          .eq("enterprise_id", parseInt(currentEnterpriseId))
          .gte("invoice_date", startDate)
          .lte("invoice_date", endDate)
          .order("invoice_date", { ascending: true })
          .order("invoice_number", { ascending: true })
      );
      setSales(data || []);
      
      if (!data || data.length === 0) {
        toast({
          title: "Sin datos",
          description: "No hay ventas registradas para el período seleccionado",
        });
      }
    } catch (error: any) {
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

  const handleExportExcel = () => {
    const activeSales = sales.filter(s => !s.is_annulled);
    const headers = ["Fecha", "Serie", "Número", "Tipo Doc", "NIT", "Cliente", "Neto", "IVA", "Total"];
    const data = activeSales.map(s => {
      const docType = felDocTypes.find(dt => dt.code === s.fel_document_type);
      const multiplier = docType?.affects_total ?? 1;
      return [
        new Date(s.invoice_date + 'T00:00:00').toLocaleDateString('es-GT'),
        s.invoice_series || '',
        s.invoice_number,
        s.fel_document_type,
        s.customer_nit,
        s.customer_name,
        (s.net_amount * multiplier).toFixed(2),
        (s.vat_amount * multiplier).toFixed(2),
        (s.total_amount * multiplier).toFixed(2),
      ];
    });

    exportToExcel({
      filename: `Ventas_${monthNames[selectedMonth - 1]}_${selectedYear}`,
      title: `Reporte de Ventas - ${monthNames[selectedMonth - 1]} ${selectedYear}`,
      enterpriseName,
      headers,
      data,
      totals: [
        { label: "Total Neto", value: `Q ${formatCurrency(calculatedTotals.totalNet)}` },
        { label: "Total IVA", value: `Q ${formatCurrency(calculatedTotals.totalVAT)}` },
        { label: "Total con IVA", value: `Q ${formatCurrency(calculatedTotals.totalAmount)}` },
        { label: "Documentos activos", value: `${calculatedTotals.activeCount}` },
        { label: "Documentos anulados", value: `${calculatedTotals.annulledCount}` },
      ],
      statistics: getStatistics(),
    });

    toast({
      title: "Exportado",
      description: "El reporte se ha exportado a Excel correctamente",
    });
  };

  const handleExportPDF = () => {
    const activeSales = sales.filter(s => !s.is_annulled);
    const headers = ["Fecha", "Serie", "Número", "Tipo", "NIT", "Cliente", "Neto", "IVA", "Total"];
    const data = activeSales.map(s => {
      const docType = felDocTypes.find(dt => dt.code === s.fel_document_type);
      const multiplier = docType?.affects_total ?? 1;
      return [
        new Date(s.invoice_date + 'T00:00:00').toLocaleDateString('es-GT'),
        s.invoice_series || '',
        s.invoice_number,
        s.fel_document_type,
        s.customer_nit,
        s.customer_name,
        `Q ${(s.net_amount * multiplier).toFixed(2)}`,
        `Q ${(s.vat_amount * multiplier).toFixed(2)}`,
        `Q ${(s.total_amount * multiplier).toFixed(2)}`,
      ];
    });

    exportToPDF({
      filename: `Ventas_${monthNames[selectedMonth - 1]}_${selectedYear}`,
      title: `Reporte de Ventas - ${monthNames[selectedMonth - 1]} ${selectedYear}`,
      enterpriseName,
      headers,
      data,
      totals: [
        { label: "Total Neto", value: `Q ${formatCurrency(calculatedTotals.totalNet)}` },
        { label: "Total IVA", value: `Q ${formatCurrency(calculatedTotals.totalVAT)}` },
        { label: "Total con IVA", value: `Q ${formatCurrency(calculatedTotals.totalAmount)}` },
        { label: "Documentos activos", value: `${calculatedTotals.activeCount}` },
        { label: "Documentos anulados", value: `${calculatedTotals.annulledCount}` },
      ],
      statistics: getStatistics(),
    });

    toast({
      title: "Exportado",
      description: "El reporte se ha exportado a PDF correctamente",
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

        {establishments.length > 0 && (
          <div>
            <Label>Establecimiento</Label>
            <Select value={selectedEstablishment} onValueChange={setSelectedEstablishment}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {establishments.map((est) => (
                  <SelectItem key={est.code} value={est.code}>
                    {est.code} - {est.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex items-end">
          <Button onClick={generateReport} disabled={loading} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Generar Reporte
          </Button>
        </div>

        {sales.length > 0 && (
          <div className="flex items-end gap-2">
            <Button variant="outline" onClick={handleExportExcel} className="flex-1">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Excel
            </Button>
            <Button variant="outline" onClick={handleExportPDF} className="flex-1">
              <FileText className="h-4 w-4 mr-2" />
              PDF
            </Button>
          </div>
        )}
      </div>

      {sales.length > 0 && (
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
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Neto</TableHead>
                  <TableHead className="text-right">IVA</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSales.filter(s => !s.is_annulled).map((sale, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{new Date(sale.invoice_date + 'T00:00:00').toLocaleDateString('es-GT')}</TableCell>
                    <TableCell>{sale.invoice_series || '-'}</TableCell>
                    <TableCell>{sale.invoice_number}</TableCell>
                    <TableCell>{sale.fel_document_type}</TableCell>
                    <TableCell>{sale.customer_nit}</TableCell>
                    <TableCell>{sale.customer_name}</TableCell>
                    <TableCell className="text-right">Q {formatCurrency(sale.net_amount)}</TableCell>
                    <TableCell className="text-right">Q {formatCurrency(sale.vat_amount)}</TableCell>
                    <TableCell className="text-right">Q {formatCurrency(sale.total_amount)}</TableCell>
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
              <span className="text-muted-foreground">Docs: </span>
              <span className="font-semibold">{calculatedTotals.activeCount} activos</span>
              {calculatedTotals.annulledCount > 0 && (
                <span className="text-muted-foreground"> / {calculatedTotals.annulledCount} anulados</span>
              )}
            </div>
            <div>
              <span className="text-muted-foreground">Total Neto: </span>
              <span className="font-semibold">Q {formatCurrency(calculatedTotals.totalNet)}</span>
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