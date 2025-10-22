import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileText, Upload, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PurchaseCard } from "@/components/compras/PurchaseCard";
import { SalesCard } from "@/components/ventas/SalesCard";
import { ImportPurchasesDialog } from "@/components/compras/ImportPurchasesDialog";
import { ImportSalesDialog } from "@/components/ventas/ImportSalesDialog";
import { useToast } from "@/hooks/use-toast";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { formatCurrency } from "@/lib/utils";

interface FELDocumentType {
  id: number;
  code: string;
  name: string;
  applies_vat: boolean;
}

interface PurchaseEntry {
  id?: number;
  invoice_series: string;
  invoice_number: string;
  invoice_date: string;
  fel_document_type: string;
  supplier_nit: string;
  supplier_name: string;
  total_amount: number;
  base_amount: number;
  vat_amount: number;
  batch_reference: string;
  journal_entry_id: number | null;
  purchase_book_id?: number;
  isNew?: boolean;
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

export default function LibrosFiscales() {
  const [purchases, setPurchases] = useState<PurchaseEntry[]>([]);
  const [sales, setSales] = useState<SaleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentEnterpriseId, setCurrentEnterpriseId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [felDocTypes, setFelDocTypes] = useState<FELDocumentType[]>([]);
  const [currentBookId, setCurrentBookId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"compras" | "ventas">("compras");
  const [showImportDialog, setShowImportDialog] = useState(false);
  const { toast } = useToast();

  const monthNames = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];

  const purchaseTotals = useMemo(() => {
    const totalWithVAT = purchases.reduce((sum, p) => sum + (Number(p.total_amount) || 0), 0);
    const totalVAT = purchases.reduce((sum, p) => sum + (Number(p.vat_amount) || 0), 0);
    const totalBase = purchases.reduce((sum, p) => sum + (Number(p.base_amount) || 0), 0);
    return {
      totalWithVAT: formatCurrency(totalWithVAT),
      totalVAT: formatCurrency(totalVAT),
      totalBase: formatCurrency(totalBase),
      documentCount: purchases.length,
    };
  }, [purchases]);

  const salesTotals = useMemo(() => {
    const totalWithVAT = sales.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);
    const totalVAT = sales.reduce((sum, s) => sum + (Number(s.vat_amount) || 0), 0);
    const totalNet = sales.reduce((sum, s) => sum + (Number(s.net_amount) || 0), 0);
    return {
      totalWithVAT: formatCurrency(totalWithVAT),
      totalVAT: formatCurrency(totalVAT),
      totalNet: formatCurrency(totalNet),
      documentCount: sales.length,
    };
  }, [sales]);

