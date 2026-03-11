import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileText, Upload, Plus, Search, Loader2, AlertCircle, RefreshCw, BarChart3 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PurchaseCard, type PurchaseCardRef } from "@/components/compras/PurchaseCard";
import { SalesCard, type SalesCardRef } from "@/components/ventas/SalesCard";
import { ImportPurchasesDialog } from "@/components/compras/ImportPurchasesDialog";
import { ImportSalesDialog } from "@/components/ventas/ImportSalesDialog";
import { InvoiceSearchDialog } from "@/components/search/InvoiceSearchDialog";
import { SaveStatusIndicator, type SaveStatus } from "@/components/ui/save-status-indicator";
import { useToast } from "@/hooks/use-toast";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { formatCurrency } from "@/lib/utils";
import { LedgerStatsModal } from "@/components/estadisticas/LedgerStatsModal";


interface FELDocumentType {
  id: number;
  code: string;
  name: string;
  applies_vat: boolean;
  affects_total: number;
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
  idp_amount: number;
  batch_reference: string;
  operation_type_id: number | null;
  expense_account_id: number | null;
  bank_account_id: number | null;
  journal_entry_id: number | null;
  purchase_book_id?: number;
  isNew?: boolean;
  _recommendedFields?: string[];
}

interface SaleEntry {
  id?: number;
  client_id: string;
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
  is_annulled?: boolean;
  isNew?: boolean;
  establishment_code?: string | null;
  establishment_name?: string | null;
  _recommendedFields?: string[];
}

