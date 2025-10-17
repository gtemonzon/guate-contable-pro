import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
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
}

export default function ReporteVentas() {
  const [currentEnterpriseId, setCurrentEnterpriseId] = useState<string | null>(null);
  const [enterpriseName, setEnterpriseName] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [sales, setSales] = useState<SaleData[]>([]);
  const [loading, setLoading] = useState(false);
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

      const { data, error } = await supabase
        .from("tab_sales_ledger")
        .select("*")
        .eq("enterprise_id", parseInt(currentEnterpriseId))
        .gte("invoice_date", startDate)
        .lte("invoice_date", endDate)
        .order("invoice_date", { ascending: true })
        .order("invoice_number", { ascending: true });

      if (error) throw error;
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

  const handleExportExcel = () => {
    const headers = ["Fecha", "Serie", "Número", "Tipo Doc", "NIT", "Cliente", "Neto", "IVA", "Total"];
    const data = sales.map(s => [
      new Date(s.invoice_date + 'T00:00:00').toLocaleDateString('es-GT'),
      s.invoice_series || '',
      s.invoice_number,
      s.fel_document_type,
      s.customer_nit,
      s.customer_name,
      s.net_amount.toFixed(2),
      s.vat_amount.toFixed(2),
      s.total_amount.toFixed(2),
    ]);

    const totalNet = sales.reduce((sum, s) => sum + s.net_amount, 0);
    const totalVAT = sales.reduce((sum, s) => sum + s.vat_amount, 0);
    const totalAmount = sales.reduce((sum, s) => sum + s.total_amount, 0);

    exportToExcel({
      filename: `Ventas_${monthNames[selectedMonth - 1]}_${selectedYear}`,
      title: `Reporte de Ventas - ${monthNames[selectedMonth - 1]} ${selectedYear}`,
      enterpriseName,
      headers,
      data,
      totals: [
        { label: "Total Neto", value: `Q ${totalNet.toFixed(2)}` },
        { label: "Total IVA", value: `Q ${totalVAT.toFixed(2)}` },
        { label: "Total con IVA", value: `Q ${totalAmount.toFixed(2)}` },
      ],
    });

    toast({
      title: "Exportado",
      description: "El reporte se ha exportado a Excel correctamente",
    });
  };

  const handleExportPDF = () => {
    const headers = ["Fecha", "Serie", "Número", "Tipo", "NIT", "Cliente", "Neto", "IVA", "Total"];
    const data = sales.map(s => [
      new Date(s.invoice_date + 'T00:00:00').toLocaleDateString('es-GT'),
      s.invoice_series || '',
      s.invoice_number,
      s.fel_document_type,
      s.customer_nit,
      s.customer_name,
      `Q ${s.net_amount.toFixed(2)}`,
      `Q ${s.vat_amount.toFixed(2)}`,
      `Q ${s.total_amount.toFixed(2)}`,
    ]);

    const totalNet = sales.reduce((sum, s) => sum + s.net_amount, 0);
    const totalVAT = sales.reduce((sum, s) => sum + s.vat_amount, 0);
    const totalAmount = sales.reduce((sum, s) => sum + s.total_amount, 0);

    exportToPDF({
      filename: `Ventas_${monthNames[selectedMonth - 1]}_${selectedYear}`,
      title: `Reporte de Ventas - ${monthNames[selectedMonth - 1]} ${selectedYear}`,
      enterpriseName,
      headers,
      data,
      totals: [
        { label: "Total Neto", value: `Q ${totalNet.toFixed(2)}` },
        { label: "Total IVA", value: `Q ${totalVAT.toFixed(2)}` },
        { label: "Total con IVA", value: `Q ${totalAmount.toFixed(2)}` },
      ],
    });

    toast({
      title: "Exportado",
      description: "El reporte se ha exportado a PDF correctamente",
    });
  };

  const totalNet = sales.reduce((sum, s) => sum + s.net_amount, 0);
  const totalVAT = sales.reduce((sum, s) => sum + s.vat_amount, 0);
  const totalAmount = sales.reduce((sum, s) => sum + s.total_amount, 0);

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
                {sales.map((sale, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{new Date(sale.invoice_date + 'T00:00:00').toLocaleDateString('es-GT')}</TableCell>
                    <TableCell>{sale.invoice_series || '-'}</TableCell>
                    <TableCell>{sale.invoice_number}</TableCell>
                    <TableCell>{sale.fel_document_type}</TableCell>
                    <TableCell>{sale.customer_nit}</TableCell>
                    <TableCell>{sale.customer_name}</TableCell>
                    <TableCell className="text-right">Q {sale.net_amount.toFixed(2)}</TableCell>
                    <TableCell className="text-right">Q {sale.vat_amount.toFixed(2)}</TableCell>
                    <TableCell className="text-right">Q {sale.total_amount.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end gap-8 p-4 bg-muted rounded-lg">
            <div>
              <span className="text-muted-foreground">Total Neto: </span>
              <span className="font-semibold">Q {totalNet.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Total IVA: </span>
              <span className="font-semibold">Q {totalVAT.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Total con IVA: </span>
              <span className="font-semibold">Q {totalAmount.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
