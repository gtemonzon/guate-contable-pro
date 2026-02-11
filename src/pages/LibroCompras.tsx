import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRecords } from "@/utils/supabaseHelpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileText, Upload, Loader2, AlertCircle, RefreshCw, Plus } from "lucide-react";
import { PurchaseCard, PurchaseCardRef } from "@/components/compras/PurchaseCard";
import { useToast } from "@/hooks/use-toast";
import { ImportPurchasesDialog } from "@/components/compras/ImportPurchasesDialog";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { formatCurrency } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SaveStatusIndicator, SaveStatus } from "@/components/ui/save-status-indicator";
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
  _recommendedFields?: string[];
}

export default function LibroCompras() {
  const [purchases, setPurchases] = useState<PurchaseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentEnterpriseId, setCurrentEnterpriseId] = useState<string | null>(null);
  const [enterpriseNit, setEnterpriseNit] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [felDocTypes, setFelDocTypes] = useState<FELDocumentType[]>([]);
  const [currentBookId, setCurrentBookId] = useState<number | null>(null);
  const [showJournalDialog, setShowJournalDialog] = useState(false);
  const [journalType, setJournalType] = useState<"mes" | "banco" | "documento">("mes");
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [isGeneratingJournal, setIsGeneratingJournal] = useState(false);
  const [existingJournalEntry, setExistingJournalEntry] = useState<{ exists: boolean; id?: number }>({ exists: false });
  
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
  const [lastOperationTypeId, setLastOperationTypeId] = useState<number | null>(null);
  const [focusNewRow, setFocusNewRow] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const saveStatusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const newCardRef = useRef<PurchaseCardRef>(null);

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
    
    const fetchEnterpriseNit = async (id: string) => {
      const { data } = await supabase
        .from("tab_enterprises")
        .select("nit")
        .eq("id", parseInt(id))
        .single();
      if (data) setEnterpriseNit(data.nit);
    };
    
    if (enterpriseId) {
      fetchFELDocTypes();
      fetchAccounts(enterpriseId);
      fetchEnterpriseNit(enterpriseId);
      
      // Cargar última cuenta usada desde localStorage
      const savedExpense = localStorage.getItem(`lastExpenseAccount_${enterpriseId}`);
      const savedBank = localStorage.getItem(`lastBankAccount_${enterpriseId}`);
      if (savedExpense) setLastExpenseAccountId(parseInt(savedExpense));
      if (savedBank) setLastBankAccountId(parseInt(savedBank));
      const savedOpType = localStorage.getItem(`lastOperationType_purchases_${enterpriseId}`);
      if (savedOpType) setLastOperationTypeId(parseInt(savedOpType));
    } else {
      setLoading(false);
      toast({
        title: "Selecciona una empresa",
        description: "Debes seleccionar una empresa primero",
        variant: "destructive",
      });
    }

    const handleStorageChange = async () => {
      const newEnterpriseId = localStorage.getItem("currentEnterpriseId");
      setCurrentEnterpriseId(newEnterpriseId);
      if (newEnterpriseId) {
        fetchFELDocTypes();
        fetchAccounts(newEnterpriseId);
        fetchOrCreateBook(newEnterpriseId, selectedMonth, selectedYear);
        const { data } = await supabase
          .from("tab_enterprises")
          .select("nit")
          .eq("id", parseInt(newEnterpriseId))
          .single();
        if (data) setEnterpriseNit(data.nit);
      } else {
        setPurchases([]);
        setEnterpriseNit("");
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

      // Gastos/Compras: Cuentas que empiezan con 5 (Gastos), 6 (Costos) o 7 (Gastos)
      const expenses = movementAccounts?.filter(acc => 
        acc.account_code.startsWith('5') || acc.account_code.startsWith('6') || acc.account_code.startsWith('7')
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
      
      // Verificar si ya existe póliza consolidada para este mes
      if (currentEnterpriseId) {
        await checkExistingJournalEntry(currentEnterpriseId, selectedMonth, selectedYear);
      }
    } catch (error: any) {
      toast({
        title: "Error al cargar facturas",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const checkExistingJournalEntry = async (enterpriseId: string, month: number, year: number) => {
    try {
      const entryNumber = `COMP-${year}-${String(month).padStart(2, '0')}`;
      const { data, error } = await supabase
        .from("tab_journal_entries")
        .select("id")
        .eq("enterprise_id", parseInt(enterpriseId))
        .eq("entry_number", entryNumber)
        .maybeSingle();

      if (error) throw error;
      setExistingJournalEntry({ exists: !!data, id: data?.id });
    } catch (error) {
      console.error("Error checking existing journal entry:", error);
      setExistingJournalEntry({ exists: false });
    }
  };

  const deleteExistingJournalEntry = async (journalEntryId: number) => {
    // Primero eliminar detalles
    await supabase
      .from("tab_journal_entry_details")
      .delete()
      .eq("journal_entry_id", journalEntryId);

    // Limpiar referencias en compras
    await supabase
      .from("tab_purchase_ledger")
      .update({ journal_entry_id: null })
      .eq("journal_entry_id", journalEntryId);

    // Eliminar póliza
    await supabase
      .from("tab_journal_entries")
      .delete()
      .eq("id", journalEntryId);
  };

  const addNewRow = useCallback(() => {
    // Copiar fecha de la última entrada o usar el último día del mes seleccionado
    let defaultDate = new Date().toISOString().split('T')[0];
    if (purchases.length > 0) {
      defaultDate = purchases[purchases.length - 1].invoice_date;
    } else {
      // Último día del mes seleccionado
      const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
      defaultDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }

    const recommendedList: string[] = ['invoice_date', 'fel_document_type'];
    if (lastExpenseAccountId) recommendedList.push('expense_account_id');
    if (lastBankAccountId) recommendedList.push('bank_account_id');
    if (lastOperationTypeId) recommendedList.push('operation_type_id');

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
      operation_type_id: lastOperationTypeId,
      expense_account_id: lastExpenseAccountId,
      bank_account_id: lastBankAccountId,
      journal_entry_id: null,
      isNew: true,
      _recommendedFields: recommendedList,
    };
    setPurchases(prev => [...prev, newEntry]);
    setFocusNewRow(true);
  }, [purchases, selectedMonth, selectedYear, felDocTypes, lastExpenseAccountId, lastBankAccountId, lastOperationTypeId]);

  // Focus new row after render
  useEffect(() => {
    if (focusNewRow && purchases.length > 0) {
      setTimeout(() => {
        newCardRef.current?.focusDateField();
        setFocusNewRow(false);
      }, 100);
    }
  }, [focusNewRow, purchases.length]);

  // Keyboard shortcut: Alt+N para nueva factura
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        addNewRow();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [addNewRow]);

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

    // Mostrar indicador de guardando
    setSaveStatus("saving");
    if (saveStatusTimeoutRef.current) {
      clearTimeout(saveStatusTimeoutRef.current);
    }

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
      if (entry.operation_type_id) {
        setLastOperationTypeId(entry.operation_type_id);
        localStorage.setItem(`lastOperationType_purchases_${currentEnterpriseId}`, entry.operation_type_id.toString());
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
      } else if (entry.id) {
        const { error } = await supabase
          .from("tab_purchase_ledger")
          .update(entryData)
          .eq("id", entry.id);

        if (error) {
          console.error("Error detallado al actualizar:", error);
          throw error;
        }
      }

      // Mostrar indicador de guardado exitoso
      setSaveStatus("saved");
      saveStatusTimeoutRef.current = setTimeout(() => {
        setSaveStatus("idle");
      }, 3000);
    } catch (error: any) {
      console.error("Error completo:", error);
      setSaveStatus("idle");
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

  const generatePurchaseJournalEntry = async (replaceExisting: boolean = false) => {
    setIsGeneratingJournal(true);
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

      // Si existe póliza y se debe reemplazar, eliminarla primero
      if (replaceExisting && existingJournalEntry.exists && existingJournalEntry.id) {
        await deleteExistingJournalEntry(existingJournalEntry.id);
      }

      // Obtener período contable activo
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

      // Obtener configuración de empresa para cuentas de IVA
      const { data: enterpriseConfig } = await supabase
        .from("tab_enterprise_config")
        .select("vat_credit_account_id, suppliers_account_id")
        .eq("enterprise_id", parseInt(currentEnterpriseId))
        .maybeSingle();

      const vatCreditAccountId = enterpriseConfig?.vat_credit_account_id;
      const suppliersAccountId = enterpriseConfig?.suppliers_account_id;

      // Función auxiliar para crear líneas de detalle
      const createPurchaseDetailLines = async (
        journalEntryId: number,
        purchaseItems: PurchaseEntry[],
        description: string
      ) => {
        const detailLines: Array<{
          journal_entry_id: number;
          line_number: number;
          account_id: number;
          description: string;
          debit_amount: number;
          credit_amount: number;
        }> = [];

        let lineNumber = 1;

        // Agrupar por cuenta de gasto (débitos)
        const expenseByAccount = new Map<number, number>();
        let totalVAT = 0;
        let totalAmount = 0;

        for (const p of purchaseItems) {
          if (p.expense_account_id) {
            // Usar base_amount real de la factura (respeta si aplica IVA o no)
            // Si vat_amount es 0, la base es igual al total (pequeño contribuyente, etc.)
            const baseAmount = p.vat_amount > 0 ? (p.base_amount || p.total_amount - p.vat_amount) : p.total_amount;
            expenseByAccount.set(
              p.expense_account_id,
              (expenseByAccount.get(p.expense_account_id) || 0) + baseAmount
            );
          }
          // Usar el IVA real de la factura, no recalcular
          totalVAT += p.vat_amount || 0;
          totalAmount += p.total_amount;
        }

        // Débitos: Cuentas de gasto (base sin IVA)
        for (const [accountId, amount] of expenseByAccount) {
          detailLines.push({
            journal_entry_id: journalEntryId,
            line_number: lineNumber++,
            account_id: accountId,
            description,
            debit_amount: parseFloat(amount.toFixed(2)),
            credit_amount: 0,
          });
        }

        // Débito: IVA Crédito Fiscal
        if (vatCreditAccountId && totalVAT > 0) {
          detailLines.push({
            journal_entry_id: journalEntryId,
            line_number: lineNumber++,
            account_id: vatCreditAccountId,
            description,
            debit_amount: parseFloat(totalVAT.toFixed(2)),
            credit_amount: 0,
          });
        }

        // Crédito: Proveedores o Banco/Caja
        const creditAccountId = suppliersAccountId || bankAccounts[0]?.id;
        if (creditAccountId) {
          detailLines.push({
            journal_entry_id: journalEntryId,
            line_number: lineNumber++,
            account_id: creditAccountId,
            description,
            debit_amount: 0,
            credit_amount: parseFloat(totalAmount.toFixed(2)),
          });
        }

        if (detailLines.length > 0) {
          const { error: detailError } = await supabase
            .from("tab_journal_entry_details")
            .insert(detailLines);
          if (detailError) throw detailError;
        }

        return detailLines.length;
      };

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

        const linesCreated = await createPurchaseDetailLines(
          journalEntry.id,
          purchases,
          `Libro de Compras ${monthNames[selectedMonth - 1]} ${selectedYear}`
        );

        // Marcar facturas
        const purchaseIds = purchases.filter(p => p.id).map(p => p.id);
        if (purchaseIds.length > 0) {
          await supabase
            .from("tab_purchase_ledger")
            .update({ journal_entry_id: journalEntry.id })
            .in("id", purchaseIds);
        }

        toast({
          title: replaceExisting ? "Póliza reemplazada" : "Póliza generada",
          description: `Póliza ${entryNumber} creada con ${linesCreated} líneas de detalle`,
        });
      } else if (journalType === "banco") {
        // Agrupar por batch_reference
        const byBank = purchases.reduce((acc, p) => {
          const key = p.batch_reference || "SIN_REF";
          if (!acc[key]) acc[key] = [];
          acc[key].push(p);
          return acc;
        }, {} as Record<string, PurchaseEntry[]>);

        let totalEntries = 0;
        let totalLines = 0;

        for (const [ref, items] of Object.entries(byBank)) {
          const entryNumber = `COMP-${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${ref}`;
          const batchTotal = items.reduce((sum, p) => sum + p.total_amount, 0);

          const { data: journalEntry, error: journalError } = await supabase
            .from("tab_journal_entries")
            .insert({
              enterprise_id: parseInt(currentEnterpriseId),
              accounting_period_id: period.id,
              entry_number: entryNumber,
              entry_date: new Date().toISOString().split('T')[0],
              entry_type: "diario",
              description: `Compras ${ref} - ${monthNames[selectedMonth - 1]} ${selectedYear}`,
              total_debit: batchTotal,
              total_credit: batchTotal,
              is_posted: false,
              created_by: user.id,
            })
            .select()
            .single();

          if (journalError) throw journalError;

          const linesCreated = await createPurchaseDetailLines(
            journalEntry.id,
            items,
            `Compras ${ref} - ${monthNames[selectedMonth - 1]} ${selectedYear}`
          );
          totalLines += linesCreated;

          const itemIds = items.filter(p => p.id).map(p => p.id);
          if (itemIds.length > 0) {
            await supabase
              .from("tab_purchase_ledger")
              .update({ journal_entry_id: journalEntry.id })
              .in("id", itemIds);
          }

          totalEntries++;
        }

        toast({
          title: "Pólizas generadas",
          description: `${totalEntries} pólizas creadas con ${totalLines} líneas de detalle`,
        });
      } else {
        // Póliza por documento
        let totalLines = 0;
        for (const p of purchases) {
          if (!p.id) continue;
          
          const entryNumber = `COMP-DOC-${p.invoice_series || 'S'}-${p.invoice_number}`;
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

          const linesCreated = await createPurchaseDetailLines(
            journalEntry.id,
            [p],
            `Compra ${p.supplier_name}`
          );
          totalLines += linesCreated;

          await supabase
            .from("tab_purchase_ledger")
            .update({ journal_entry_id: journalEntry.id })
            .eq("id", p.id);
        }

        toast({
          title: "Pólizas generadas",
          description: `${purchases.length} pólizas creadas con ${totalLines} líneas de detalle`,
        });
      }

      setShowJournalDialog(false);
      await fetchPurchases(currentBookId);
      // Actualizar estado de póliza existente
      await checkExistingJournalEntry(currentEnterpriseId, selectedMonth, selectedYear);
    } catch (error: any) {
      toast({
        title: "Error al generar póliza",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsGeneratingJournal(false);
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
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">Libro de Compras</h1>
            <SaveStatusIndicator status={saveStatus} />
          </div>
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
                    {existingJournalEntry.exists && journalType === "mes" && (
                      <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-600 dark:text-amber-400 text-sm">
                        <AlertCircle className="h-4 w-4 flex-shrink-0" />
                        <span>Ya existe una póliza consolidada para {monthNames[selectedMonth - 1]} {selectedYear}</span>
                      </div>
                    )}
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
                    
                    {existingJournalEntry.exists && journalType === "mes" ? (
                      <div className="flex gap-2">
                        <Button 
                          variant="destructive"
                          className="flex-1" 
                          onClick={() => generatePurchaseJournalEntry(true)}
                          disabled={isGeneratingJournal}
                        >
                          {isGeneratingJournal ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Reemplazando...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Reemplazar Póliza
                            </>
                          )}
                        </Button>
                      </div>
                    ) : (
                      <Button 
                        className="w-full" 
                        onClick={() => generatePurchaseJournalEntry(false)}
                        disabled={isGeneratingJournal}
                      >
                        {isGeneratingJournal ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Generando...
                          </>
                        ) : (
                          "Generar"
                        )}
                      </Button>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button onClick={addNewRow} size="sm">
                      <Plus className="h-4 w-4 mr-1" />
                      Nueva Factura
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Alt+N</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
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
            <div className="space-y-2">
              {purchases.map((purchase, index) => (
                <PurchaseCard
                  key={purchase.id || `new-${index}`}
                  ref={index === purchases.length - 1 ? newCardRef : undefined}
                  purchase={purchase}
                  index={index}
                  felDocTypes={felDocTypes}
                  operationTypes={operationTypes}
                  expenseAccounts={expenseAccounts}
                  bankAccounts={bankAccounts}
                  onUpdate={updateRow}
                  onSave={(idx) => {
                    saveRow(idx);
                    // Clear isNew flag after save
                    if (purchases[idx].isNew) {
                      const updated = [...purchases];
                      updated[idx] = { ...updated[idx], isNew: false };
                      setPurchases(updated);
                    }
                  }}
                  onDelete={deleteRow}
                  recommendedFields={purchase.isNew ? purchase._recommendedFields || [] : []}
                  isEditing={editingIndex === index}
                  onStartEdit={(idx) => setEditingIndex(idx)}
                  onCancelEdit={() => setEditingIndex(null)}
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
        enterpriseNit={enterpriseNit}
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