export default function LibrosFiscales() {
  const [purchases, setPurchases] = useState<PurchaseEntry[]>([]);
  const [sales, setSales] = useState<SaleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasDataRef = useRef(false);
  const [currentEnterpriseId, setCurrentEnterpriseId] = useState<string | null>(null);
  const [enterpriseNit, setEnterpriseNit] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const selectedMonthRef = useRef(selectedMonth);
  const selectedYearRef = useRef(selectedYear);
  const [felDocTypes, setFelDocTypes] = useState<FELDocumentType[]>([]);
  const [currentBookId, setCurrentBookId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"compras" | "ventas">("compras");
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showJournalDialog, setShowJournalDialog] = useState(false);
  const [showSearchDialog, setShowSearchDialog] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showNitTester, setShowNitTester] = useState(false);
  const [highlightedInvoiceId, setHighlightedInvoiceId] = useState<number | null>(null);
  const [journalType, setJournalType] = useState<"mes" | "banco" | "documento">("mes");
  const [isGeneratingJournal, setIsGeneratingJournal] = useState(false);
  const [existingSalesJournalEntry, setExistingSalesJournalEntry] = useState<{ exists: boolean; id?: number }>({ exists: false });
  const [existingPurchasesJournalEntry, setExistingPurchasesJournalEntry] = useState<{ exists: boolean; id?: number }>({ exists: false });
  
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
  const [lastPurchaseOperationTypeId, setLastPurchaseOperationTypeId] = useState<number | null>(null);
  const [lastSaleOperationTypeId, setLastSaleOperationTypeId] = useState<number | null>(null);

  // Inline-edit state + focus management
  const [editingPurchaseIndex, setEditingPurchaseIndex] = useState<number | null>(null);
  const [editingSaleIndex, setEditingSaleIndex] = useState<number | null>(null);
  const [pendingFocusTab, setPendingFocusTab] = useState<null | "compras" | "ventas">(null);
  const purchaseEditRef = useRef<PurchaseCardRef>(null);
  const saleEditRef = useRef<SalesCardRef>(null);

  // Keep latest arrays available to async callbacks (prevents stale-closure on first auto-save)
  const purchasesRef = useRef<PurchaseEntry[]>([]);
  const salesRef = useRef<SaleEntry[]>([]);
  useEffect(() => {
    purchasesRef.current = purchases;
  }, [purchases]);
  useEffect(() => {
    salesRef.current = sales;
  }, [sales]);

  // Save status indicator state
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const saveStatusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // Read URL params from global search navigation
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    const monthParam = searchParams.get("month");
    const yearParam = searchParams.get("year");
    const highlightParam = searchParams.get("highlight");

    let changed = false;
    if (tabParam === "compras" || tabParam === "ventas") {
      setActiveTab(tabParam);
      changed = true;
    }
    if (monthParam) {
      const m = parseInt(monthParam);
      if (!isNaN(m) && m >= 1 && m <= 12) { setSelectedMonth(m); changed = true; }
    }
    if (yearParam) {
      const y = parseInt(yearParam);
      if (!isNaN(y)) { setSelectedYear(y); changed = true; }
    }
    if (highlightParam) {
      const hId = parseInt(highlightParam);
      if (!isNaN(hId)) {
        setHighlightedInvoiceId(hId);
        changed = true;
        // Clear highlight after 3 seconds
        setTimeout(() => setHighlightedInvoiceId(null), 3000);
      }
    }
    if (changed) {
      // Clean up URL params
      setSearchParams({}, { replace: true });
    }
  }, []);

  const monthNames = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];

  useEffect(() => {
    selectedMonthRef.current = selectedMonth;
    selectedYearRef.current = selectedYear;
  }, [selectedMonth, selectedYear]);

  const purchaseTotals = useMemo(() => {
    // Calculate totals considering affects_total from document type
    const totalWithVAT = purchases.reduce((sum, p) => {
      const docType = felDocTypes.find(dt => dt.code === p.fel_document_type);
      const multiplier = docType?.affects_total ?? 1;
      return sum + ((Number(p.total_amount) || 0) * multiplier);
    }, 0);
    
    const totalVAT = purchases.reduce((sum, p) => {
      const docType = felDocTypes.find(dt => dt.code === p.fel_document_type);
      const multiplier = docType?.affects_total ?? 1;
      return sum + ((Number(p.vat_amount) || 0) * multiplier);
    }, 0);
    
    const totalBase = purchases.reduce((sum, p) => {
      const docType = felDocTypes.find(dt => dt.code === p.fel_document_type);
      const multiplier = docType?.affects_total ?? 1;
      return sum + ((Number(p.base_amount) || 0) * multiplier);
    }, 0);
    
    return {
      totalWithVAT: formatCurrency(totalWithVAT),
      totalVAT: formatCurrency(totalVAT),
      totalBase: formatCurrency(totalBase),
      documentCount: purchases.length,
    };
  }, [purchases, felDocTypes]);

  const salesTotals = useMemo(() => {
    const activeSales = sales.filter(s => !s.is_annulled);
    const annulledSales = sales.filter(s => s.is_annulled);
    
    // Calculate totals considering affects_total from document type
    const totalWithVAT = activeSales.reduce((sum, s) => {
      const docType = felDocTypes.find(dt => dt.code === s.fel_document_type);
      const multiplier = docType?.affects_total ?? 1;
      return sum + ((Number(s.total_amount) || 0) * multiplier);
    }, 0);
    
    const totalVAT = activeSales.reduce((sum, s) => {
      const docType = felDocTypes.find(dt => dt.code === s.fel_document_type);
      const multiplier = docType?.affects_total ?? 1;
      return sum + ((Number(s.vat_amount) || 0) * multiplier);
    }, 0);
    
    const totalNet = activeSales.reduce((sum, s) => {
      const docType = felDocTypes.find(dt => dt.code === s.fel_document_type);
      const multiplier = docType?.affects_total ?? 1;
      return sum + ((Number(s.net_amount) || 0) * multiplier);
    }, 0);
    
    return {
      totalWithVAT: formatCurrency(totalWithVAT),
      totalVAT: formatCurrency(totalVAT),
      totalNet: formatCurrency(totalNet),
      documentCount: sales.length,
      activeCount: activeSales.length,
      annulledCount: annulledSales.length,
    };
  }, [sales, felDocTypes]);

  // Resumen de compras por Tipo de Operación (aplicando affects_total)
  const purchasesByOperationType = useMemo(() => {
    const grouped = purchases.reduce((acc, purchase) => {
      const opType = operationTypes.find(ot => ot.id === purchase.operation_type_id);
      if (!opType) return acc;
      
      const docType = felDocTypes.find(dt => dt.code === purchase.fel_document_type);
      const multiplier = docType?.affects_total ?? 1;
      
      const key = opType.name;
      if (!acc[key]) {
        acc[key] = { name: opType.name, total: 0, count: 0 };
      }
      acc[key].total += (Number(purchase.base_amount) || 0) * multiplier;
      acc[key].count += 1;
      return acc;
    }, {} as Record<string, { name: string; total: number; count: number }>);
    
    return Object.values(grouped)
      .map(item => ({
        ...item,
        total: formatCurrency(item.total)
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [purchases, operationTypes, felDocTypes]);

  // Resumen de compras por Tipo de Documento (aplicando affects_total)
  const purchasesByDocType = useMemo(() => {
    const grouped = purchases.reduce((acc, purchase) => {
      const docType = purchase.fel_document_type || 'SIN TIPO';
      const felDoc = felDocTypes.find(dt => dt.code === purchase.fel_document_type);
      const multiplier = felDoc?.affects_total ?? 1;
      
      if (!acc[docType]) {
        acc[docType] = { type: docType, total: 0, count: 0 };
      }
      acc[docType].total += (Number(purchase.base_amount) || 0) * multiplier;
      acc[docType].count += 1;
      return acc;
    }, {} as Record<string, { type: string; total: number; count: number }>);
    
    return Object.values(grouped)
      .map(item => ({
        ...item,
        total: formatCurrency(item.total)
      }))
      .sort((a, b) => a.type.localeCompare(b.type));
  }, [purchases, felDocTypes]);

  // Resumen de ventas por Tipo de Operación (aplicando affects_total)
  const salesByOperationType = useMemo(() => {
    const activeSales = sales.filter(s => !s.is_annulled);
    const grouped = activeSales.reduce((acc, sale) => {
      const opType = operationTypes.find(ot => ot.id === sale.operation_type_id);
      if (!opType) return acc;
      
      const docType = felDocTypes.find(dt => dt.code === sale.fel_document_type);
      const multiplier = docType?.affects_total ?? 1;
      
      const key = opType.name;
      if (!acc[key]) {
        acc[key] = { name: opType.name, total: 0, count: 0 };
      }
      acc[key].total += (Number(sale.net_amount) || 0) * multiplier;
      acc[key].count += 1;
      return acc;
    }, {} as Record<string, { name: string; total: number; count: number }>);
    
    return Object.values(grouped)
      .map(item => ({
        ...item,
        total: formatCurrency(item.total)
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sales, operationTypes, felDocTypes]);

  // Resumen de ventas por Tipo de Documento (aplicando affects_total)
  const salesByDocType = useMemo(() => {
    const activeSales = sales.filter(s => !s.is_annulled);
    const grouped = activeSales.reduce((acc, sale) => {
      const docType = sale.fel_document_type || 'SIN TIPO';
      const felDoc = felDocTypes.find(dt => dt.code === sale.fel_document_type);
      const multiplier = felDoc?.affects_total ?? 1;
      
      if (!acc[docType]) {
        acc[docType] = { type: docType, total: 0, count: 0 };
      }
      acc[docType].total += (Number(sale.net_amount) || 0) * multiplier;
      acc[docType].count += 1;
      return acc;
    }, {} as Record<string, { type: string; total: number; count: number }>);
    
    return Object.values(grouped)
      .map(item => ({
        ...item,
        total: formatCurrency(item.total)
      }))
      .sort((a, b) => a.type.localeCompare(b.type));
  }, [sales, felDocTypes]);

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
      fetchOrCreateBook(enterpriseId, selectedMonthRef.current, selectedYearRef.current);
      fetchSales(enterpriseId, selectedMonthRef.current, selectedYearRef.current);
      fetchEnterpriseNit(enterpriseId);
      
      // Cargar última cuenta usada desde localStorage
      const savedExpense = localStorage.getItem(`lastExpenseAccount_${enterpriseId}`);
      const savedBank = localStorage.getItem(`lastBankAccount_${enterpriseId}`);
      const savedIncome = localStorage.getItem(`lastIncomeAccount_${enterpriseId}`);
      
      if (savedExpense) setLastExpenseAccountId(parseInt(savedExpense));
      if (savedBank) setLastBankAccountId(parseInt(savedBank));
      if (savedIncome) setLastIncomeAccountId(parseInt(savedIncome));
      const savedPurchaseOpType = localStorage.getItem(`lastOperationType_purchases_${enterpriseId}`);
      const savedSaleOpType = localStorage.getItem(`lastOperationType_sales_${enterpriseId}`);
      if (savedPurchaseOpType) setLastPurchaseOperationTypeId(parseInt(savedPurchaseOpType));
      if (savedSaleOpType) setLastSaleOperationTypeId(parseInt(savedSaleOpType));
    } else {
      setLoading(false);
    }

    const handleStorageChange = async (event?: StorageEvent | Event) => {
      // Ignorar cambios de otras keys (ej. refresh de sesión) que antes disparaban recargas con mes/año obsoletos
      if (event instanceof StorageEvent && event.key && event.key !== "currentEnterpriseId") {
        return;
      }

      const newEnterpriseId = localStorage.getItem("currentEnterpriseId");
      setCurrentEnterpriseId(newEnterpriseId);
      if (newEnterpriseId) {
        const month = selectedMonthRef.current;
        const year = selectedYearRef.current;
        fetchFELDocTypes();
        fetchAccounts(newEnterpriseId);
        fetchOrCreateBook(newEnterpriseId, month, year);
        fetchSales(newEnterpriseId, month, year);
        const { data } = await supabase
          .from("tab_enterprises")
          .select("nit")
          .eq("id", parseInt(newEnterpriseId))
          .single();
        if (data) setEnterpriseNit(data.nit);
      } else {
        setPurchases([]);
        setSales([]);
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

  // Throttled visibility-change: only refetch if data is older than 60 seconds
  const lastFetchTimestamp = useRef<number>(Date.now());
  const REFETCH_THROTTLE_MS = 60_000; // 60 seconds

  const handleManualRefresh = useCallback(() => {
    const eid = localStorage.getItem("currentEnterpriseId");
    if (!eid) return;
    lastFetchTimestamp.current = Date.now();
    setIsRefreshing(true);
    fetchOrCreateBook(eid, selectedMonthRef.current, selectedYearRef.current);
    fetchSales(eid, selectedMonthRef.current, selectedYearRef.current);
  }, []);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return;
      const eid = localStorage.getItem("currentEnterpriseId");
      if (!eid) return;

      // Throttle: skip if data was fetched less than 60s ago
      const elapsed = Date.now() - lastFetchTimestamp.current;
      if (elapsed < REFETCH_THROTTLE_MS) return;

      // Refresh the auth session first to avoid stale-token empty results
      try {
        await supabase.auth.getSession();
      } catch (_) {
        // ignore — autoRefreshToken will handle it
      }

      lastFetchTimestamp.current = Date.now();
      // Silently refetch WITHOUT clearing existing data (no setLoading(true))
      const month = selectedMonthRef.current;
      const year = selectedYearRef.current;
      try {
        const { data: book } = await supabase
          .from("tab_purchase_books")
          .select("id")
          .eq("enterprise_id", parseInt(eid))
          .eq("month", month)
          .eq("year", year)
          .maybeSingle();
        if (book) {
          const { data: freshPurchases } = await supabase
            .from("tab_purchase_ledger")
            .select("*")
            .eq("purchase_book_id", book.id)
            .order("invoice_date", { ascending: false })
            .order("invoice_number", { ascending: false });
          if (freshPurchases) setPurchases(freshPurchases);
        }
      } catch (_) { /* silent */ }

      try {
        const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
        const endDate = new Date(year, month, 0).toISOString().split('T')[0];
        const { data: freshSales } = await supabase
          .from("tab_sales_ledger")
          .select("*")
          .eq("enterprise_id", parseInt(eid))
          .gte("invoice_date", startDate)
          .lte("invoice_date", endDate)
          .order("invoice_date", { ascending: false })
          .order("invoice_number", { ascending: false });
        if (freshSales) {
          setSales(freshSales.map((row: any) => ({ ...row, client_id: `db-${row.id}` })));
        }
      } catch (_) { /* silent */ }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (currentEnterpriseId) {
      lastFetchTimestamp.current = Date.now();
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
      // Gastos/Compras: Cuentas que empiezan con 5 (Gastos), 6 (Costos) o 7 (Gastos/Costos de operación)
      const expenses = movementAccounts?.filter(acc =>
        acc.account_code.startsWith('5') || acc.account_code.startsWith('6') || acc.account_code.startsWith('7')
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
      // Only show full loading placeholder on first load (no cached data)
      if (!hasDataRef.current) {
        setLoading(true);
      } else {
        setIsRefreshing(true);
      }
      
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
      hasDataRef.current = true;
    } catch (error: any) {
      toast({
        title: "Error al cargar libro",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
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
      setSales((data || []).map((row: any) => ({
        ...row,
        client_id: `db-${row.id}`,
      })));

      // Verificar pólizas existentes para ventas y compras
      await checkExistingJournalEntries(enterpriseId, month, year);
    } catch (error: any) {
      toast({
        title: "Error al cargar facturas de venta",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const checkExistingJournalEntries = async (enterpriseId: string, month: number, year: number) => {
    try {
      const salesEntryNumber = `VENT-${year}-${String(month).padStart(2, '0')}`;
      const purchasesEntryNumber = `COMP-${year}-${String(month).padStart(2, '0')}`;

      const { data: salesEntry } = await supabase
        .from("tab_journal_entries")
        .select("id")
        .eq("enterprise_id", parseInt(enterpriseId))
        .eq("entry_number", salesEntryNumber)
        .maybeSingle();

      const { data: purchasesEntry } = await supabase
        .from("tab_journal_entries")
        .select("id")
        .eq("enterprise_id", parseInt(enterpriseId))
        .eq("entry_number", purchasesEntryNumber)
        .maybeSingle();

      setExistingSalesJournalEntry({ exists: !!salesEntry, id: salesEntry?.id });
      setExistingPurchasesJournalEntry({ exists: !!purchasesEntry, id: purchasesEntry?.id });
    } catch (error) {
      console.error("Error checking existing journal entries:", error);
    }
  };

  const deleteExistingJournalEntry = async (journalEntryId: number, ledgerType: 'purchases' | 'sales') => {
    // Primero eliminar detalles
    await supabase
      .from("tab_journal_entry_details")
      .delete()
      .eq("journal_entry_id", journalEntryId);

    // Limpiar referencias en el libro correspondiente
    if (ledgerType === 'purchases') {
      await supabase
        .from("tab_purchase_ledger")
        .update({ journal_entry_id: null })
        .eq("journal_entry_id", journalEntryId);
    } else {
      await supabase
        .from("tab_sales_ledger")
        .update({ journal_entry_id: null })
        .eq("journal_entry_id", journalEntryId);
    }

    // Eliminar póliza
    await supabase
      .from("tab_journal_entries")
      .delete()
      .eq("id", journalEntryId);
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

  // Guard ref to prevent multiple rapid shortcut presses
  const isCreatingNewRef = useRef(false);

  const createPurchaseEntry = useCallback(() => {
    const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
    const defaultDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const recommendedList: string[] = ['invoice_date', 'fel_document_type'];
    if (lastExpenseAccountId) recommendedList.push('expense_account_id');
    if (lastBankAccountId) recommendedList.push('bank_account_id');
    if (lastPurchaseOperationTypeId) recommendedList.push('operation_type_id');

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
      idp_amount: 0,
      batch_reference: "",
      operation_type_id: lastPurchaseOperationTypeId,
      expense_account_id: lastExpenseAccountId,
      bank_account_id: lastBankAccountId,
      journal_entry_id: null,
      isNew: true,
      _recommendedFields: recommendedList,
    };
    setPurchases((prev) => {
      const updated = [newEntry, ...prev];
      purchasesRef.current = updated;
      return updated;
    });
    setEditingPurchaseIndex(0);
    setPendingFocusTab("compras");
  }, [selectedYear, selectedMonth, felDocTypes, lastExpenseAccountId, lastBankAccountId, lastPurchaseOperationTypeId]);

  const createSaleEntry = useCallback(() => {
    const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
    const defaultDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const recommendedList: string[] = ['invoice_date', 'fel_document_type'];
    if (lastIncomeAccountId) recommendedList.push('income_account_id');
    if (lastSaleOperationTypeId) recommendedList.push('operation_type_id');

    const newEntry: SaleEntry = {
      client_id: `tmp-${crypto.randomUUID()}`,
      invoice_series: "",
      invoice_number: "",
      invoice_date: defaultDate,
      fel_document_type: felDocTypes[0]?.code || "",
      customer_nit: "",
      customer_name: "",
      total_amount: 0,
      vat_amount: 0,
      net_amount: 0,
      operation_type_id: lastSaleOperationTypeId,
      income_account_id: lastIncomeAccountId,
      journal_entry_id: null,
      isNew: true,
      _recommendedFields: recommendedList,
    };
    setSales((prev) => {
      const updated = [newEntry, ...prev];
      salesRef.current = updated;
      return updated;
    });
    setEditingSaleIndex(0);
    setPendingFocusTab("ventas");
  }, [selectedYear, selectedMonth, felDocTypes, lastIncomeAccountId, lastSaleOperationTypeId]);

  // Save current record first, then create new one
  const addNewPurchase = useCallback(async () => {
    if (isCreatingNewRef.current) return;
    isCreatingNewRef.current = true;

    try {
      // If there's a record being edited, save it first
      if (editingPurchaseIndex !== null && purchasesRef.current[editingPurchaseIndex]) {
        await savePurchaseRow(editingPurchaseIndex);
      }
      // Now create the new entry
      createPurchaseEntry();
    } finally {
      isCreatingNewRef.current = false;
    }
  }, [editingPurchaseIndex, createPurchaseEntry]);

  const addNewSale = useCallback(async () => {
    if (isCreatingNewRef.current) return;
    isCreatingNewRef.current = true;

    try {
      // If there's a record being edited, save it first
      if (editingSaleIndex !== null && salesRef.current[editingSaleIndex]) {
        const entry = salesRef.current[editingSaleIndex];
        if (entry.client_id) {
          await saveSaleRow(entry.client_id);
        }
      }
      // Now create the new entry
      createSaleEntry();
    } finally {
      isCreatingNewRef.current = false;
    }
  }, [editingSaleIndex, createSaleEntry]);

  // Focus the edited/new row once it exists in the DOM
  useEffect(() => {
    if (!pendingFocusTab) return;
    const t = window.setTimeout(() => {
      if (pendingFocusTab === "compras") {
        purchaseEditRef.current?.focusDateField();
      } else {
        saleEditRef.current?.focusDateField();
      }
      setPendingFocusTab(null);
    }, 120);
    return () => window.clearTimeout(t);
  }, [pendingFocusTab, purchases.length, sales.length]);

  // Keyboard shortcut: Alt+N -> new invoice on current tab (replaces deprecated Ctrl+Alt++)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || e.key.toLowerCase() !== "n") return;
      e.preventDefault();
      if (activeTab === "compras") addNewPurchase();
      else addNewSale();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTab, addNewPurchase, addNewSale]);

  const updatePurchaseRow = (index: number, field: keyof PurchaseEntry, value: any) => {
    setPurchases((prev) => {
      const updated = [...prev];
      if (!updated[index]) return prev;
      updated[index] = { ...updated[index], [field]: value };

      if (field === "total_amount" || field === "fel_document_type" || field === "idp_amount") {
        const currentTotal = Number(updated[index].total_amount) || 0;
        const nextTotal = field === "total_amount" ? parseFloat(value) || 0 : currentTotal;
        const nextDoc = field === "fel_document_type" ? value : updated[index].fel_document_type;
        const idp = field === "idp_amount" ? (parseFloat(value) || 0) : (updated[index].idp_amount || 0);
        // For fuel: subtract IDP before VAT calculation
        const taxableTotal = nextTotal - idp;
        const { base, vat } = calculateVAT(taxableTotal, nextDoc);
        updated[index].base_amount = base;
        updated[index].vat_amount = vat;
      }

      // IMPORTANT: keep ref in sync immediately to avoid stale-closure saves
      purchasesRef.current = updated;
      return updated;
    });
  };

  const updateSaleRow = (index: number, field: keyof SaleEntry, value: any) => {
    setSales((prev) => {
      const updated = [...prev];
      if (!updated[index]) return prev;
      updated[index] = { ...updated[index], [field]: value };

      if (field === "total_amount" || field === "fel_document_type") {
        const currentTotal = Number(updated[index].total_amount) || 0;
        const nextTotal = field === "total_amount" ? parseFloat(value) || 0 : currentTotal;
        const nextDoc = field === "fel_document_type" ? value : updated[index].fel_document_type;
        const { base, vat } = calculateVAT(nextTotal, nextDoc);
        updated[index].net_amount = base;
        updated[index].vat_amount = vat;
      }

      // IMPORTANT: keep ref in sync immediately to avoid stale-closure saves
      salesRef.current = updated;
      return updated;
    });
  };

  const savePurchaseRow = async (index: number) => {
    const entry = purchasesRef.current[index];
    if (!currentBookId || !currentEnterpriseId) return;
    if (!entry) return;

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

    // Start save indicator
    setSaveStatus("saving");
    if (saveStatusTimeoutRef.current) {
      clearTimeout(saveStatusTimeoutRef.current);
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
        idp_amount: entry.idp_amount || 0,
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

        setPurchases((prev) => {
          const updated = [...prev];
          if (!updated[index]) return prev;
          updated[index] = { ...data, isNew: false };
          return updated;
        });

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
          setLastPurchaseOperationTypeId(entry.operation_type_id);
          localStorage.setItem(`lastOperationType_purchases_${currentEnterpriseId}`, entry.operation_type_id.toString());
        }
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
        if (entry.operation_type_id) {
          setLastPurchaseOperationTypeId(entry.operation_type_id);
          localStorage.setItem(`lastOperationType_purchases_${currentEnterpriseId}`, entry.operation_type_id.toString());
        }
      }

      // Show saved indicator and auto-hide after 3 seconds
      setSaveStatus("saved");
      saveStatusTimeoutRef.current = setTimeout(() => {
        setSaveStatus("idle");
      }, 3000);
    } catch (error: any) {
      setSaveStatus("idle");
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

  const saveSaleRow = async (rowId: string) => {
    const index = salesRef.current.findIndex((s) => s.client_id === rowId);
    const entry = index >= 0 ? salesRef.current[index] : undefined;
    if (!currentEnterpriseId) return;
    if (!entry) return;

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

    // Start save indicator
    setSaveStatus("saving");
    if (saveStatusTimeoutRef.current) {
      clearTimeout(saveStatusTimeoutRef.current);
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

        setSales((prev) => {
          const updated = [...prev];
          const idx = updated.findIndex((s) => s.client_id === rowId);
          if (idx < 0) return prev;
          updated[idx] = { ...data, client_id: rowId, isNew: false };
          return updated;
        });

        // Guardar última cuenta usada
        if (entry.income_account_id) {
          setLastIncomeAccountId(entry.income_account_id);
          localStorage.setItem(`lastIncomeAccount_${currentEnterpriseId}`, entry.income_account_id.toString());
        }
        if (entry.operation_type_id) {
          setLastSaleOperationTypeId(entry.operation_type_id);
          localStorage.setItem(`lastOperationType_sales_${currentEnterpriseId}`, entry.operation_type_id.toString());
        }
      } else if (entry.id) {
        // DB-first merge guard:
        // Prevent stale UI state (e.g., during tab/month changes or rapid shortcuts)
        // from overwriting already-saved data with empty strings/nulls/zeros.
        const { data: fresh, error: freshError } = await supabase
          .from("tab_sales_ledger")
          .select(
            "invoice_series, invoice_number, invoice_date, fel_document_type, customer_nit, customer_name, total_amount, vat_amount, net_amount, income_account_id, operation_type_id"
          )
          .eq("id", entry.id)
          .maybeSingle();

        if (freshError) throw freshError;

        const safeUpdate = {
          ...entryData,
          // strings
          invoice_series: (entryData.invoice_series && String(entryData.invoice_series).trim() !== "")
            ? entryData.invoice_series
            : (fresh?.invoice_series ?? entryData.invoice_series),
          invoice_number: (entryData.invoice_number && String(entryData.invoice_number).trim() !== "")
            ? entryData.invoice_number
            : (fresh?.invoice_number ?? entryData.invoice_number),
          customer_nit: (entryData.customer_nit && String(entryData.customer_nit).trim() !== "")
            ? entryData.customer_nit
            : (fresh?.customer_nit ?? entryData.customer_nit),
          customer_name: (entryData.customer_name && String(entryData.customer_name).trim() !== "")
            ? entryData.customer_name
            : (fresh?.customer_name ?? entryData.customer_name),
          // nullable ids
          operation_type_id: entryData.operation_type_id ?? (fresh?.operation_type_id ?? null),
          income_account_id: entryData.income_account_id ?? (fresh?.income_account_id ?? null),
          // amounts: if UI is 0 but DB already has a value, keep DB
          total_amount:
            Number(entryData.total_amount) === 0 && Number(fresh?.total_amount ?? 0) !== 0
              ? Number(fresh?.total_amount)
              : entryData.total_amount,
          vat_amount:
            Number(entryData.vat_amount) === 0 && Number(fresh?.vat_amount ?? 0) !== 0
              ? Number(fresh?.vat_amount)
              : entryData.vat_amount,
          net_amount:
            Number(entryData.net_amount) === 0 && Number(fresh?.net_amount ?? 0) !== 0
              ? Number(fresh?.net_amount)
              : entryData.net_amount,
        };

        const { error } = await supabase
          .from("tab_sales_ledger")
          .update(safeUpdate)
          .eq("id", entry.id);

        if (error) throw error;

        // Guardar última cuenta usada
        if (entry.income_account_id) {
          setLastIncomeAccountId(entry.income_account_id);
          localStorage.setItem(`lastIncomeAccount_${currentEnterpriseId}`, entry.income_account_id.toString());
        }
        if (entry.operation_type_id) {
          setLastSaleOperationTypeId(entry.operation_type_id);
          localStorage.setItem(`lastOperationType_sales_${currentEnterpriseId}`, entry.operation_type_id.toString());
        }
      }

      // Show saved indicator and auto-hide after 3 seconds
      setSaveStatus("saved");
      saveStatusTimeoutRef.current = setTimeout(() => {
        setSaveStatus("idle");
      }, 3000);
    } catch (error: any) {
      setSaveStatus("idle");
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

  const toggleSaleAnnulled = async (index: number) => {
    const entry = sales[index];
    if (!entry.id) return;

    const newStatus = !entry.is_annulled;

    try {
      const { error } = await supabase
        .from("tab_sales_ledger")
        .update({ is_annulled: newStatus })
        .eq("id", entry.id);

      if (error) throw error;

      const updated = [...sales];
      updated[index] = { ...updated[index], is_annulled: newStatus };
      setSales(updated);

      toast({
        title: newStatus ? "Factura anulada" : "Factura reactivada",
        description: newStatus 
          ? "La factura fue marcada como anulada" 
          : "La factura fue reactivada correctamente",
      });
    } catch (error: any) {
      toast({
        title: "Error",
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
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">{activeTab === "compras" ? "Compras" : "Ventas"}</h1>
              <SaveStatusIndicator status={saveStatus} />
            </div>
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

        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            const tab = v as "compras" | "ventas";
            setActiveTab(tab);
            // reset edit state when switching tabs
            setEditingPurchaseIndex(null);
            setEditingSaleIndex(null);
          }}
        >
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
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" onClick={handleManualRefresh} disabled={isRefreshing}>
                          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p>Actualizar datos</p></TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Button variant="outline" size="sm" onClick={() => setShowStatsModal(true)}>
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Estadísticas
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowNitTester(true)}>
                    <Bug className="h-4 w-4 mr-2" />
                    Test NIT
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowImportDialog(true)}>
                    <Upload className="h-4 w-4 mr-2" />
                    Importar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowJournalDialog(true)}>
                    <FileText className="h-4 w-4 mr-2" />
                    Generar Póliza
                  </Button>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" onClick={addNewPurchase}>
                          <Plus className="h-4 w-4 mr-2" />
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
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Documentos: </span>
                    <Badge variant="secondary">{salesTotals.activeCount} activos</Badge>
                    {salesTotals.annulledCount > 0 && (
                      <Badge variant="destructive">{salesTotals.annulledCount} anulados</Badge>
                    )}
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
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" onClick={handleManualRefresh} disabled={isRefreshing}>
                          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p>Actualizar datos</p></TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Button variant="outline" size="sm" onClick={() => setShowStatsModal(true)}>
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Estadísticas
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowNitTester(true)}>
                    <Bug className="h-4 w-4 mr-2" />
                    Test NIT
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowImportDialog(true)}>
                    <Upload className="h-4 w-4 mr-2" />
                    Importar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowJournalDialog(true)}>
                    <FileText className="h-4 w-4 mr-2" />
                    Generar Póliza
                  </Button>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" onClick={addNewSale}>
                          <Plus className="h-4 w-4 mr-2" />
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
              loading && purchases.length === 0 ? (
                <p className="text-center text-muted-foreground">Cargando...</p>
              ) : purchases.length === 0 && !loading ? (
                <p className="text-center text-muted-foreground">No hay facturas registradas</p>
              ) : (
                <div className="space-y-2">
                  {purchases.map((purchase, index) => (
                    <PurchaseCard
                      key={purchase.id || `new-${index}`}
                      ref={editingPurchaseIndex === index ? purchaseEditRef : undefined}
                      purchase={purchase}
                      index={index}
                      felDocTypes={felDocTypes}
                      operationTypes={operationTypes}
                      expenseAccounts={expenseAccounts}
                      bankAccounts={bankAccounts}
                      onUpdate={updatePurchaseRow}
                      onSave={savePurchaseRow}
                      onDelete={deletePurchaseRow}
                      recommendedFields={purchase.isNew ? purchase._recommendedFields || [] : []}
                      isHighlighted={highlightedInvoiceId === purchase.id}
                      isEditing={editingPurchaseIndex === index}
                      onStartEdit={(idx) => {
                        setEditingPurchaseIndex(idx);
                        setPendingFocusTab("compras");
                      }}
                      onCancelEdit={() => setEditingPurchaseIndex(null)}
                    />
                  ))}
                </div>
              )
            ) : (
              loading && sales.length === 0 ? (
                <p className="text-center text-muted-foreground">Cargando...</p>
              ) : sales.length === 0 && !loading ? (
                <p className="text-center text-muted-foreground">No hay facturas registradas</p>
              ) : (
                <div className="space-y-2">
                  {sales.map((sale, index) => (
                    <SalesCard
                      key={sale.client_id}
                      ref={editingSaleIndex === index ? saleEditRef : undefined}
                      sale={sale}
                      index={index}
                      rowId={sale.client_id}
                      felDocTypes={felDocTypes}
                      operationTypes={operationTypes}
                      incomeAccounts={incomeAccounts}
                      onUpdate={updateSaleRow}
                      onSave={saveSaleRow}
                      onDelete={deleteSaleRow}
                      onToggleAnnulled={toggleSaleAnnulled}
                      recommendedFields={sale.isNew ? sale._recommendedFields || [] : []}
                      isHighlighted={highlightedInvoiceId === sale.id}
                      isEditing={editingSaleIndex === index}
                      onStartEdit={(idx) => {
                        setEditingSaleIndex(idx);
                        setPendingFocusTab("ventas");
                      }}
                      onCancelEdit={() => setEditingSaleIndex(null)}
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
            {((activeTab === "ventas" && existingSalesJournalEntry.exists) || 
              (activeTab === "compras" && existingPurchasesJournalEntry.exists)) && 
              journalType === "mes" && (
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
                  <p><strong>Documentos activos:</strong> {salesTotals.activeCount}</p>
                  {salesTotals.annulledCount > 0 && (
                    <p><strong>Documentos anulados:</strong> {salesTotals.annulledCount}</p>
                  )}
                  <p><strong>Neto:</strong> Q {salesTotals.totalNet}</p>
                  <p><strong>IVA:</strong> Q {salesTotals.totalVAT}</p>
                  <p><strong>Total:</strong> Q {salesTotals.totalWithVAT}</p>
                </>
              )}
            </div>
            {((activeTab === "ventas" && existingSalesJournalEntry.exists) || 
              (activeTab === "compras" && existingPurchasesJournalEntry.exists)) && 
              journalType === "mes" ? (
              <Button 
                variant="destructive"
                className="w-full" 
                disabled={isGeneratingJournal}
                onClick={async () => {
                  setIsGeneratingJournal(true);
                  try {
                    if (!currentEnterpriseId || (activeTab === "compras" && !currentBookId)) {
                      toast({
                        title: "Error",
                        description: "No se puede generar la póliza",
                        variant: "destructive",
                      });
                      return;
                    }

                    // Eliminar póliza existente primero
                    if (activeTab === "compras" && existingPurchasesJournalEntry.id) {
                      await deleteExistingJournalEntry(existingPurchasesJournalEntry.id, 'purchases');
                    } else if (activeTab === "ventas" && existingSalesJournalEntry.id) {
                      await deleteExistingJournalEntry(existingSalesJournalEntry.id, 'sales');
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
                      // Generar póliza de compras consolidada
                      const { data: enterpriseConfig } = await supabase
                        .from("tab_enterprise_config")
                        .select("vat_credit_account_id, suppliers_account_id")
                        .eq("enterprise_id", parseInt(currentEnterpriseId))
                        .maybeSingle();

                      const vatCreditAccountId = enterpriseConfig?.vat_credit_account_id;
                      const suppliersAccountId = enterpriseConfig?.suppliers_account_id;

                      const entryNumber = `COMP-${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
                      const { data: journalEntry, error: journalError } = await supabase
                        .from("tab_journal_entries")
                        .insert({
                          enterprise_id: parseInt(currentEnterpriseId),
                          accounting_period_id: period.id,
                          entry_number: entryNumber,
                          entry_date: `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(new Date(selectedYear, selectedMonth, 0).getDate()).padStart(2, '0')}`,
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

                      // Crear líneas de detalle
                      const detailLines: Array<{
                        journal_entry_id: number;
                        line_number: number;
                        account_id: number;
                        description: string;
                        debit_amount: number;
                        credit_amount: number;
                      }> = [];

                      let lineNumber = 1;
                      const expenseByAccount = new Map<number, number>();
                      let totalVAT = 0;
                      let totalAmount = 0;

                      for (const p of purchases) {
                        // Obtener multiplicador del tipo de documento (NCRE = -1)
                        const docType = felDocTypes.find(dt => dt.code === p.fel_document_type);
                        const multiplier = docType?.affects_total ?? 1;
                        
                        if (p.expense_account_id) {
                          // Respetar IVA real: si vat_amount es 0, la base es el total
                          const baseAmount = p.vat_amount > 0
                            ? (p.base_amount || p.total_amount - p.vat_amount)
                            : p.total_amount;
                          expenseByAccount.set(
                            p.expense_account_id,
                            (expenseByAccount.get(p.expense_account_id) || 0) + (baseAmount * multiplier)
                          );
                        }
                        // Usar IVA real con multiplicador, no recalcular
                        totalVAT += (p.vat_amount || 0) * multiplier;
                        totalAmount += p.total_amount * multiplier;
                      }

                      for (const [accountId, amount] of expenseByAccount) {
                        detailLines.push({
                          journal_entry_id: journalEntry.id,
                          line_number: lineNumber++,
                          account_id: accountId,
                          description: `Libro de Compras ${monthNames[selectedMonth - 1]} ${selectedYear}`,
                          debit_amount: parseFloat(amount.toFixed(2)),
                          credit_amount: 0,
                        });
                      }

                      if (vatCreditAccountId && totalVAT > 0) {
                        detailLines.push({
                          journal_entry_id: journalEntry.id,
                          line_number: lineNumber++,
                          account_id: vatCreditAccountId,
                          description: `Libro de Compras ${monthNames[selectedMonth - 1]} ${selectedYear}`,
                          debit_amount: parseFloat(totalVAT.toFixed(2)),
                          credit_amount: 0,
                        });
                      }

                      const creditAccountId = suppliersAccountId || bankAccounts[0]?.id;
                      if (creditAccountId) {
                        detailLines.push({
                          journal_entry_id: journalEntry.id,
                          line_number: lineNumber++,
                          account_id: creditAccountId,
                          description: `Libro de Compras ${monthNames[selectedMonth - 1]} ${selectedYear}`,
                          debit_amount: 0,
                          credit_amount: parseFloat(totalAmount.toFixed(2)),
                        });
                      }

                      if (detailLines.length > 0) {
                        await supabase.from("tab_journal_entry_details").insert(detailLines);
                      }

                      const purchaseIds = purchases.filter(p => p.id).map(p => p.id);
                      if (purchaseIds.length > 0) {
                        await supabase.from("tab_purchase_ledger")
                          .update({ journal_entry_id: journalEntry.id })
                          .in("id", purchaseIds);
                      }

                      if (currentBookId) await fetchPurchases(currentBookId);

                      toast({
                        title: "Póliza reemplazada",
                        description: `Póliza ${entryNumber} creada con ${detailLines.length} líneas de detalle`,
                      });
                    } else {
                      // Generar póliza de ventas consolidada
                      const { data: enterpriseConfig } = await supabase
                        .from("tab_enterprise_config")
                        .select("vat_debit_account_id, customers_account_id")
                        .eq("enterprise_id", parseInt(currentEnterpriseId))
                        .maybeSingle();

                      const vatDebitAccountId = enterpriseConfig?.vat_debit_account_id;
                      const customersAccountId = enterpriseConfig?.customers_account_id;

                      const { data: cashAccounts } = await supabase
                        .from("tab_accounts")
                        .select("id")
                        .eq("enterprise_id", parseInt(currentEnterpriseId))
                        .eq("allows_movement", true)
                        .eq("is_active", true)
                        .like("account_code", "1%")
                        .order("account_code")
                        .limit(1);

                      const cashAccountId = customersAccountId || (cashAccounts?.[0]?.id ?? null);

                      const entryNumber = `VENT-${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;

                      const validSales = sales.filter(s => !s.is_annulled);

                      // Totales aplicando multiplicador (NCRE = -1) y usando montos reales almacenados
                      const totalAmount = validSales.reduce((sum, s) => {
                        const docType = felDocTypes.find(dt => dt.code === s.fel_document_type);
                        const multiplier = docType?.affects_total ?? 1;
                        return sum + ((Number(s.total_amount) || 0) * multiplier);
                      }, 0);

                      const { data: journalEntry, error: journalError } = await supabase
                        .from("tab_journal_entries")
                        .insert({
                          enterprise_id: parseInt(currentEnterpriseId),
                          accounting_period_id: period.id,
                          entry_number: entryNumber,
                          entry_date: `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(new Date(selectedYear, selectedMonth, 0).getDate()).padStart(2, '0')}`,
                          entry_type: "diario",
                          description: `Libro de Ventas ${monthNames[selectedMonth - 1]} ${selectedYear}`,
                          total_debit: totalAmount,
                          total_credit: totalAmount,
                          is_posted: false,
                          created_by: user.id,
                        })
                        .select()
                        .single();

                      if (journalError) throw journalError;

                      // Crear líneas de detalle
                      const detailLines: Array<{
                        journal_entry_id: number;
                        line_number: number;
                        account_id: number;
                        description: string;
                        debit_amount: number;
                        credit_amount: number;
                      }> = [];

                      let lineNumber = 1;
                      const accountTotals = new Map<number, number>();
                      let totalVAT = 0;

                      for (const s of validSales) {
                        const docType = felDocTypes.find(dt => dt.code === s.fel_document_type);
                        const multiplier = docType?.affects_total ?? 1;

                        const vat = (Number(s.vat_amount) || 0) * multiplier;
                        const net = (Number(s.net_amount) || 0) * multiplier;

                        totalVAT += vat;

                        if (!s.income_account_id) continue;
                        accountTotals.set(
                          s.income_account_id,
                          (accountTotals.get(s.income_account_id) || 0) + net
                        );
                      }

                      if (cashAccountId) {
                        detailLines.push({
                          journal_entry_id: journalEntry.id,
                          line_number: lineNumber++,
                          account_id: cashAccountId,
                          description: `Libro de Ventas ${monthNames[selectedMonth - 1]} ${selectedYear}`,
                          debit_amount: parseFloat(totalAmount.toFixed(2)),
                          credit_amount: 0,
                        });
                      }

                      for (const [accountId, netTotal] of accountTotals) {
                        detailLines.push({
                          journal_entry_id: journalEntry.id,
                          line_number: lineNumber++,
                          account_id: accountId,
                          description: `Libro de Ventas ${monthNames[selectedMonth - 1]} ${selectedYear}`,
                          debit_amount: 0,
                          credit_amount: parseFloat(netTotal.toFixed(2)),
                        });
                      }

                      if (vatDebitAccountId && totalVAT !== 0) {
                        detailLines.push({
                          journal_entry_id: journalEntry.id,
                          line_number: lineNumber++,
                          account_id: vatDebitAccountId,
                          description: `Libro de Ventas ${monthNames[selectedMonth - 1]} ${selectedYear}`,
                          debit_amount: 0,
                          credit_amount: parseFloat(totalVAT.toFixed(2)),
                        });
                      }

                      if (detailLines.length > 0) {
                        await supabase.from("tab_journal_entry_details").insert(detailLines);
                      }

                      const saleIds = validSales.filter(s => s.id).map(s => s.id);
                      if (saleIds.length > 0) {
                        await supabase.from("tab_sales_ledger")
                          .update({ journal_entry_id: journalEntry.id })
                          .in("id", saleIds);
                      }

                      await fetchSales(currentEnterpriseId, selectedMonth, selectedYear);

                      toast({
                        title: "Póliza reemplazada",
                        description: `Póliza ${entryNumber} creada con ${detailLines.length} líneas de detalle`,
                      });
                    }

                    // Actualizar estado de pólizas existentes
                    await checkExistingJournalEntries(currentEnterpriseId, selectedMonth, selectedYear);
                    setShowJournalDialog(false);
                  } catch (error: any) {
                    toast({
                      title: "Error al reemplazar póliza",
                      description: getSafeErrorMessage(error),
                      variant: "destructive",
                    });
                  } finally {
                    setIsGeneratingJournal(false);
                  }
                }}
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
            ) : (
              <Button 
                className="w-full" 
                disabled={isGeneratingJournal}
                onClick={async () => {
                  setIsGeneratingJournal(true);
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
                      // Obtener configuración de empresa para cuentas de IVA
                      const { data: enterpriseConfig } = await supabase
                        .from("tab_enterprise_config")
                        .select("vat_credit_account_id, suppliers_account_id")
                        .eq("enterprise_id", parseInt(currentEnterpriseId))
                        .maybeSingle();

                      const vatCreditAccountId = enterpriseConfig?.vat_credit_account_id;
                      const suppliersAccountId = enterpriseConfig?.suppliers_account_id;

                      // Función auxiliar para crear líneas de detalle de compras
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
                          // Obtener multiplicador del tipo de documento (NCRE = -1)
                          const docType = felDocTypes.find(dt => dt.code === p.fel_document_type);
                          const multiplier = docType?.affects_total ?? 1;
                          
                          if (p.expense_account_id) {
                            // Respetar IVA real: si vat_amount es 0, la base es el total
                            const baseAmount = p.vat_amount > 0
                              ? (p.base_amount || p.total_amount - p.vat_amount)
                              : p.total_amount;
                            expenseByAccount.set(
                              p.expense_account_id,
                              (expenseByAccount.get(p.expense_account_id) || 0) + (baseAmount * multiplier)
                            );
                          }
                          // Usar IVA real con multiplicador, no recalcular
                          totalVAT += (p.vat_amount || 0) * multiplier;
                          totalAmount += p.total_amount * multiplier;
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
                            entry_date: `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(new Date(selectedYear, selectedMonth, 0).getDate()).padStart(2, '0')}`,
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

                        // Crear líneas de detalle
                        const linesCreated = await createPurchaseDetailLines(
                          journalEntry.id,
                          purchases,
                          `Libro de Compras ${monthNames[selectedMonth - 1]} ${selectedYear}`
                        );

                        const purchaseIds = purchases.filter(p => p.id).map(p => p.id);
                        if (purchaseIds.length > 0) {
                          await supabase
                            .from("tab_purchase_ledger")
                            .update({ journal_entry_id: journalEntry.id })
                            .in("id", purchaseIds);
                        }

                        toast({
                          title: "Póliza generada",
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

                        let totalLines = 0;
                        for (const [ref, items] of Object.entries(byBank)) {
                          const total = items.reduce((sum, p) => sum + p.total_amount, 0);
                          const entryNumber = `COMP-BANCO-${ref}-${selectedYear}${String(selectedMonth).padStart(2, '0')}`;
                          
                          const { data: journalEntry, error: journalError } = await supabase
                            .from("tab_journal_entries")
                            .insert({
                              enterprise_id: parseInt(currentEnterpriseId),
                              accounting_period_id: period.id,
                              entry_number: entryNumber,
                              entry_date: `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(new Date(selectedYear, selectedMonth, 0).getDate()).padStart(2, '0')}`,
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

                          // Crear líneas de detalle
                          const linesCreated = await createPurchaseDetailLines(
                            journalEntry.id,
                            items,
                            `Compras Ref. ${ref}`
                          );
                          totalLines += linesCreated;

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
                          description: `${Object.keys(byBank).length} pólizas creadas con ${totalLines} líneas de detalle`,
                        });
                      } else {
                        // Póliza por documento
                        let totalLines = 0;
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

                          // Crear líneas de detalle
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

                      if (currentBookId) await fetchPurchases(currentBookId);
                    } else {
                      // Obtener configuración de empresa para cuenta de IVA Débito
                      const { data: enterpriseConfig } = await supabase
                        .from("tab_enterprise_config")
                        .select("vat_debit_account_id, customers_account_id")
                        .eq("enterprise_id", parseInt(currentEnterpriseId))
                        .maybeSingle();

                      const vatDebitAccountId = enterpriseConfig?.vat_debit_account_id;
                      const customersAccountId = enterpriseConfig?.customers_account_id;

                      // Cuenta de Caja/Bancos (activo, código 1xx) como fallback
                      const { data: cashAccounts, error: cashError } = await supabase
                        .from("tab_accounts")
                        .select("id")
                        .eq("enterprise_id", parseInt(currentEnterpriseId))
                        .eq("allows_movement", true)
                        .eq("is_active", true)
                        .like("account_code", "1%")
                        .order("account_code")
                        .limit(1);

                      if (cashError) throw cashError;
                      const cashAccountId = customersAccountId || (cashAccounts?.[0]?.id ?? null);

                      // Lógica de pólizas de VENTAS
                      if (journalType === "mes") {
                        // Póliza consolidada del mes
                        const entryNumber = `VENT-${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;

                        // Filtrar facturas anuladas y calcular totales con multiplicador affects_total
                        const validSales = sales.filter(s => !s.is_annulled);
                        
                        // Agrupar por cuenta de ingreso y calcular totales aplicando multiplicador
                        const accountTotals = new Map<number, number>();
                        let totalVAT = 0;
                        let totalAmount = 0;

                        for (const s of validSales) {
                          // Obtener multiplicador del tipo de documento (NCRE = -1)
                          const docType = felDocTypes.find(dt => dt.code === s.fel_document_type);
                          const multiplier = docType?.affects_total ?? 1;
                          
                          const amount = (Number(s.total_amount) || 0) * multiplier;
                          const vat = (Number(s.vat_amount) || 0) * multiplier;
                          const net = (Number(s.net_amount) || 0) * multiplier;
                          
                          totalAmount += amount;
                          totalVAT += vat;
                          
                          if (s.income_account_id) {
                            accountTotals.set(
                              s.income_account_id,
                              (accountTotals.get(s.income_account_id) || 0) + net
                            );
                          }
                        }

                        const { data: journalEntry, error: journalError } = await supabase
                          .from("tab_journal_entries")
                          .insert({
                            enterprise_id: parseInt(currentEnterpriseId),
                            accounting_period_id: period.id,
                            entry_number: entryNumber,
                            entry_date: `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(new Date(selectedYear, selectedMonth, 0).getDate()).padStart(2, '0')}`,
                            entry_type: "diario",
                            description: `Libro de Ventas ${monthNames[selectedMonth - 1]} ${selectedYear}`,
                            total_debit: parseFloat(totalAmount.toFixed(2)),
                            total_credit: parseFloat(totalAmount.toFixed(2)),
                            is_posted: false,
                            created_by: user.id,
                          })
                          .select()
                          .single();

                        if (journalError) throw journalError;

                        const detailLines: Array<{
                          journal_entry_id: number;
                          line_number: number;
                          account_id: number;
                          description: string;
                          debit_amount: number;
                          credit_amount: number;
                        }> = [];

                        let lineNumber = 1;

                        // Débito: Caja/Clientes
                        if (cashAccountId) {
                          detailLines.push({
                            journal_entry_id: journalEntry.id,
                            line_number: lineNumber++,
                            account_id: cashAccountId,
                            description: `Libro de Ventas ${monthNames[selectedMonth - 1]} ${selectedYear}`,
                            debit_amount: parseFloat(totalAmount.toFixed(2)),
                            credit_amount: 0,
                          });
                        }

                        // Créditos: Ingresos (neto, sin IVA)
                        for (const [accountId, netAmount] of accountTotals) {
                          if (netAmount !== 0) {
                            detailLines.push({
                              journal_entry_id: journalEntry.id,
                              line_number: lineNumber++,
                              account_id: accountId,
                              description: `Libro de Ventas ${monthNames[selectedMonth - 1]} ${selectedYear}`,
                              debit_amount: 0,
                              credit_amount: parseFloat(netAmount.toFixed(2)),
                            });
                          }
                        }

                        // Crédito: IVA Débito Fiscal
                        if (vatDebitAccountId && totalVAT !== 0) {
                          detailLines.push({
                            journal_entry_id: journalEntry.id,
                            line_number: lineNumber++,
                            account_id: vatDebitAccountId,
                            description: `Libro de Ventas ${monthNames[selectedMonth - 1]} ${selectedYear}`,
                            debit_amount: 0,
                            credit_amount: parseFloat(totalVAT.toFixed(2)),
                          });
                        }

                        if (detailLines.length > 0) {
                          const { error: detailError } = await supabase
                            .from("tab_journal_entry_details")
                            .insert(detailLines);
                          if (detailError) throw detailError;
                        }

                        // Marcar solo facturas válidas (no anuladas)
                        const saleIds = validSales.filter((s) => s.id).map((s) => s.id);
                        if (saleIds.length > 0) {
                          await supabase
                            .from("tab_sales_ledger")
                            .update({ journal_entry_id: journalEntry.id })
                            .in("id", saleIds);
                        }

                        toast({
                          title: "Póliza generada",
                          description: `Póliza ${entryNumber} creada con ${detailLines.length} líneas de detalle`,
                        });
                      } else {
                        // Póliza por documento - filtrar facturas anuladas
                        const validSalesForDoc = sales.filter(s => !s.is_annulled);
                        let totalEntries = 0;
                        let totalLines = 0;
                        for (const s of validSalesForDoc) {
                          if (!s.id) continue;

                          // Obtener multiplicador del tipo de documento (NCRE = -1)
                          const docType = felDocTypes.find(dt => dt.code === s.fel_document_type);
                          const multiplier = docType?.affects_total ?? 1;

                          const total = (Number(s.total_amount) || 0) * multiplier;
                          const vat = (Number(s.vat_amount) || 0) * multiplier;
                          const net = (Number(s.net_amount) || 0) * multiplier;

                          const entryNumber = `VENT-DOC-${s.invoice_series || 'S'}-${s.invoice_number}`;
                          const { data: journalEntry, error: journalError } = await supabase
                            .from("tab_journal_entries")
                            .insert({
                              enterprise_id: parseInt(currentEnterpriseId),
                              accounting_period_id: period.id,
                              entry_number: entryNumber,
                              entry_date: s.invoice_date,
                              entry_type: "diario",
                              description: `Venta ${s.customer_name}`,
                              total_debit: parseFloat(Math.abs(total).toFixed(2)),
                              total_credit: parseFloat(Math.abs(total).toFixed(2)),
                              is_posted: false,
                              created_by: user.id,
                            })
                            .select()
                            .single();

                          if (journalError) throw journalError;

                          const detailLines: Array<{
                            journal_entry_id: number;
                            line_number: number;
                            account_id: number;
                            description: string;
                            debit_amount: number;
                            credit_amount: number;
                          }> = [];

                          const description = `Venta ${s.customer_name}`;
                          let lineNumber = 1;

                          // Débito: Caja/Clientes
                          if (cashAccountId) {
                            detailLines.push({
                              journal_entry_id: journalEntry.id,
                              line_number: lineNumber++,
                              account_id: cashAccountId,
                              description,
                              debit_amount: parseFloat(total.toFixed(2)),
                              credit_amount: 0,
                            });
                          }

                          // Crédito: Ingreso (neto usando valor real, no recalculado)
                          if (s.income_account_id) {
                            detailLines.push({
                              journal_entry_id: journalEntry.id,
                              line_number: lineNumber++,
                              account_id: Number(s.income_account_id),
                              description,
                              debit_amount: 0,
                              credit_amount: parseFloat(net.toFixed(2)),
                            });
                          }

                          // Crédito: IVA Débito Fiscal
                          if (vatDebitAccountId && vat !== 0) {
                            detailLines.push({
                              journal_entry_id: journalEntry.id,
                              line_number: lineNumber++,
                              account_id: vatDebitAccountId,
                              description,
                              debit_amount: 0,
                              credit_amount: parseFloat(vat.toFixed(2)),
                            });
                          }

                          if (detailLines.length > 0) {
                            const { error: detailError } = await supabase
                              .from("tab_journal_entry_details")
                              .insert(detailLines);
                            if (detailError) throw detailError;
                          }

                          await supabase
                            .from("tab_sales_ledger")
                            .update({ journal_entry_id: journalEntry.id })
                            .eq("id", s.id);

                          totalEntries++;
                          totalLines += detailLines.length;
                        }

                        toast({
                          title: "Pólizas generadas",
                          description: `${totalEntries} pólizas creadas con ${totalLines} líneas de detalle`,
                        });
                      }

                      await fetchSales(currentEnterpriseId, selectedMonth, selectedYear);
                    }

                    // Actualizar estado de pólizas existentes
                    await checkExistingJournalEntries(currentEnterpriseId, selectedMonth, selectedYear);
                    setShowJournalDialog(false);
                  } catch (error: any) {
                    toast({
                      title: "Error al generar póliza",
                      description: getSafeErrorMessage(error),
                      variant: "destructive",
                    });
                  } finally {
                    setIsGeneratingJournal(false);
                  }
                }}
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

      {activeTab === "compras" && currentEnterpriseId && (
        <ImportPurchasesDialog
          open={showImportDialog}
          onOpenChange={setShowImportDialog}
          enterpriseId={parseInt(currentEnterpriseId)}
          enterpriseNit={enterpriseNit}
          onSuccess={() => {
            if (currentEnterpriseId) fetchOrCreateBook(currentEnterpriseId, selectedMonth, selectedYear);
          }}
          expenseAccounts={expenseAccounts}
          operationTypes={operationTypes}
        />
      )}

      {activeTab === "ventas" && currentEnterpriseId && (
        <ImportSalesDialog
          open={showImportDialog}
          onOpenChange={setShowImportDialog}
          enterpriseId={parseInt(currentEnterpriseId)}
          enterpriseNit={enterpriseNit}
          onSuccess={() => {
            if (currentEnterpriseId) fetchSales(currentEnterpriseId, selectedMonth, selectedYear);
          }}
          incomeAccounts={incomeAccounts}
          operationTypes={operationTypes}
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
      {currentEnterpriseId && (
        <LedgerStatsModal
          open={showStatsModal}
          onOpenChange={setShowStatsModal}
          enterpriseId={currentEnterpriseId}
          type={activeTab}
        />
      )}
      <NitLookupTester open={showNitTester} onOpenChange={setShowNitTester} />
    </div>
  );
}
