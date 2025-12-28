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
  operation_type_id: number | null;
  income_account_id: number | null;
  journal_entry_id: number | null;
  is_annulled?: boolean;
  isNew?: boolean;
}

export default function LibroVentas() {
  const [sales, setSales] = useState<SaleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentEnterpriseId, setCurrentEnterpriseId] = useState<string | null>(null);
  const [enterpriseNit, setEnterpriseNit] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [felDocTypes, setFelDocTypes] = useState<FELDocumentType[]>([]);
  const [showJournalDialog, setShowJournalDialog] = useState(false);
  const [journalType, setJournalType] = useState<"mes" | "documento">("mes");
  const [showImportDialog, setShowImportDialog] = useState(false);
  
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
  
  const [lastIncomeAccountId, setLastIncomeAccountId] = useState<number | null>(null);

  const { toast } = useToast();

  const totals = useMemo(() => {
    const totalWithVAT = sales.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);
    const totalVAT = sales.reduce((sum, s) => sum + (Number(s.vat_amount) || 0), 0);
    const totalNet = sales.reduce((sum, s) => sum + (Number(s.net_amount) || 0), 0);
    const documentCount = sales.length;

    // Calcular totales por tipo de documento
    const byDocType = sales.reduce((acc, s) => {
      const docType = s.fel_document_type || 'SIN_TIPO';
      if (!acc[docType]) {
        acc[docType] = { total: 0, count: 0 };
      }
      acc[docType].total += Number(s.total_amount) || 0;
      acc[docType].count += 1;
      return acc;
    }, {} as Record<string, { total: number; count: number }>);

    // Calcular totales por operación
    const byOperation = sales.reduce((acc, s) => {
      if (!s.operation_type_id) return acc;
      const opType = operationTypes.find(o => o.id === s.operation_type_id);
      if (!opType) return acc;
      const key = opType.code;
      if (!acc[key]) {
        acc[key] = { total: 0, count: 0 };
      }
      acc[key].total += Number(s.total_amount) || 0;
      acc[key].count += 1;
      return acc;
    }, {} as Record<string, { total: number; count: number }>);

    console.log('Sales Totals by DocType:', byDocType);
    console.log('Sales Totals by Operation:', byOperation);

    return {
      totalWithVAT: formatCurrency(totalWithVAT),
      totalVAT: formatCurrency(totalVAT),
      totalNet: formatCurrency(totalNet),
      documentCount,
      byDocType,
      byOperation,
    };
  }, [sales, operationTypes]);

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
      fetchSales(enterpriseId, selectedMonth, selectedYear);
      fetchEnterpriseNit(enterpriseId);
      
      // Cargar última cuenta usada desde localStorage
      const savedIncome = localStorage.getItem(`lastIncomeAccount_${enterpriseId}`);
      if (savedIncome) setLastIncomeAccountId(parseInt(savedIncome));
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
        fetchSales(newEnterpriseId, selectedMonth, selectedYear);
        const { data } = await supabase
          .from("tab_enterprises")
          .select("nit")
          .eq("id", parseInt(newEnterpriseId))
          .single();
        if (data) setEnterpriseNit(data.nit);
      } else {
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

  const fetchAccounts = async (enterpriseId: string) => {
    try {
      // Cuentas que permiten movimientos (para ingresos)
      const { data: movementAccounts, error: movementError } = await supabase
        .from("tab_accounts")
        .select("id, account_code, account_name")
        .eq("enterprise_id", parseInt(enterpriseId))
        .eq("allows_movement", true)
        .eq("is_active", true)
        .order("account_code");

      if (movementError) throw movementError;

      // Ingresos: Cuentas que empiezan con 4 (Ingresos)
      const incomes = movementAccounts?.filter(acc => 
        acc.account_code.startsWith('4')
      ) || [];

      setIncomeAccounts(incomes);

      // Tipos de operación
      const { data: types, error: typesError } = await supabase
        .from("tab_operation_types")
        .select("id, code, name")
        .eq("is_active", true)
        .in("applies_to", ["sales", "both"])
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

  const fetchSales = async (enterpriseId: string, month: number, year: number) => {
    try {
      setLoading(true);
      
      const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];

      const data = await fetchAllRecords<any>(
        supabase
          .from("tab_sales_ledger")
          .select("*")
          .eq("enterprise_id", parseInt(enterpriseId))
          .gte("invoice_date", startDate)
          .lte("invoice_date", endDate)
          .order("invoice_date", { ascending: true })
          .order("invoice_number", { ascending: true })
      );
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
      operation_type_id: null,
      income_account_id: lastIncomeAccountId,
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

      // Buscar período contable que contenga la fecha de la factura
      console.log("Buscando período para fecha:", entry.invoice_date, "empresa:", currentEnterpriseId);
      
      const { data: periods, error: periodError } = await supabase
        .from('tab_accounting_periods')
        .select('id, status, start_date, end_date, year')
        .eq('enterprise_id', parseInt(currentEnterpriseId))
        .lte('start_date', entry.invoice_date)
        .gte('end_date', entry.invoice_date)
        .eq('status', 'abierto');

      console.log("Períodos encontrados:", periods, "Error:", periodError);

      if (periodError) throw periodError;
      
      if (!periods || periods.length === 0) {
        throw new Error(`No existe un período contable abierto que incluya la fecha ${entry.invoice_date}. Por favor, verifique los períodos contables en la vista de Empresas.`);
      }

      const period = periods[0];
      console.log("Usando período:", period.id, "para factura del", entry.invoice_date);

      const entryData = {
        enterprise_id: parseInt(currentEnterpriseId),
        accounting_period_id: period.id,
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
      
      // Guardar última cuenta usada
      if (entry.income_account_id) {
        setLastIncomeAccountId(entry.income_account_id);
        localStorage.setItem(`lastIncomeAccount_${currentEnterpriseId}`, entry.income_account_id.toString());
      }

      if (entry.isNew) {
        const { data, error } = await supabase
          .from("tab_sales_ledger")
          .insert(entryData)
          .select()
          .single();

        if (error) {
          console.error("Error detallado al insertar:", error);
          throw error;
        }

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
      if (error.message?.includes("período contable")) {
        errorMessage = error.message;
      } else if (error.message?.includes("fecha")) {
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

  const toggleAnnulled = async (index: number) => {
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

      // Validar que todas las facturas tengan cuenta asignada
      const withoutAccount = sales.filter(s => !s.income_account_id);
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
        const entryNumber = `VENT-${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
        
        // Calcular totales numéricos
        const totalAmount = sales.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);
        const totalVAT = sales.reduce((sum, s) => sum + (Number(s.vat_amount) || 0), 0);
        const totalNet = sales.reduce((sum, s) => sum + (Number(s.net_amount) || 0), 0);
        
        const { data: journalEntry, error: journalError } = await supabase
          .from("tab_journal_entries")
          .insert({
            enterprise_id: parseInt(currentEnterpriseId),
            accounting_period_id: period.id,
            entry_number: entryNumber,
            entry_date: new Date().toISOString().split('T')[0],
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

        // Crear líneas de detalle agrupando por cuenta
        const accountTotals = new Map<number, { debit: number; credit: number; name: string }>();
        
        // Agrupar ventas por cuenta de ingreso (créditos)
        for (const s of sales) {
          if (!s.income_account_id) continue;
          const current = accountTotals.get(s.income_account_id) || { debit: 0, credit: 0, name: '' };
          const account = incomeAccounts.find(a => a.id === s.income_account_id);
          current.credit += Number(s.total_amount) || 0;
          current.name = account ? `${account.account_code} - ${account.account_name}` : '';
          accountTotals.set(s.income_account_id, current);
        }

        // Buscar cuenta de Caja o Bancos (cuenta de activo - código que empiece con 1)
        const { data: cashAccounts, error: cashError } = await supabase
          .from("tab_accounts")
          .select("id, account_code, account_name")
          .eq("enterprise_id", parseInt(currentEnterpriseId))
          .eq("allows_movement", true)
          .eq("is_active", true)
          .like("account_code", "1%")
          .order("account_code")
          .limit(1);

        const cashAccountId = cashAccounts && cashAccounts.length > 0 ? cashAccounts[0].id : null;
        const cashAccountName = cashAccounts && cashAccounts.length > 0 
          ? `${cashAccounts[0].account_code} - ${cashAccounts[0].account_name}` 
          : 'Caja';

        // Crear las líneas de detalle
        const detailLines = [];
        let lineNumber = 1;

        // Línea de débito (Caja/Bancos) - total de ventas
        if (cashAccountId) {
          detailLines.push({
            journal_entry_id: journalEntry.id,
            line_number: lineNumber++,
            account_id: cashAccountId,
            description: `Libro de Ventas ${monthNames[selectedMonth - 1]} ${selectedYear}`,
            debit_amount: totalAmount,
            credit_amount: 0,
          });
        }

        // Líneas de crédito por cada cuenta de ingreso
        for (const [accountId, totals] of accountTotals) {
          detailLines.push({
            journal_entry_id: journalEntry.id,
            line_number: lineNumber++,
            account_id: accountId,
            description: `Libro de Ventas ${monthNames[selectedMonth - 1]} ${selectedYear}`,
            debit_amount: 0,
            credit_amount: totals.credit,
          });
        }

        // Insertar líneas de detalle
        if (detailLines.length > 0) {
          const { error: detailError } = await supabase
            .from("tab_journal_entry_details")
            .insert(detailLines);

          if (detailError) throw detailError;
        }

        // Marcar facturas con el journal_entry_id
        const saleIds = sales.filter(s => s.id).map(s => s.id);
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
        // Póliza por documento
        // Buscar cuenta de Caja o Bancos (cuenta de activo - código que empiece con 1)
        const { data: cashAccounts } = await supabase
          .from("tab_accounts")
          .select("id, account_code, account_name")
          .eq("enterprise_id", parseInt(currentEnterpriseId))
          .eq("allows_movement", true)
          .eq("is_active", true)
          .like("account_code", "1%")
          .order("account_code")
          .limit(1);

        const cashAccountId = cashAccounts && cashAccounts.length > 0 ? cashAccounts[0].id : null;

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

          // Crear líneas de detalle para esta póliza
          const detailLines = [];
          
          // Débito a Caja/Bancos
          if (cashAccountId) {
            detailLines.push({
              journal_entry_id: journalEntry.id,
              line_number: 1,
              account_id: cashAccountId,
              description: `Venta ${s.customer_name}`,
              debit_amount: s.total_amount,
              credit_amount: 0,
            });
          }

          // Crédito a cuenta de ingresos
          if (s.income_account_id) {
            detailLines.push({
              journal_entry_id: journalEntry.id,
              line_number: 2,
              account_id: s.income_account_id,
              description: `Venta ${s.customer_name}`,
              debit_amount: 0,
              credit_amount: s.total_amount,
            });
          }

          // Insertar líneas de detalle
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
        }

        toast({
          title: "Pólizas generadas",
          description: `${sales.length} pólizas creadas con líneas de detalle`,
        });
      }

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
          
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex gap-6">
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
                      <Select value={journalType} onValueChange={(v) => setJournalType(v as "mes" | "documento")}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mes">Póliza Consolidada</SelectItem>
                          <SelectItem value="documento">Póliza por Documento</SelectItem>
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
                  operationTypes={operationTypes}
                  incomeAccounts={incomeAccounts}
                  onUpdate={updateRow}
                  onSave={saveRow}
                  onDelete={deleteRow}
                  onToggleAnnulled={toggleAnnulled}
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
        enterpriseNit={enterpriseNit}
        onSuccess={() => {
          if (currentEnterpriseId) {
            fetchSales(currentEnterpriseId, selectedMonth, selectedYear);
          }
        }}
        incomeAccounts={incomeAccounts}
        operationTypes={operationTypes}
      />
    </div>
  );
}
