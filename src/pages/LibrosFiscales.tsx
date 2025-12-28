import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileText, Upload, Plus, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PurchaseCard } from "@/components/compras/PurchaseCard";
import { SalesCard } from "@/components/ventas/SalesCard";
import { ImportPurchasesDialog } from "@/components/compras/ImportPurchasesDialog";
import { ImportSalesDialog } from "@/components/ventas/ImportSalesDialog";
import { InvoiceSearchDialog } from "@/components/search/InvoiceSearchDialog";
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
  operation_type_id: number | null;
  expense_account_id: number | null;
  bank_account_id: number | null;
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
  operation_type_id: number | null;
  income_account_id: number | null;
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
  const [showJournalDialog, setShowJournalDialog] = useState(false);
  const [showSearchDialog, setShowSearchDialog] = useState(false);
  const [highlightedInvoiceId, setHighlightedInvoiceId] = useState<number | null>(null);
  const [journalType, setJournalType] = useState<"mes" | "banco" | "documento">("mes");
  
  // Estados para listas de cuentas
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
  const [incomeAccounts, setIncomeAccounts] = useState<Array<{
    id: number;
    account_code: string;
    account_name: string;
  }>>([]);
  
  const [operationTypes, setOperationTypes] = useState<Array<{
    id: number;
    code: string;
    name: string;
  }>>([]);
  
  // Estados para memoria de última cuenta usada
  const [lastExpenseAccountId, setLastExpenseAccountId] = useState<number | null>(null);
  const [lastBankAccountId, setLastBankAccountId] = useState<number | null>(null);
  const [lastIncomeAccountId, setLastIncomeAccountId] = useState<number | null>(null);
  
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

  // Resumen de compras por Tipo de Operación
  const purchasesByOperationType = useMemo(() => {
    const grouped = purchases.reduce((acc, purchase) => {
      const opType = operationTypes.find(ot => ot.id === purchase.operation_type_id);
      if (!opType) return acc;
      
      const key = opType.name;
      if (!acc[key]) {
        acc[key] = { name: opType.name, total: 0, count: 0 };
      }
      acc[key].total += Number(purchase.base_amount) || 0;
      acc[key].count += 1;
      return acc;
    }, {} as Record<string, { name: string; total: number; count: number }>);
    
    return Object.values(grouped)
      .map(item => ({
        ...item,
        total: formatCurrency(item.total)
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [purchases, operationTypes]);

  // Resumen de compras por Tipo de Documento
  const purchasesByDocType = useMemo(() => {
    const grouped = purchases.reduce((acc, purchase) => {
      const docType = purchase.fel_document_type || 'SIN TIPO';
      if (!acc[docType]) {
        acc[docType] = { type: docType, total: 0, count: 0 };
      }
      acc[docType].total += Number(purchase.base_amount) || 0;
      acc[docType].count += 1;
      return acc;
    }, {} as Record<string, { type: string; total: number; count: number }>);
    
    return Object.values(grouped)
      .map(item => ({
        ...item,
        total: formatCurrency(item.total)
      }))
      .sort((a, b) => a.type.localeCompare(b.type));
  }, [purchases]);

  // Resumen de ventas por Tipo de Operación
  const salesByOperationType = useMemo(() => {
    const grouped = sales.reduce((acc, sale) => {
      const opType = operationTypes.find(ot => ot.id === sale.operation_type_id);
      if (!opType) return acc;
      
      const key = opType.name;
      if (!acc[key]) {
        acc[key] = { name: opType.name, total: 0, count: 0 };
      }
      acc[key].total += Number(sale.net_amount) || 0;
      acc[key].count += 1;
      return acc;
    }, {} as Record<string, { name: string; total: number; count: number }>);
    
    return Object.values(grouped)
      .map(item => ({
        ...item,
        total: formatCurrency(item.total)
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sales, operationTypes]);

  // Resumen de ventas por Tipo de Documento
  const salesByDocType = useMemo(() => {
    const grouped = sales.reduce((acc, sale) => {
      const docType = sale.fel_document_type || 'SIN TIPO';
      if (!acc[docType]) {
        acc[docType] = { type: docType, total: 0, count: 0 };
      }
      acc[docType].total += Number(sale.net_amount) || 0;
      acc[docType].count += 1;
      return acc;
    }, {} as Record<string, { type: string; total: number; count: number }>);
    
    return Object.values(grouped)
      .map(item => ({
        ...item,
        total: formatCurrency(item.total)
      }))
      .sort((a, b) => a.type.localeCompare(b.type));
  }, [sales]);

  useEffect(() => {
    const enterpriseId = localStorage.getItem("currentEnterpriseId");
    setCurrentEnterpriseId(enterpriseId);
    
    if (enterpriseId) {
      fetchFELDocTypes();
      fetchAccounts(enterpriseId);
      fetchOrCreateBook(enterpriseId, selectedMonth, selectedYear);
      fetchSales(enterpriseId, selectedMonth, selectedYear);
      
      // Cargar última cuenta usada desde localStorage
      const savedExpense = localStorage.getItem(`lastExpenseAccount_${enterpriseId}`);
      const savedBank = localStorage.getItem(`lastBankAccount_${enterpriseId}`);
      const savedIncome = localStorage.getItem(`lastIncomeAccount_${enterpriseId}`);
      
      if (savedExpense) setLastExpenseAccountId(parseInt(savedExpense));
      if (savedBank) setLastBankAccountId(parseInt(savedBank));
      if (savedIncome) setLastIncomeAccountId(parseInt(savedIncome));
    } else {
      setLoading(false);
    }

    const handleStorageChange = () => {
      const newEnterpriseId = localStorage.getItem("currentEnterpriseId");
      setCurrentEnterpriseId(newEnterpriseId);
      if (newEnterpriseId) {
        fetchFELDocTypes();
        fetchAccounts(newEnterpriseId);
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
      fetchAccounts(currentEnterpriseId);
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

  const fetchAccounts = async (enterpriseId: string) => {
    try {
      // Cuentas que permiten movimientos (para gastos/ingresos)
      const { data: movementAccounts, error: movementError } = await supabase
        .from("tab_accounts")
        .select("id, account_code, account_name")
        .eq("enterprise_id", parseInt(enterpriseId))
        .eq("allows_movement", true)
        .eq("is_active", true)
        .order("account_code");

      if (movementError) throw movementError;

      // Separar por tipo de cuenta
      // Gastos/Compras: Cuentas que empiezan con 5 (Gastos) o 6 (Costos)
      const expenses = movementAccounts?.filter(acc => 
        acc.account_code.startsWith('5') || acc.account_code.startsWith('6')
      ) || [];

      // Ingresos: Cuentas que empiezan con 4 (Ingresos)
      const incomes = movementAccounts?.filter(acc => 
        acc.account_code.startsWith('4')
      ) || [];

      setExpenseAccounts(expenses);
      setIncomeAccounts(incomes);

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
      operation_type_id: null,
      expense_account_id: lastExpenseAccountId,
      bank_account_id: lastBankAccountId,
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
      operation_type_id: null,
      income_account_id: lastIncomeAccountId,
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
        expense_account_id: entry.expense_account_id,
        bank_account_id: entry.bank_account_id,
        operation_type_id: entry.operation_type_id,
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

        // Guardar última cuenta usada
        if (entry.expense_account_id) {
          setLastExpenseAccountId(entry.expense_account_id);
          localStorage.setItem(`lastExpenseAccount_${currentEnterpriseId}`, entry.expense_account_id.toString());
        }
        if (entry.bank_account_id) {
          setLastBankAccountId(entry.bank_account_id);
          localStorage.setItem(`lastBankAccount_${currentEnterpriseId}`, entry.bank_account_id.toString());
        }

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

        // Guardar última cuenta usada
        if (entry.expense_account_id) {
          setLastExpenseAccountId(entry.expense_account_id);
          localStorage.setItem(`lastExpenseAccount_${currentEnterpriseId}`, entry.expense_account_id.toString());
        }
        if (entry.bank_account_id) {
          setLastBankAccountId(entry.bank_account_id);
          localStorage.setItem(`lastBankAccount_${currentEnterpriseId}`, entry.bank_account_id.toString());
        }

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
        income_account_id: entry.income_account_id,
        operation_type_id: entry.operation_type_id,
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

        // Guardar última cuenta usada
        if (entry.income_account_id) {
          setLastIncomeAccountId(entry.income_account_id);
          localStorage.setItem(`lastIncomeAccount_${currentEnterpriseId}`, entry.income_account_id.toString());
        }

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

        // Guardar última cuenta usada
        if (entry.income_account_id) {
          setLastIncomeAccountId(entry.income_account_id);
          localStorage.setItem(`lastIncomeAccount_${currentEnterpriseId}`, entry.income_account_id.toString());
        }

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
    <div className="p-8">
      {/* Header Sticky - contiene título, selectores, tabs, resúmenes y botones */}
      <div className="sticky top-0 z-10 bg-background pb-4 space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold">{activeTab === "compras" ? "Compras" : "Ventas"}</h1>
            <p className="text-muted-foreground">Registro de {activeTab === "compras" ? "compras" : "ventas"}</p>
          </div>
          <div className="flex gap-4 items-end">
            <Button 
              variant="outline" 
              size="icon"
              onClick={() => setShowSearchDialog(true)}
              title="Buscar factura"
            >
              <Search className="h-4 w-4" />
            </Button>
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
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="compras">Libro de Compras</TabsTrigger>
            <TabsTrigger value="ventas">Libro de Ventas</TabsTrigger>
          </TabsList>

          <TabsContent value="compras" className="space-y-2 mt-4">
            <div className="space-y-2">
              {/* Resumen principal */}
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
                  <Button variant="outline" size="sm" onClick={() => setShowJournalDialog(true)}>
                    <FileText className="h-4 w-4 mr-2" />
                    Generar Póliza
                  </Button>
                  <Button size="sm" onClick={addNewPurchase}>
                    <Plus className="h-4 w-4 mr-2" />
                    Nueva Factura
                  </Button>
                </div>
              </div>
              
              {/* Resumen por Tipo de Operación */}
              {purchasesByOperationType.length > 0 && (
                <div className="flex gap-6 text-sm text-muted-foreground">
                  <span className="font-medium">Por Operación:</span>
                  {purchasesByOperationType.map(op => (
                    <div key={op.name}>
                      <span>{op.name}: </span>
                      <span className="font-semibold text-foreground">Q {op.total} ({op.count})</span>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Resumen por Tipo de Documento */}
              {purchasesByDocType.length > 0 && (
                <div className="flex gap-6 text-sm text-muted-foreground">
                  <span className="font-medium">Por Documento:</span>
                  {purchasesByDocType.map(doc => (
                    <div key={doc.type}>
                      <span>{doc.type}: </span>
                      <span className="font-semibold text-foreground">Q {doc.total} ({doc.count})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="ventas" className="space-y-2 mt-4">
            <div className="space-y-2">
              {/* Resumen principal */}
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
                  <Button variant="outline" size="sm" onClick={() => setShowJournalDialog(true)}>
                    <FileText className="h-4 w-4 mr-2" />
                    Generar Póliza
                  </Button>
                  <Button size="sm" onClick={addNewSale}>
                    <Plus className="h-4 w-4 mr-2" />
                    Nueva Factura
                  </Button>
                </div>
              </div>
              
              {/* Resumen por Tipo de Operación */}
              {salesByOperationType.length > 0 && (
                <div className="flex gap-6 text-sm text-muted-foreground">
                  <span className="font-medium">Por Operación:</span>
                  {salesByOperationType.map(op => (
                    <div key={op.name}>
                      <span>{op.name}: </span>
                      <span className="font-semibold text-foreground">Q {op.total} ({op.count})</span>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Resumen por Tipo de Documento */}
              {salesByDocType.length > 0 && (
                <div className="flex gap-6 text-sm text-muted-foreground">
                  <span className="font-medium">Por Documento:</span>
                  {salesByDocType.map(doc => (
                    <div key={doc.type}>
                      <span>{doc.type}: </span>
                      <span className="font-semibold text-foreground">Q {doc.total} ({doc.count})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Área scrollable con las facturas */}
      <div className="mt-4">
        <Card>
          <CardContent className="pt-6">
            {activeTab === "compras" ? (
              loading ? (
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
                      operationTypes={operationTypes}
                      expenseAccounts={expenseAccounts}
                      bankAccounts={bankAccounts}
                      onUpdate={updatePurchaseRow}
                      onSave={savePurchaseRow}
                      onDelete={deletePurchaseRow}
                      isHighlighted={highlightedInvoiceId === purchase.id}
                    />
                  ))}
                </div>
              )
            ) : (
              loading ? (
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
                      operationTypes={operationTypes}
                      incomeAccounts={incomeAccounts}
                      onUpdate={updateSaleRow}
                      onSave={saveSaleRow}
                      onDelete={deleteSaleRow}
                      isHighlighted={highlightedInvoiceId === sale.id}
                    />
                  ))}
                </div>
              )
            )}
          </CardContent>
        </Card>
      </div>

      {/* Diálogo de Generar Póliza */}
      <Dialog open={showJournalDialog} onOpenChange={setShowJournalDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generar Póliza Contable</DialogTitle>
            <DialogDescription>
              Selecciona el tipo de póliza a generar para {activeTab === "compras" ? "compras" : "ventas"}
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
                  {activeTab === "compras" && <SelectItem value="banco">Póliza por Banco</SelectItem>}
                  <SelectItem value="documento">Póliza por Documento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="bg-muted p-4 rounded-lg space-y-1 text-sm">
              {activeTab === "compras" ? (
                <>
                  <p><strong>Documentos:</strong> {purchaseTotals.documentCount}</p>
                  <p><strong>Base:</strong> Q {purchaseTotals.totalBase}</p>
                  <p><strong>IVA:</strong> Q {purchaseTotals.totalVAT}</p>
                  <p><strong>Total:</strong> Q {purchaseTotals.totalWithVAT}</p>
                </>
              ) : (
                <>
                  <p><strong>Documentos:</strong> {salesTotals.documentCount}</p>
                  <p><strong>Neto:</strong> Q {salesTotals.totalNet}</p>
                  <p><strong>IVA:</strong> Q {salesTotals.totalVAT}</p>
                  <p><strong>Total:</strong> Q {salesTotals.totalWithVAT}</p>
                </>
              )}
            </div>
            <Button 
              className="w-full" 
              onClick={async () => {
                try {
                  if (!currentEnterpriseId || (activeTab === "compras" && !currentBookId)) {
                    toast({
                      title: "Error",
                      description: "No se puede generar la póliza",
                      variant: "destructive",
                    });
                    return;
                  }

                  // Validar que todas las facturas tengan cuenta asignada
                  if (activeTab === "compras") {
                    const withoutAccount = purchases.filter(p => !p.expense_account_id);
                    if (withoutAccount.length > 0) {
                      toast({
                        title: "Documentos sin cuenta",
                        description: `Hay ${withoutAccount.length} documentos sin cuenta contable asignada`,
                        variant: "destructive",
                      });
                      return;
                    }
                  } else {
                    const withoutAccount = sales.filter(s => !s.income_account_id);
                    if (withoutAccount.length > 0) {
                      toast({
                        title: "Documentos sin cuenta",
                        description: `Hay ${withoutAccount.length} documentos sin cuenta contable asignada`,
                        variant: "destructive",
                      });
                      return;
                    }
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

                  if (activeTab === "compras") {
                    // Lógica de pólizas de COMPRAS
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
                          total_debit: parseFloat(purchaseTotals.totalWithVAT.replace(/,/g, '')),
                          total_credit: parseFloat(purchaseTotals.totalWithVAT.replace(/,/g, '')),
                          is_posted: false,
                          created_by: user.id,
                        })
                        .select()
                        .single();

                      if (journalError) throw journalError;

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

                    if (currentBookId) await fetchPurchases(currentBookId);
                  } else {
                    // Lógica de pólizas de VENTAS
                    if (journalType === "mes") {
                      // Póliza consolidada del mes
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
                          total_debit: parseFloat(salesTotals.totalWithVAT.replace(/,/g, '')),
                          total_credit: parseFloat(salesTotals.totalWithVAT.replace(/,/g, '')),
                          is_posted: false,
                          created_by: user.id,
                        })
                        .select()
                        .single();

                      if (journalError) throw journalError;

                      const saleIds = sales.filter(s => s.id).map(s => s.id);
                      if (saleIds.length > 0) {
                        await supabase
                          .from("tab_sales_ledger")
                          .update({ journal_entry_id: journalEntry.id })
                          .in("id", saleIds);
                      }

                      toast({
                        title: "Póliza generada",
                        description: `Póliza ${entryNumber} creada en borrador`,
                      });
                    } else {
                      // Póliza por documento
                      for (const s of sales) {
                        if (!s.id) continue;
                        
                        const entryNumber = `VENT-DOC-${s.invoice_series}-${s.invoice_number}`;
                        const { data: journalEntry, error: journalError } = await supabase
                          .from("tab_journal_entries")
                          .insert({
                            enterprise_id: parseInt(currentEnterpriseId),
                            accounting_period_id: period.id,
                            entry_number: entryNumber,
                            entry_date: s.invoice_date,
                            entry_type: "diario",
                            description: `Venta ${s.customer_name}`,
                            total_debit: s.total_amount,
                            total_credit: s.total_amount,
                            is_posted: false,
                            created_by: user.id,
                          })
                          .select()
                          .single();

                        if (journalError) throw journalError;

                        await supabase
                          .from("tab_sales_ledger")
                          .update({ journal_entry_id: journalEntry.id })
                          .eq("id", s.id);
                      }

                      toast({
                        title: "Pólizas generadas",
                        description: `${sales.length} pólizas creadas en borrador`,
                      });
                    }

                    if (currentEnterpriseId) await fetchSales(currentEnterpriseId, selectedMonth, selectedYear);
                  }

                  setShowJournalDialog(false);
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

      {activeTab === "compras" && currentEnterpriseId && (
        <ImportPurchasesDialog
          open={showImportDialog}
          onOpenChange={setShowImportDialog}
          enterpriseId={parseInt(currentEnterpriseId)}
          onSuccess={() => {
            if (currentEnterpriseId) fetchOrCreateBook(currentEnterpriseId, selectedMonth, selectedYear);
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

      {currentEnterpriseId && (
        <InvoiceSearchDialog
          isOpen={showSearchDialog}
          onClose={() => setShowSearchDialog(false)}
          enterpriseId={currentEnterpriseId}
          onSelectInvoice={(month, year, tab, invoiceId) => {
            setSelectedMonth(month);
            setSelectedYear(year);
            setActiveTab(tab);
            setHighlightedInvoiceId(invoiceId);
            // Clear highlight after 3 seconds
            setTimeout(() => setHighlightedInvoiceId(null), 3000);
          }}
        />
      )}
    </div>
  );
}
