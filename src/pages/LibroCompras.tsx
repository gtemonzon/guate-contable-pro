import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRecords } from "@/utils/supabaseHelpers";
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
  operation_type_id: number | null;
  expense_account_id: number | null;
  bank_account_id: number | null;
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
  const [journalType, setJournalType] = useState<"mes" | "banco" | "documento">("mes");
  const [showImportDialog, setShowImportDialog] = useState(false);
  
  const [expenseAccounts, setExpenseAccounts] = useState<Array<{
    id: number;
    account_code: string;
    account_name: string;
  }>>([]);
  
  const [bankAccounts, setBankAccounts] = useState<Array<{
    id: number;
    account_code: string;
    account_name: string;
  }>>([]);
  
  const [operationTypes, setOperationTypes] = useState<Array<{
    id: number;
    code: string;
    name: string;
  }>>([]);
  
  const [lastExpenseAccountId, setLastExpenseAccountId] = useState<number | null>(null);
  const [lastBankAccountId, setLastBankAccountId] = useState<number | null>(null);

  const { toast } = useToast();

  const totals = useMemo(() => {
    const totalWithVAT = purchases.reduce((sum, p) => sum + (p.total_amount || 0), 0);
    const totalVAT = purchases.reduce((sum, p) => sum + (p.vat_amount || 0), 0);
    const totalBase = purchases.reduce((sum, p) => sum + (p.base_amount || 0), 0);
    const documentCount = purchases.length;

    // Calcular totales por tipo de documento
    const byDocType = purchases.reduce((acc, p) => {
      const docType = p.fel_document_type || 'SIN_TIPO';
      if (!acc[docType]) {
        acc[docType] = { total: 0, count: 0 };
      }
      acc[docType].total += p.total_amount || 0;
      acc[docType].count += 1;
      return acc;
    }, {} as Record<string, { total: number; count: number }>);

    // Calcular totales por operación
    const byOperation = purchases.reduce((acc, p) => {
      if (!p.operation_type_id) return acc;
      const opType = operationTypes.find(o => o.id === p.operation_type_id);
      if (!opType) return acc;
      const key = opType.code;
      if (!acc[key]) {
        acc[key] = { total: 0, count: 0 };
      }
      acc[key].total += p.total_amount || 0;
      acc[key].count += 1;
      return acc;
    }, {} as Record<string, { total: number; count: number }>);

    console.log('Totals by DocType:', byDocType);
    console.log('Totals by Operation:', byOperation);

    return {
      totalWithVAT: formatCurrency(totalWithVAT),
      totalVAT: formatCurrency(totalVAT),
      totalBase: formatCurrency(totalBase),
      documentCount,
      byDocType,
      byOperation,
    };
  }, [purchases, operationTypes]);

  const monthNames = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];

  useEffect(() => {
    const enterpriseId = localStorage.getItem("currentEnterpriseId");
    setCurrentEnterpriseId(enterpriseId);
    
    if (enterpriseId) {
      fetchFELDocTypes();
      fetchAccounts(enterpriseId);
      
      // Cargar última cuenta usada desde localStorage
      const savedExpense = localStorage.getItem(`lastExpenseAccount_${enterpriseId}`);
      const savedBank = localStorage.getItem(`lastBankAccount_${enterpriseId}`);
      if (savedExpense) setLastExpenseAccountId(parseInt(savedExpense));
      if (savedBank) setLastBankAccountId(parseInt(savedBank));
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
        fetchAccounts(newEnterpriseId);
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

  const fetchAccounts = async (enterpriseId: string) => {
    try {
      // Cuentas que permiten movimientos (para gastos)
      const { data: movementAccounts, error: movementError } = await supabase
        .from("tab_accounts")
        .select("id, account_code, account_name")
        .eq("enterprise_id", parseInt(enterpriseId))
        .eq("allows_movement", true)
        .eq("is_active", true)
        .order("account_code");

      if (movementError) throw movementError;

      // Gastos/Compras: Cuentas que empiezan con 5 (Gastos) o 6 (Costos)
      const expenses = movementAccounts?.filter(acc => 
        acc.account_code.startsWith('5') || acc.account_code.startsWith('6')
      ) || [];

      setExpenseAccounts(expenses);

      // Cuentas bancarias (is_bank_account = true)
      const { data: banks, error: banksError } = await supabase
        .from("tab_accounts")
        .select("id, account_code, account_name")
        .eq("enterprise_id", parseInt(enterpriseId))
        .eq("is_bank_account", true)
        .eq("is_active", true)
        .order("account_code");

      if (banksError) throw banksError;
      setBankAccounts(banks || []);

      // Tipos de operación
      const { data: types, error: typesError } = await supabase
        .from("tab_operation_types")
        .select("id, code, name")
        .eq("is_active", true)
        .in("applies_to", ["purchases", "both"])
        .order("code");

      if (typesError) throw typesError;
      setOperationTypes(types || []);

    } catch (error: any) {
      console.error("Error al cargar cuentas:", error);
      toast({
        title: "Error al cargar cuentas",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
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
      const data = await fetchAllRecords<any>(
        supabase
          .from("tab_purchase_ledger")
          .select("*")
          .eq("purchase_book_id", bookId)
          .order("invoice_date", { ascending: true })
          .order("invoice_number", { ascending: true })
      );
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
      operation_type_id: null,
      expense_account_id: lastExpenseAccountId,
      bank_account_id: lastBankAccountId,
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

      // Obtener período contable activo
      const activePeriodId = localStorage.getItem(`currentPeriodId_${currentEnterpriseId}`);
      if (!activePeriodId) {
        throw new Error("No hay período contable activo para esta empresa. Por favor, active un período en la vista de Empresas.");
      }

      // Verificar que el período esté abierto
      const { data: period, error: periodError } = await supabase
        .from('tab_accounting_periods')
        .select('status')
        .eq('id', parseInt(activePeriodId))
        .single();

      if (periodError) throw periodError;
      if (period.status !== 'abierto') {
        throw new Error("El período contable no está abierto. No se pueden crear facturas.");
      }

      const entryData = {
        purchase_book_id: currentBookId,
        enterprise_id: parseInt(currentEnterpriseId),
        accounting_period_id: parseInt(activePeriodId),
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
        expense_account_id: entry.expense_account_id,
        bank_account_id: entry.bank_account_id,
        operation_type_id: entry.operation_type_id,
      };
      
      // Guardar última cuenta usada
      if (entry.expense_account_id) {
        setLastExpenseAccountId(entry.expense_account_id);
        localStorage.setItem(`lastExpenseAccount_${currentEnterpriseId}`, entry.expense_account_id.toString());
      }
      if (entry.bank_account_id) {
        setLastBankAccountId(entry.bank_account_id);
        localStorage.setItem(`lastBankAccount_${currentEnterpriseId}`, entry.bank_account_id.toString());
      }

      if (entry.isNew) {
        const { data, error } = await supabase
          .from("tab_purchase_ledger")
          .insert(entryData)
          .select()
          .single();

        if (error) {
          console.error("Error detallado al insertar:", error);
          throw error;
        }

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

        if (error) {
          console.error("Error detallado al actualizar:", error);
          throw error;
        }

        toast({
          title: "Factura actualizada",
          description: "Los cambios se guardaron correctamente",
        });
      }
    } catch (error: any) {
      console.error("Error completo:", error);
      let errorMessage = getSafeErrorMessage(error);
      
      // Mensajes más específicos según el error
      if (error.message?.includes("fecha")) {
        errorMessage = "La fecha de la factura debe estar en el mes seleccionado o máximo 2 meses atrás";
      } else if (error.code === "23502") {
        errorMessage = "Faltan campos requeridos. Verifique que haya completado todos los campos obligatorios.";
      } else if (error.code === "23503") {
        errorMessage = "Error de referencia: Verifique que las cuentas seleccionadas sean válidas.";
      }
      
      toast({
        title: "Error al guardar",
        description: errorMessage,
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
          
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex gap-6">
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
            
            {Object.keys(totals.byOperation).length > 0 && (
              <div>
                <span className="text-muted-foreground">Por Operación: </span>
                {Object.entries(totals.byOperation).map(([key, data], idx) => (
                  <>
                    {idx > 0 && <span>    </span>}
                    <span key={key} className="font-medium">
                      {key}: Q {formatCurrency(data.total)} ({data.count})
                    </span>
                  </>
                ))}
              </div>
            )}
            
            {Object.keys(totals.byDocType).length > 0 && (
              <div>
                <span className="text-muted-foreground">Por Documento: </span>
                {Object.entries(totals.byDocType).map(([key, data], idx) => (
                  <>
                    {idx > 0 && <span>    </span>}
                    <span key={key} className="font-medium">
                      {key}: Q {formatCurrency(data.total)} ({data.count})
                    </span>
                  </>
                ))}
              </div>
            )}
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
                      <Select value={journalType} onValueChange={(v) => setJournalType(v as "mes" | "banco" | "documento")}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mes">Póliza Consolidada</SelectItem>
                          <SelectItem value="banco">Póliza por Banco</SelectItem>
                          <SelectItem value="documento">Póliza por Documento</SelectItem>
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

                          // Validar que todas las facturas tengan cuenta asignada
                          const withoutAccount = purchases.filter(p => !p.expense_account_id);
                          if (withoutAccount.length > 0) {
                            toast({
                              title: "Documentos sin cuenta",
                              description: `Hay ${withoutAccount.length} documentos sin cuenta contable asignada`,
                              variant: "destructive",
                            });
                            return;
                          }

                          const { data: { user } } = await supabase.auth.getUser();
                          if (!user) throw new Error("Usuario no autenticado");

                          // Obtener período contable activo (primero intentar desde localStorage)
                          let period;
                          const activePeriodId = localStorage.getItem(`currentPeriodId_${currentEnterpriseId}`);
                          
                          if (activePeriodId) {
                            const { data, error: periodError } = await supabase
                              .from("tab_accounting_periods")
                              .select("id")
                              .eq("id", parseInt(activePeriodId))
                              .eq("status", "abierto")
                              .maybeSingle();
                            
                            if (!periodError) period = data;
                          }
                          
                          // Fallback: buscar período abierto por año
                          if (!period) {
                            const { data, error: periodError } = await supabase
                              .from("tab_accounting_periods")
                              .select("id")
                              .eq("enterprise_id", parseInt(currentEnterpriseId))
                              .eq("status", "abierto")
                              .eq("year", selectedYear)
                              .maybeSingle();
                            
                            if (periodError) throw periodError;
                            period = data;
                          }

                          if (!period) {
                            toast({
                              title: "Error",
                              description: "No hay período contable abierto para este año",
                              variant: "destructive",
                            });
                            return;
                          }

                          if (journalType === "mes") {
                            // Póliza consolidada del mes
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
                                total_debit: parseFloat(totals.totalWithVAT.replace(/,/g, '')),
                                total_credit: parseFloat(totals.totalWithVAT.replace(/,/g, '')),
                                is_posted: false,
                                created_by: user.id,
                              })
                              .select()
                              .single();

                            if (journalError) throw journalError;

                            // Marcar facturas
                            const purchaseIds = purchases.filter(p => p.id).map(p => p.id);
                            if (purchaseIds.length > 0) {
                              await supabase
                                .from("tab_purchase_ledger")
                                .update({ journal_entry_id: journalEntry.id })
                                .in("id", purchaseIds);
                            }

                            toast({
                              title: "Póliza generada",
                              description: `Póliza ${entryNumber} creada en borrador`,
                            });
                          } else if (journalType === "banco") {
                            // Agrupar por batch_reference
                            const byBank = purchases.reduce((acc, p) => {
                              const key = p.batch_reference || "SIN_REF";
                              if (!acc[key]) acc[key] = [];
                              acc[key].push(p);
                              return acc;
                            }, {} as Record<string, PurchaseEntry[]>);

                            for (const [ref, items] of Object.entries(byBank)) {
                              const total = items.reduce((sum, p) => sum + p.total_amount, 0);
                              const entryNumber = `COMP-BANCO-${ref}-${selectedYear}${String(selectedMonth).padStart(2, '0')}`;
                              
                              const { data: journalEntry, error: journalError } = await supabase
                                .from("tab_journal_entries")
                                .insert({
                                  enterprise_id: parseInt(currentEnterpriseId),
                                  accounting_period_id: period.id,
                                  entry_number: entryNumber,
                                  entry_date: new Date().toISOString().split('T')[0],
                                  entry_type: "diario",
                                  description: `Compras Ref. ${ref}`,
                                  total_debit: total,
                                  total_credit: total,
                                  is_posted: false,
                                  created_by: user.id,
                                })
                                .select()
                                .single();

                              if (journalError) throw journalError;

                              const ids = items.filter(p => p.id).map(p => p.id);
                              if (ids.length > 0) {
                                await supabase
                                  .from("tab_purchase_ledger")
                                  .update({ journal_entry_id: journalEntry.id })
                                  .in("id", ids);
                              }
                            }

                            toast({
                              title: "Pólizas generadas",
                              description: `${Object.keys(byBank).length} pólizas creadas en borrador`,
                            });
                          } else {
                            // Póliza por documento
                            for (const p of purchases) {
                              if (!p.id) continue;
                              
                              const entryNumber = `COMP-DOC-${p.invoice_series}-${p.invoice_number}`;
                              const { data: journalEntry, error: journalError } = await supabase
                                .from("tab_journal_entries")
                                .insert({
                                  enterprise_id: parseInt(currentEnterpriseId),
                                  accounting_period_id: period.id,
                                  entry_number: entryNumber,
                                  entry_date: p.invoice_date,
                                  entry_type: "diario",
                                  description: `Compra ${p.supplier_name}`,
                                  total_debit: p.total_amount,
                                  total_credit: p.total_amount,
                                  is_posted: false,
                                  created_by: user.id,
                                })
                                .select()
                                .single();

                              if (journalError) throw journalError;

                              await supabase
                                .from("tab_purchase_ledger")
                                .update({ journal_entry_id: journalEntry.id })
                                .eq("id", p.id);
                            }

                            toast({
                              title: "Pólizas generadas",
                              description: `${purchases.length} pólizas creadas en borrador`,
                            });
                          }

                          setShowJournalDialog(false);
                          await fetchPurchases(currentBookId);
                        } catch (error: any) {
                          toast({
                            title: "Error al generar póliza",
                            description: getSafeErrorMessage(error),
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
                  operationTypes={operationTypes}
                  expenseAccounts={expenseAccounts}
                  bankAccounts={bankAccounts}
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
        expenseAccounts={expenseAccounts}
        operationTypes={operationTypes}
      />
    </div>
  );
}
