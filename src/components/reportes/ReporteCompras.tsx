import { useState, useEffect } from "react";
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
}

export default function ReporteCompras() {
  const [currentEnterpriseId, setCurrentEnterpriseId] = useState<string | null>(null);
  const [enterpriseName, setEnterpriseName] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [purchases, setPurchases] = useState<PurchaseData[]>([]);
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
    const headers = ["Fecha", "Serie", "Número", "Tipo Doc", "NIT", "Proveedor", "Base", "IVA", "Total"];
    const data = purchases.map(p => [
      new Date(p.invoice_date + 'T00:00:00').toLocaleDateString('es-GT'),
      p.invoice_series || '',
      p.invoice_number,
      p.fel_document_type,
      p.supplier_nit,
      p.supplier_name,
      p.base_amount.toFixed(2),
      p.vat_amount.toFixed(2),
      p.total_amount.toFixed(2),
    ]);

    const totalBase = purchases.reduce((sum, p) => sum + p.base_amount, 0);
    const totalVAT = purchases.reduce((sum, p) => sum + p.vat_amount, 0);
    const totalAmount = purchases.reduce((sum, p) => sum + p.total_amount, 0);

    exportToExcel({
      filename: `Compras_${monthNames[selectedMonth - 1]}_${selectedYear}`,
      title: `Reporte de Compras - ${monthNames[selectedMonth - 1]} ${selectedYear}`,
      enterpriseName,
      headers,
      data,
      totals: [
        { label: "Total Base", value: `Q ${totalBase.toFixed(2)}` },
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
    const headers = ["Fecha", "Serie", "Número", "Tipo", "NIT", "Proveedor", "Base", "IVA", "Total"];
    const data = purchases.map(p => [
      new Date(p.invoice_date + 'T00:00:00').toLocaleDateString('es-GT'),
      p.invoice_series || '',
      p.invoice_number,
      p.fel_document_type,
      p.supplier_nit,
      p.supplier_name,
      `Q ${p.base_amount.toFixed(2)}`,
      `Q ${p.vat_amount.toFixed(2)}`,
      `Q ${p.total_amount.toFixed(2)}`,
    ]);

    const totalBase = purchases.reduce((sum, p) => sum + p.base_amount, 0);
    const totalVAT = purchases.reduce((sum, p) => sum + p.vat_amount, 0);
    const totalAmount = purchases.reduce((sum, p) => sum + p.total_amount, 0);

    exportToPDF({
      filename: `Compras_${monthNames[selectedMonth - 1]}_${selectedYear}`,
      title: `Reporte de Compras - ${monthNames[selectedMonth - 1]} ${selectedYear}`,
      enterpriseName,
      headers,
      data,
      totals: [
        { label: "Total Base", value: `Q ${totalBase.toFixed(2)}` },
        { label: "Total IVA", value: `Q ${totalVAT.toFixed(2)}` },
        { label: "Total con IVA", value: `Q ${totalAmount.toFixed(2)}` },
      ],
    });

    toast({
      title: "Exportado",
      description: "El reporte se ha exportado a PDF correctamente",
    });
  };

  const totalBase = purchases.reduce((sum, p) => sum + p.base_amount, 0);
  const totalVAT = purchases.reduce((sum, p) => sum + p.vat_amount, 0);
  const totalAmount = purchases.reduce((sum, p) => sum + p.total_amount, 0);

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
                    <TableCell className="text-right">Q {purchase.base_amount.toFixed(2)}</TableCell>
                    <TableCell className="text-right">Q {purchase.vat_amount.toFixed(2)}</TableCell>
                    <TableCell className="text-right">Q {purchase.total_amount.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end gap-8 p-4 bg-muted rounded-lg">
            <div>
              <span className="text-muted-foreground">Total Base: </span>
              <span className="font-semibold">Q {totalBase.toFixed(2)}</span>
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
