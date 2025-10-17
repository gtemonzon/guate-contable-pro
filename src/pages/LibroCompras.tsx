import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileText, Upload } from "lucide-react";
import { PurchaseCard } from "@/components/compras/PurchaseCard";
import { useToast } from "@/hooks/use-toast";
import { ImportPurchasesDialog } from "@/components/compras/ImportPurchasesDialog";
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

export default function LibroCompras() {
  const [purchases, setPurchases] = useState<PurchaseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentEnterpriseId, setCurrentEnterpriseId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [felDocTypes, setFelDocTypes] = useState<FELDocumentType[]>([]);
  const [currentBookId, setCurrentBookId] = useState<number | null>(null);
  const [showJournalDialog, setShowJournalDialog] = useState(false);
  const [journalType, setJournalType] = useState<"mes" | "cheque">("mes");
  const [showImportDialog, setShowImportDialog] = useState(false);

  const { toast } = useToast();

  const totals = useMemo(() => {
    const totalWithVAT = purchases.reduce((sum, p) => sum + (p.total_amount || 0), 0);
    const totalVAT = purchases.reduce((sum, p) => sum + (p.vat_amount || 0), 0);
    const totalBase = purchases.reduce((sum, p) => sum + (p.base_amount || 0), 0);
    const documentCount = purchases.length;

    return {
      totalWithVAT: formatCurrency(totalWithVAT),
      totalVAT: formatCurrency(totalVAT),
      totalBase: formatCurrency(totalBase),
      documentCount,
    };
  }, [purchases]);

  const monthNames = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];

  useEffect(() => {
    const enterpriseId = localStorage.getItem("currentEnterpriseId");
    setCurrentEnterpriseId(enterpriseId);
    
    if (enterpriseId) {
      fetchFELDocTypes();
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
        fetchOrCreateBook(newEnterpriseId, selectedMonth, selectedYear);
      } else {
        setPurchases([]);
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
      
      // Buscar libro existente
      let { data: book, error: fetchError } = await supabase
        .from("tab_purchase_books")
        .select("*")
        .eq("enterprise_id", parseInt(enterpriseId))
        .eq("month", month)
        .eq("year", year)
        .maybeSingle();

      if (fetchError) throw fetchError;

      // Si no existe, crear uno nuevo
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
        .order("invoice_date", { ascending: true })
        .order("invoice_number", { ascending: true });

      if (error) throw error;
      setPurchases(data || []);
    } catch (error: any) {
      toast({
        title: "Error al cargar facturas",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const addNewRow = () => {
    // Copiar fecha de la última entrada o usar el último día del mes seleccionado
    let defaultDate = new Date().toISOString().split('T')[0];
    if (purchases.length > 0) {
      defaultDate = purchases[purchases.length - 1].invoice_date;
    } else {
      // Último día del mes seleccionado
      const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
      defaultDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }

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
    setPurchases([...purchases, newEntry]);
  };

  const updateRow = (index: number, field: keyof PurchaseEntry, value: any) => {
    const updated = [...purchases];
    
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
      const base = total / 1.12;
      const vat = total - base;
      updated[index].base_amount = parseFloat(base.toFixed(2));
      updated[index].vat_amount = parseFloat(vat.toFixed(2));
    }

    setPurchases(updated);
  };

  const saveRow = async (index: number) => {
    const entry = purchases[index];
    if (!currentBookId || !currentEnterpriseId) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuario no autenticado");

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
          description: "La factura se guardó correctamente",
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
      toast({
        title: "Error al guardar",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const deleteRow = async (index: number) => {
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

  if (!currentEnterpriseId) {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Selecciona una empresa para ver el libro de compras
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
          <h1 className="text-3xl font-bold">Libro de Compras</h1>
          <p className="text-muted-foreground">Registro mensual de facturas de compra</p>
          
          <div className="mt-4 flex gap-6 text-sm">
            <div>
              <span className="text-muted-foreground">Documentos: </span>
              <Badge variant="secondary">{totals.documentCount}</Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Base: </span>
              <span className="font-semibold">Q {totals.totalBase}</span>
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
                      <p><strong>Base:</strong> {totals.totalBase}</p>
                      <p><strong>IVA:</strong> {totals.totalVAT}</p>
                      <p><strong>Total:</strong> {totals.totalWithVAT}</p>
                    </div>
                    <Button 
                      className="w-full" 
                      onClick={async () => {
                        try {
                          if (!currentEnterpriseId || !currentBookId) {
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
                          const entryNumber = `COMP-${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
                          const { data: journalEntry, error: journalError } = await supabase
                            .from("tab_journal_entries")
                            .insert({
                              enterprise_id: parseInt(currentEnterpriseId),
                              accounting_period_id: period.id,
                              entry_number: entryNumber,
                              entry_date: new Date().toISOString().split('T')[0],
                              entry_type: "diario",
                              description: `Libro de Compras ${monthNames[selectedMonth - 1]} ${selectedYear}`,
                              total_debit: parseFloat(totals.totalWithVAT),
                              total_credit: parseFloat(totals.totalWithVAT),
                              created_by: user.id,
                            })
                            .select()
                            .single();

                          if (journalError) throw journalError;

                          // Marcar facturas con el journal_entry_id
                          const purchaseIds = purchases.filter(p => p.id).map(p => p.id);
                          if (purchaseIds.length > 0) {
                            const { error: updateError } = await supabase
                              .from("tab_purchase_ledger")
                              .update({ journal_entry_id: journalEntry.id })
                              .in("id", purchaseIds);

                            if (updateError) throw updateError;
                          }

                          toast({
                            title: "Póliza generada",
                            description: `Póliza ${entryNumber} creada exitosamente`,
                          });
                          setShowJournalDialog(false);
                          
                          // Recargar facturas
                          await fetchPurchases(currentBookId);
                        } catch (error: any) {
                          toast({
                            title: "Error al generar póliza",
                            description: error.message,
                            variant: "destructive",
                          });
                        }
                      }}
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
          ) : purchases.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No hay facturas. Haz clic en "Agregar Línea" para comenzar.
            </p>
          ) : (
            <div className="space-y-3">
              {purchases.map((purchase, index) => (
                <PurchaseCard
                  key={purchase.id || `new-${index}`}
                  purchase={purchase}
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

      <ImportPurchasesDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        enterpriseId={currentEnterpriseId ? parseInt(currentEnterpriseId) : null}
        onSuccess={() => {
          if (currentEnterpriseId) {
            fetchOrCreateBook(currentEnterpriseId, selectedMonth, selectedYear);
          }
        }}
      />
    </div>
  );
}