  useEffect(() => {
    const enterpriseId = localStorage.getItem("currentEnterpriseId");
    setCurrentEnterpriseId(enterpriseId);
    
    if (enterpriseId) {
      fetchFELDocTypes();
      fetchOrCreateBook(enterpriseId, selectedMonth, selectedYear);
      fetchSales(enterpriseId, selectedMonth, selectedYear);
    } else {
      setLoading(false);
    }

    const handleStorageChange = () => {
      const newEnterpriseId = localStorage.getItem("currentEnterpriseId");
      setCurrentEnterpriseId(newEnterpriseId);
      if (newEnterpriseId) {
        fetchFELDocTypes();
        fetchOrCreateBook(newEnterpriseId, selectedMonth, selectedYear);
        fetchSales(newEnterpriseId, selectedMonth, selectedYear);
      } else {
        setPurchases([]);
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
      fetchOrCreateBook(currentEnterpriseId, selectedMonth, selectedYear);
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

  const fetchOrCreateBook = async (enterpriseId: string, month: number, year: number) => {
    try {
      setLoading(true);
      
      let { data: book, error: fetchError } = await supabase
        .from("tab_purchase_books")
        .select("*")
        .eq("enterprise_id", parseInt(enterpriseId))
        .eq("month", month)
        .eq("year", year)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (!book) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Usuario no autenticado");

        const { data: newBook, error: createError } = await supabase
          .from("tab_purchase_books")
          .insert({
            enterprise_id: parseInt(enterpriseId),
            month,
            year,
            created_by: user.id,
          })
          .select()
          .single();

        if (createError) throw createError;
        book = newBook;
      }

      setCurrentBookId(book.id);
      await fetchPurchases(book.id);
    } catch (error: any) {
      toast({
        title: "Error al cargar libro",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchPurchases = async (bookId: number) => {
    try {
      const { data, error } = await supabase
        .from("tab_purchase_ledger")
        .select("*")
        .eq("purchase_book_id", bookId)
        .order("invoice_date", { ascending: false })
        .order("invoice_number", { ascending: false });

      if (error) throw error;
      setPurchases(data || []);
    } catch (error: any) {
      toast({
        title: "Error al cargar facturas de compra",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const fetchSales = async (enterpriseId: string, month: number, year: number) => {
    try {
      const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];

      const { data, error } = await supabase
        .from("tab_sales_ledger")
        .select("*")
        .eq("enterprise_id", parseInt(enterpriseId))
        .gte("invoice_date", startDate)
        .lte("invoice_date", endDate)
        .order("invoice_date", { ascending: false })
        .order("invoice_number", { ascending: false });

      if (error) throw error;
      setSales(data || []);
    } catch (error: any) {
      toast({
        title: "Error al cargar facturas de venta",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const calculateVAT = (total: number, docTypeCode: string) => {
    const docType = felDocTypes.find(dt => dt.code === docTypeCode);
    if (!docType || !docType.applies_vat) {
      return { base: total, vat: 0 };
    }
    const base = total / 1.12;
    const vat = total - base;
    return { base: parseFloat(base.toFixed(2)), vat: parseFloat(vat.toFixed(2)) };
  };

  const checkDuplicatePurchase = async (
    entry: PurchaseEntry, 
    currentEntryId?: number
  ): Promise<{ isDuplicate: boolean; month?: string; year?: number }> => {
    try {
      const { data, error } = await supabase
        .from("tab_purchase_ledger")
        .select("id, invoice_date")
        .eq("purchase_book_id", currentBookId)
        .eq("supplier_nit", entry.supplier_nit)
        .eq("fel_document_type", entry.fel_document_type)
        .eq("invoice_series", entry.invoice_series || "")
        .eq("invoice_number", entry.invoice_number);

      if (error) throw error;

      const duplicates = data?.filter(d => d.id !== currentEntryId);
      
      if (duplicates && duplicates.length > 0) {
        const date = new Date(duplicates[0].invoice_date);
        return { 
          isDuplicate: true, 
          month: monthNames[date.getMonth()],
          year: date.getFullYear()
        };
      }
      
      return { isDuplicate: false };
    } catch (error) {
      console.error("Error al verificar duplicados:", error);
      return { isDuplicate: false };
    }
  };

  const checkDuplicateSale = async (
    entry: SaleEntry, 
    currentEntryId?: number
  ): Promise<{ isDuplicate: boolean; month?: string; year?: number }> => {
    try {
      const entryDate = new Date(entry.invoice_date);
      const month = entryDate.getMonth() + 1;
      const year = entryDate.getFullYear();
      
      const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];

      const { data, error } = await supabase
        .from("tab_sales_ledger")
        .select("id, invoice_date")
        .eq("enterprise_id", parseInt(currentEnterpriseId))
        .eq("fel_document_type", entry.fel_document_type)
        .eq("invoice_series", entry.invoice_series || "")
        .eq("invoice_number", entry.invoice_number)
        .gte("invoice_date", startDate)
        .lte("invoice_date", endDate);

      if (error) throw error;

      const duplicates = data?.filter(d => d.id !== currentEntryId);
      
      if (duplicates && duplicates.length > 0) {
        return { 
          isDuplicate: true, 
          month: monthNames[month - 1],
          year: year
        };
      }
      
      return { isDuplicate: false };
    } catch (error) {
      console.error("Error al verificar duplicados:", error);
      return { isDuplicate: false };
    }
  };

  const addNewPurchase = () => {
    const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
    const defaultDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const newEntry: PurchaseEntry = {
      invoice_series: "",
      invoice_number: "",
      invoice_date: defaultDate,
      fel_document_type: felDocTypes[0]?.code || "",
      supplier_nit: "",
      supplier_name: "",
      total_amount: 0,
      base_amount: 0,
      vat_amount: 0,
      batch_reference: "",
      journal_entry_id: null,
      isNew: true,
    };
    setPurchases([newEntry, ...purchases]);
  };

  const addNewSale = () => {
    const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
    const defaultDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

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
    setSales([newEntry, ...sales]);
  };

  const updatePurchaseRow = (index: number, field: keyof PurchaseEntry, value: any) => {
    const updated = [...purchases];
    updated[index] = { ...updated[index], [field]: value };

    if (field === "total_amount" || field === "fel_document_type") {
      const { base, vat } = calculateVAT(
        field === "total_amount" ? parseFloat(value) || 0 : updated[index].total_amount,
        field === "fel_document_type" ? value : updated[index].fel_document_type
      );
      updated[index].base_amount = base;
      updated[index].vat_amount = vat;
    }

    setPurchases(updated);
  };

  const updateSaleRow = (index: number, field: keyof SaleEntry, value: any) => {
    const updated = [...sales];
    updated[index] = { ...updated[index], [field]: value };

    if (field === "total_amount" || field === "fel_document_type") {
      const { base, vat } = calculateVAT(
        field === "total_amount" ? parseFloat(value) || 0 : updated[index].total_amount,
        field === "fel_document_type" ? value : updated[index].fel_document_type
      );
      updated[index].net_amount = base;
      updated[index].vat_amount = vat;
    }

    setSales(updated);
  };

  const savePurchaseRow = async (index: number) => {
    const entry = purchases[index];
    if (!currentBookId || !currentEnterpriseId) return;

    // Validar duplicados antes de guardar
    const duplicateCheck = await checkDuplicatePurchase(entry, entry.id);
    if (duplicateCheck.isDuplicate) {
      toast({
        title: "Documento duplicado",
        description: `Documento ya ingresado en el mes ${duplicateCheck.month} ${duplicateCheck.year}`,
        variant: "destructive",
      });
      return;
    }

    try {
      const entryData = {
        purchase_book_id: currentBookId,
        enterprise_id: parseInt(currentEnterpriseId),
        invoice_series: entry.invoice_series || null,
        invoice_number: entry.invoice_number,
        invoice_date: entry.invoice_date,
        fel_document_type: entry.fel_document_type,
        supplier_nit: entry.supplier_nit,
        supplier_name: entry.supplier_name,
        total_amount: entry.total_amount,
        base_amount: entry.base_amount,
        vat_amount: entry.vat_amount,
        net_amount: entry.base_amount,
        batch_reference: entry.batch_reference || null,
      };

      if (entry.isNew) {
        const { data, error } = await supabase
          .from("tab_purchase_ledger")
          .insert(entryData)
          .select()
          .single();

        if (error) throw error;

        const updated = [...purchases];
        updated[index] = { ...data, isNew: false };
        setPurchases(updated);

        toast({
          title: "Factura guardada",
          description: "La factura de compra se guardó correctamente",
        });
      } else if (entry.id) {
        const { error } = await supabase
          .from("tab_purchase_ledger")
          .update(entryData)
          .eq("id", entry.id);

        if (error) throw error;

        toast({
          title: "Factura actualizada",
          description: "Los cambios se guardaron correctamente",
        });
      }
    } catch (error: any) {
      const errorMessage = error.message?.includes("unique_purchase_document") 
        ? `Documento ya ingresado en el mes ${selectedMonth} ${selectedYear}`
        : getSafeErrorMessage(error);
      
      toast({
        title: "Error al guardar",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const saveSaleRow = async (index: number) => {
    const entry = sales[index];
    if (!currentEnterpriseId) return;

    // Validar duplicados antes de guardar
    const duplicateCheck = await checkDuplicateSale(entry, entry.id);
    if (duplicateCheck.isDuplicate) {
      toast({
        title: "Documento duplicado",
        description: `Documento ya ingresado en el mes ${duplicateCheck.month} ${duplicateCheck.year}`,
        variant: "destructive",
      });
      return;
    }

    try {
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
          description: "La factura de venta se guardó correctamente",
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
      const errorMessage = error.message?.includes("unique_sales_document") 
        ? `Documento ya ingresado en el mes ${selectedMonth} ${selectedYear}`
        : getSafeErrorMessage(error);
      
      toast({
        title: "Error al guardar",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const deletePurchaseRow = async (index: number) => {
    const entry = purchases[index];
    
    if (entry.isNew) {
      setPurchases(purchases.filter((_, i) => i !== index));
      return;
    }

    if (!entry.id) return;

    try {
      const { error } = await supabase
        .from("tab_purchase_ledger")
        .delete()
        .eq("id", entry.id);

      if (error) throw error;

      setPurchases(purchases.filter((_, i) => i !== index));
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

  const deleteSaleRow = async (index: number) => {
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

  if (!currentEnterpriseId) {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Selecciona una empresa para ver los libros fiscales
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
          <h1 className="text-3xl font-bold">{activeTab === "compras" ? "Compras" : "Ventas"}</h1>
          <p className="text-muted-foreground">Registro de {activeTab === "compras" ? "compras" : "ventas"}</p>
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

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "compras" | "ventas")}>
        <TabsList className="grid w-full grid-cols-2 bg-muted/50">
          <TabsTrigger value="compras" className="data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:font-semibold">Libro de Compras</TabsTrigger>
          <TabsTrigger value="ventas" className="data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:font-semibold">Libro de Ventas</TabsTrigger>
        </TabsList>

        <TabsContent value="compras" className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex gap-6 text-sm">
              <div>
                <span className="text-muted-foreground">Documentos: </span>
                <Badge variant="secondary">{purchaseTotals.documentCount}</Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Base: </span>
                <span className="font-semibold">Q {purchaseTotals.totalBase}</span>
              </div>
              <div>
                <span className="text-muted-foreground">IVA: </span>
                <span className="font-semibold">Q {purchaseTotals.totalVAT}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Total c/IVA: </span>
                <span className="font-semibold">Q {purchaseTotals.totalWithVAT}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowImportDialog(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Importar
              </Button>
              <Button size="sm" onClick={addNewPurchase}>
                <Plus className="h-4 w-4 mr-2" />
                Nueva Factura
              </Button>
            </div>
          </div>

          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <p className="text-center text-muted-foreground">Cargando...</p>
              ) : purchases.length === 0 ? (
                <p className="text-center text-muted-foreground">No hay facturas registradas</p>
              ) : (
                <div className="space-y-2">
                  {purchases.map((purchase, index) => (
                    <PurchaseCard
                      key={purchase.id || `new-${index}`}
                      purchase={purchase}
                      index={index}
                      felDocTypes={felDocTypes}
                      onUpdate={updatePurchaseRow}
                      onSave={savePurchaseRow}
                      onDelete={deletePurchaseRow}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ventas" className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex gap-6 text-sm">
              <div>
                <span className="text-muted-foreground">Documentos: </span>
                <Badge variant="secondary">{salesTotals.documentCount}</Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Neto: </span>
                <span className="font-semibold">Q {salesTotals.totalNet}</span>
              </div>
              <div>
                <span className="text-muted-foreground">IVA: </span>
                <span className="font-semibold">Q {salesTotals.totalVAT}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Total c/IVA: </span>
                <span className="font-semibold">Q {salesTotals.totalWithVAT}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowImportDialog(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Importar
              </Button>
              <Button size="sm" onClick={addNewSale}>
                <Plus className="h-4 w-4 mr-2" />
                Nueva Factura
              </Button>
            </div>
          </div>

          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <p className="text-center text-muted-foreground">Cargando...</p>
              ) : sales.length === 0 ? (
                <p className="text-center text-muted-foreground">No hay facturas registradas</p>
              ) : (
                <div className="space-y-2">
                  {sales.map((sale, index) => (
                    <SalesCard
                      key={sale.id || `new-${index}`}
                      sale={sale}
                      index={index}
                      felDocTypes={felDocTypes}
                      onUpdate={updateSaleRow}
                      onSave={saveSaleRow}
                      onDelete={deleteSaleRow}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>


      {activeTab === "compras" && currentEnterpriseId && currentBookId && (
        <ImportPurchasesDialog
          open={showImportDialog}
          onOpenChange={setShowImportDialog}
          enterpriseId={parseInt(currentEnterpriseId)}
          bookId={currentBookId}
          onSuccess={() => {
            if (currentBookId) fetchPurchases(currentBookId);
          }}
        />
      )}

      {activeTab === "ventas" && currentEnterpriseId && (
        <ImportSalesDialog
          open={showImportDialog}
          onOpenChange={setShowImportDialog}
          enterpriseId={parseInt(currentEnterpriseId)}
          onSuccess={() => {
            if (currentEnterpriseId) fetchSales(currentEnterpriseId, selectedMonth, selectedYear);
          }}
        />
      )}
    </div>
  );
}
