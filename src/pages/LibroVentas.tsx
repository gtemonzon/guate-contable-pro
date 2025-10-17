import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileText, Upload } from "lucide-react";
import { SalesCard } from "@/components/ventas/SalesCard";
import { useToast } from "@/hooks/use-toast";
import { ImportSalesDialog } from "@/components/ventas/ImportSalesDialog";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { formatCurrency } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface FELDocumentType {
  id: number;
  code: string;
  name: string;
}

interface SaleEntry {
  id?: number;
  invoice_series: string;
  invoice_number: string;
  invoice_date: string;
  fel_document_type: string;
  customer_nit: string;
  customer_name: string;
  total_amount: number;
  vat_amount: number;
  net_amount: number;
  journal_entry_id: number | null;
  isNew?: boolean;
}

export default function LibroVentas() {
  const [sales, setSales] = useState<SaleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentEnterpriseId, setCurrentEnterpriseId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [felDocTypes, setFelDocTypes] = useState<FELDocumentType[]>([]);
  const [showJournalDialog, setShowJournalDialog] = useState(false);
  const [journalType, setJournalType] = useState<"mes" | "cheque">("mes");
  const [showImportDialog, setShowImportDialog] = useState(false);

  const { toast } = useToast();

  const totals = useMemo(() => {
    const totalWithVAT = sales.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);
    const totalVAT = sales.reduce((sum, s) => sum + (Number(s.vat_amount) || 0), 0);
    const totalNet = sales.reduce((sum, s) => sum + (Number(s.net_amount) || 0), 0);
    const documentCount = sales.length;

    return {
      totalWithVAT: formatCurrency(totalWithVAT),
      totalVAT: formatCurrency(totalVAT),
      totalNet: formatCurrency(totalNet),
      documentCount,
    };
  }, [sales]);

  const monthNames = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];

  useEffect(() => {
    const enterpriseId = localStorage.getItem("currentEnterpriseId");
    setCurrentEnterpriseId(enterpriseId);
    
    if (enterpriseId) {
      fetchFELDocTypes();
      fetchSales(enterpriseId, selectedMonth, selectedYear);
    } else {
      setLoading(false);
      toast({
        title: "Selecciona una empresa",
        description: "Debes seleccionar una empresa primero",
        variant: "destructive",
      });
    }

    const handleStorageChange = () => {
      const newEnterpriseId = localStorage.getItem("currentEnterpriseId");
      setCurrentEnterpriseId(newEnterpriseId);
      if (newEnterpriseId) {
        fetchFELDocTypes();
        fetchSales(newEnterpriseId, selectedMonth, selectedYear);
      } else {
        setSales([]);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("enterpriseChanged", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("enterpriseChanged", handleStorageChange);
    };
  }, []);

  useEffect(() => {
    if (currentEnterpriseId) {
      fetchSales(currentEnterpriseId, selectedMonth, selectedYear);
    }
  }, [selectedMonth, selectedYear]);

  const fetchFELDocTypes = async () => {
    try {
      const { data, error } = await supabase
        .from("tab_fel_document_types")
        .select("*")
        .eq("is_active", true)
        .order("code");

      if (error) throw error;
      setFelDocTypes(data || []);
    } catch (error: any) {
      console.error("Error loading FEL doc types:", error);
    }
  };

  const fetchSales = async (enterpriseId: string, month: number, year: number) => {
    try {
      setLoading(true);
      
      const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];

      const { data, error } = await supabase
        .from("tab_sales_ledger")
        .select("*")
        .eq("enterprise_id", parseInt(enterpriseId))
        .gte("invoice_date", startDate)
        .lte("invoice_date", endDate)
        .order("invoice_date", { ascending: true })
        .order("invoice_number", { ascending: true });

      if (error) throw error;
      setSales(data || []);
    } catch (error: any) {
      toast({
        title: "Error al cargar facturas",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const addNewRow = () => {
    // Copiar fecha de la última entrada o usar el último día del mes seleccionado
    let defaultDate = new Date().toISOString().split('T')[0];
    if (sales.length > 0) {
      defaultDate = sales[sales.length - 1].invoice_date;
    } else {
      // Último día del mes seleccionado
      const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
      defaultDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }

    const newEntry: SaleEntry = {
      invoice_series: "",
      invoice_number: "",
      invoice_date: defaultDate,
      fel_document_type: felDocTypes[0]?.code || "",
      customer_nit: "",
      customer_name: "",
      total_amount: 0,
      vat_amount: 0,
      net_amount: 0,
      journal_entry_id: null,
      isNew: true,
    };
    setSales([...sales, newEntry]);
  };

  const updateRow = (index: number, field: keyof SaleEntry, value: any) => {
    const updated = [...sales];
    
    // Validar fecha si se está cambiando
    if (field === "invoice_date") {
      const enteredDate = new Date(value);
      const lastDayOfMonth = new Date(selectedYear, selectedMonth, 0);
      
      if (enteredDate > lastDayOfMonth) {
        toast({
          title: "Fecha inválida",
          description: `No puede ingresar una fecha posterior a ${monthNames[selectedMonth - 1]} ${selectedYear}`,
          variant: "destructive",
        });
        return;
      }
    }
    
    updated[index] = { ...updated[index], [field]: value };

    // Auto-calcular IVA cuando cambia total_amount
    if (field === "total_amount") {
      const total = parseFloat(value) || 0;
      const net = total / 1.12;
      const vat = total - net;
      updated[index].net_amount = parseFloat(net.toFixed(2));
      updated[index].vat_amount = parseFloat(vat.toFixed(2));
    }

    setSales(updated);
  };

  const saveRow = async (index: number) => {
    const entry = sales[index];
    if (!currentEnterpriseId) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuario no autenticado");

      const entryData = {
        enterprise_id: parseInt(currentEnterpriseId),
        invoice_series: entry.invoice_series || null,
        invoice_number: entry.invoice_number,
        invoice_date: entry.invoice_date,
        fel_document_type: entry.fel_document_type,
        authorization_number: `AUTH-${entry.invoice_number}`,
        customer_nit: entry.customer_nit,
        customer_name: entry.customer_name,
        total_amount: entry.total_amount,
        vat_amount: entry.vat_amount,
        net_amount: entry.net_amount,
      };

      if (entry.isNew) {
        const { data, error } = await supabase
          .from("tab_sales_ledger")
          .insert(entryData)
          .select()
          .single();

        if (error) throw error;

        const updated = [...sales];
        updated[index] = { ...data, isNew: false };
        setSales(updated);

        toast({
          title: "Factura guardada",
          description: "La factura se guardó correctamente",
        });
      } else if (entry.id) {
        const { error } = await supabase
          .from("tab_sales_ledger")
          .update(entryData)
          .eq("id", entry.id);

        if (error) throw error;

        toast({
          title: "Factura actualizada",
          description: "Los cambios se guardaron correctamente",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error al guardar",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const deleteRow = async (index: number) => {
    const entry = sales[index];
    
    if (entry.isNew) {
      setSales(sales.filter((_, i) => i !== index));
      return;
    }

    if (!entry.id) return;

    try {
      const { error } = await supabase
        .from("tab_sales_ledger")
        .delete()
        .eq("id", entry.id);

      if (error) throw error;

      setSales(sales.filter((_, i) => i !== index));
      toast({
        title: "Factura eliminada",
        description: "La factura se eliminó correctamente",
      });
    } catch (error: any) {
      toast({
        title: "Error al eliminar",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const generateJournalEntry = async () => {
    try {
      if (!currentEnterpriseId) {
        toast({
          title: "Error",
          description: "No se puede generar la póliza",
          variant: "destructive",
        });
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuario no autenticado");

      // Obtener período contable activo
      const { data: period, error: periodError } = await supabase
        .from("tab_accounting_periods")
        .select("id")
        .eq("enterprise_id", parseInt(currentEnterpriseId))
        .eq("status", "abierto")
        .eq("year", selectedYear)
        .maybeSingle();

      if (periodError) throw periodError;
      if (!period) {
        toast({
          title: "Error",
          description: "No hay período contable abierto para este año",
          variant: "destructive",
        });
        return;
      }

      // Crear póliza
      const entryNumber = `VENT-${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
      const { data: journalEntry, error: journalError } = await supabase
        .from("tab_journal_entries")
        .insert({
          enterprise_id: parseInt(currentEnterpriseId),
          accounting_period_id: period.id,
          entry_number: entryNumber,
          entry_date: new Date().toISOString().split('T')[0],
          entry_type: "diario",
          description: `Libro de Ventas ${monthNames[selectedMonth - 1]} ${selectedYear}`,
          total_debit: parseFloat(totals.totalWithVAT),
          total_credit: parseFloat(totals.totalWithVAT),
          created_by: user.id,
        })
        .select()
        .single();

      if (journalError) throw journalError;

      // Marcar facturas con el journal_entry_id
      const saleIds = sales.filter(s => s.id).map(s => s.id);
      if (saleIds.length > 0) {
        const { error: updateError } = await supabase
          .from("tab_sales_ledger")
          .update({ journal_entry_id: journalEntry.id })
          .in("id", saleIds);

        if (updateError) throw updateError;
      }

      toast({
        title: "Póliza generada",
        description: `Póliza ${entryNumber} creada exitosamente`,
      });
      setShowJournalDialog(false);
      
      // Recargar facturas
      if (currentEnterpriseId) {
        await fetchSales(currentEnterpriseId, selectedMonth, selectedYear);
      }
    } catch (error: any) {
      toast({
        title: "Error al generar póliza",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  if (!currentEnterpriseId) {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Selecciona una empresa para ver el libro de ventas
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">Libro de Ventas</h1>
          <p className="text-muted-foreground">Registro mensual de facturas de venta</p>
          
          <div className="mt-4 flex gap-6 text-sm">
            <div>
              <span className="text-muted-foreground">Documentos: </span>
              <Badge variant="secondary">{totals.documentCount}</Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Neto: </span>
              <span className="font-semibold">Q {totals.totalNet}</span>
            </div>
            <div>
              <span className="text-muted-foreground">IVA: </span>
              <span className="font-semibold">Q {totals.totalVAT}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Total c/IVA: </span>
              <span className="font-semibold">Q {totals.totalWithVAT}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-4 items-end">
          <div>
            <Label htmlFor="month-select">Mes</Label>
            <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
              <SelectTrigger id="month-select" className="w-[150px]">
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
            <Label htmlFor="year-select">Año</Label>
            <Input
              id="year-select"
              type="number"
              className="w-[100px]"
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              min="2020"
              max="2099"
            />
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Facturas de {monthNames[selectedMonth - 1]} {selectedYear}</CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowImportDialog(true)}
              >
                <Upload className="h-4 w-4 mr-2" />
                Importar
              </Button>
              <Dialog open={showJournalDialog} onOpenChange={setShowJournalDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <FileText className="h-4 w-4 mr-2" />
                    Generar Póliza
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Generar Póliza Contable</DialogTitle>
                    <DialogDescription>
                      Selecciona el tipo de póliza a generar
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Tipo de Póliza</Label>
                      <Select value={journalType} onValueChange={(v) => setJournalType(v as "mes" | "cheque")}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mes">Póliza del Mes</SelectItem>
                          <SelectItem value="cheque">Póliza por Cheque</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="bg-muted p-4 rounded-lg space-y-1 text-sm">
                      <p><strong>Documentos:</strong> {totals.documentCount}</p>
                      <p><strong>Neto:</strong> Q {totals.totalNet}</p>
                      <p><strong>IVA:</strong> Q {totals.totalVAT}</p>
                      <p><strong>Total:</strong> Q {totals.totalWithVAT}</p>
                    </div>
                    <Button 
                      className="w-full" 
                      onClick={generateJournalEntry}
                    >
                      Generar
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              <Button onClick={addNewRow} size="sm">
                Agregar Línea
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Cargando...</p>
          ) : sales.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No hay facturas. Haz clic en "Agregar Línea" para comenzar.
            </p>
          ) : (
            <div className="space-y-3">
              {sales.map((sale, index) => (
                <SalesCard
                  key={sale.id || `new-${index}`}
                  sale={sale}
                  index={index}
                  felDocTypes={felDocTypes}
                  onUpdate={updateRow}
                  onSave={saveRow}
                  onDelete={deleteRow}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ImportSalesDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        enterpriseId={currentEnterpriseId ? parseInt(currentEnterpriseId) : null}
        onSuccess={() => {
          if (currentEnterpriseId) {
            fetchSales(currentEnterpriseId, selectedMonth, selectedYear);
          }
        }}
      />
    </div>
  );
}
