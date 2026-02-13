import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Calculator, FileText, Save } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { AccountCombobox, Account } from "@/components/ui/account-combobox";
import { Badge } from "@/components/ui/badge";
import { useEnterpriseConfig } from "@/hooks/useEnterpriseConfig";

interface DetailLine {
  id: string;
  account_id: number | null;
  description: string;
  bank_reference: string;
  cost_center: string;
  debit_amount: number;
  credit_amount: number;
}

interface LinkedPurchaseEntry {
  id: string;
  invoice_series: string;
  invoice_number: string;
  invoice_date: string;
  fel_document_type: string;
  supplier_nit: string;
  supplier_name: string;
  total_amount: number;
  base_amount: number;
  vat_amount: number;
  operation_type_id: number | null;
  expense_account_id: number | null;
}

interface LinkedPurchasesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryDate: string;
  documentReference: string;
  enterpriseId: number;
  onPurchasesPosted: (lines: DetailLine[]) => void;
}

interface OperationType {
  id: number;
  code: string;
  name: string;
}

interface FelDocumentType {
  code: string;
  name: string;
}

const VAT_RATE = 0.12;

export default function LinkedPurchasesModal({
  open,
  onOpenChange,
  entryDate,
  documentReference,
  enterpriseId,
  onPurchasesPosted,
}: LinkedPurchasesModalProps) {
  const [purchases, setPurchases] = useState<LinkedPurchaseEntry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [operationTypes, setOperationTypes] = useState<OperationType[]>([]);
  const [felDocTypes, setFelDocTypes] = useState<FelDocumentType[]>([]);
  const [loading, setLoading] = useState(false);
  
  const { toast } = useToast();
  const { config } = useEnterpriseConfig(enterpriseId);

  // Calcular mes/año basado en la fecha de la partida
  const entryMonth = entryDate ? new Date(entryDate + 'T00:00:00').getMonth() + 1 : new Date().getMonth() + 1;
  const entryYear = entryDate ? new Date(entryDate + 'T00:00:00').getFullYear() : new Date().getFullYear();
  const monthName = new Date(entryYear, entryMonth - 1).toLocaleString('es-GT', { month: 'long', year: 'numeric' });

  // Cargar datos iniciales
  useEffect(() => {
    if (open && enterpriseId) {
      loadAccounts();
      loadOperationTypes();
      loadFelDocTypes();
      // Agregar primera factura vacía
      if (purchases.length === 0) {
        addPurchase();
      }
    }
  }, [open, enterpriseId]);

  // Reset al cerrar
  useEffect(() => {
    if (!open) {
      setPurchases([]);
    }
  }, [open]);

  // Ctrl+Alt+"+" para guardar fila actual y crear nueva
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && (e.key === '+' || e.key === 'Add')) {
        e.preventDefault();
        // Validate last purchase has minimum data before adding new
        const lastPurchase = purchases[purchases.length - 1];
        if (lastPurchase && lastPurchase.supplier_nit.trim() && lastPurchase.total_amount > 0) {
          addPurchase();
          toast({
            title: "Nueva factura agregada",
            description: "Se agregó una nueva fila de factura",
          });
        } else {
          addPurchase();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, purchases]);

  const loadAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from("tab_accounts")
        .select("id, account_code, account_name")
        .eq("enterprise_id", enterpriseId)
        .eq("allows_movement", true)
        .eq("is_active", true)
        .order("account_code");

      if (error) throw error;
      setAccounts(data || []);
    } catch (error: any) {
      console.error("Error loading accounts:", error);
    }
  };

  const loadOperationTypes = async () => {
    try {
      const { data, error } = await supabase
        .from("tab_operation_types")
        .select("id, code, name")
        .eq("is_active", true)
        .or(`enterprise_id.eq.${enterpriseId},enterprise_id.is.null`)
        .eq("applies_to", "compras")
        .order("name");

      if (error) throw error;
      setOperationTypes(data || []);
    } catch (error: any) {
      console.error("Error loading operation types:", error);
    }
  };

  const loadFelDocTypes = async () => {
    try {
      const { data, error } = await supabase
        .from("tab_fel_document_types")
        .select("code, name")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      setFelDocTypes(data || []);
    } catch (error: any) {
      console.error("Error loading FEL doc types:", error);
    }
  };

  const createEmptyPurchase = (): LinkedPurchaseEntry => ({
    id: crypto.randomUUID(),
    invoice_series: "",
    invoice_number: "",
    invoice_date: entryDate || new Date().toISOString().split('T')[0],
    fel_document_type: "FACT",
    supplier_nit: "",
    supplier_name: "",
    total_amount: 0,
    base_amount: 0,
    vat_amount: 0,
    operation_type_id: null,
    expense_account_id: null,
  });

  const addPurchase = () => {
    setPurchases(prev => [...prev, createEmptyPurchase()]);
  };

  const removePurchase = (id: string) => {
    if (purchases.length <= 1) {
      toast({
        title: "Mínimo requerido",
        description: "Debe haber al menos una factura",
        variant: "destructive",
      });
      return;
    }
    setPurchases(prev => prev.filter(p => p.id !== id));
  };

  const updatePurchase = (id: string, field: keyof LinkedPurchaseEntry, value: any) => {
    setPurchases(prev => prev.map(p => {
      if (p.id !== id) return p;
      
      const updated = { ...p, [field]: value };
      
      // Auto-calcular base e IVA cuando cambia el total
      if (field === 'total_amount') {
        const total = Number(value) || 0;
        updated.base_amount = Number((total / (1 + VAT_RATE)).toFixed(2));
        updated.vat_amount = Number((total - updated.base_amount).toFixed(2));
      }
      
      return updated;
    }));
  };

  // Calcular totales
  const getTotals = useCallback(() => {
    return purchases.reduce((acc, p) => ({
      total: acc.total + (p.total_amount || 0),
      base: acc.base + (p.base_amount || 0),
      vat: acc.vat + (p.vat_amount || 0),
    }), { total: 0, base: 0, vat: 0 });
  }, [purchases]);

  // Validar antes de contabilizar
  const validatePurchases = (): boolean => {
    if (purchases.length === 0) {
      toast({
        title: "Sin facturas",
        description: "Debe agregar al menos una factura",
        variant: "destructive",
      });
      return false;
    }

    for (const p of purchases) {
      if (!p.supplier_nit.trim()) {
        toast({
          title: "NIT requerido",
          description: "Todas las facturas deben tener NIT del proveedor",
          variant: "destructive",
        });
        return false;
      }

      if (!p.supplier_name.trim()) {
        toast({
          title: "Proveedor requerido",
          description: "Todas las facturas deben tener nombre del proveedor",
          variant: "destructive",
        });
        return false;
      }

      if (!p.invoice_number.trim()) {
        toast({
          title: "Número de factura requerido",
          description: "Todas las facturas deben tener número",
          variant: "destructive",
        });
        return false;
      }

      if (p.total_amount <= 0) {
        toast({
          title: "Monto inválido",
          description: "El total de cada factura debe ser mayor a cero",
          variant: "destructive",
        });
        return false;
      }

      if (!p.expense_account_id) {
        toast({
          title: "Cuenta de gasto requerida",
          description: "Todas las facturas deben tener cuenta de gasto asignada",
          variant: "destructive",
        });
        return false;
      }
    }

    // Verificar configuración de cuentas
    if (!config?.vat_credit_account_id) {
      toast({
        title: "Configuración incompleta",
        description: "Debe configurar la cuenta de IVA Crédito Fiscal en Configuración de Empresa",
        variant: "destructive",
      });
      return false;
    }

    if (!config?.suppliers_account_id) {
      toast({
        title: "Configuración incompleta",
        description: "Debe configurar la cuenta de Proveedores en Configuración de Empresa",
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  // Contabilizar: generar líneas de detalle
  const handleContabilizar = async () => {
    if (!validatePurchases()) return;

    setLoading(true);

    try {
      const totals = getTotals();
      const generatedLines: DetailLine[] = [];
      let lineCounter = 1;

      // 1. Agrupar facturas por cuenta de gasto
      const expensesByAccount: Record<number, { total: number; descriptions: string[] }> = {};
      
      for (const p of purchases) {
        if (!p.expense_account_id) continue;
        
        if (!expensesByAccount[p.expense_account_id]) {
          expensesByAccount[p.expense_account_id] = { total: 0, descriptions: [] };
        }
        expensesByAccount[p.expense_account_id].total += p.base_amount;
        expensesByAccount[p.expense_account_id].descriptions.push(
          `${p.supplier_name} - Fact. ${p.invoice_series ? p.invoice_series + '-' : ''}${p.invoice_number}`
        );
      }

      // 2. Crear líneas DEBE para gastos (agrupados por cuenta)
      for (const [accountId, data] of Object.entries(expensesByAccount)) {
        generatedLines.push({
          id: crypto.randomUUID(),
          account_id: Number(accountId),
          description: data.descriptions.join('; '),
          bank_reference: documentReference,
          cost_center: "",
          debit_amount: Number(data.total.toFixed(2)),
          credit_amount: 0,
        });
        lineCounter++;
      }

      // 3. Crear línea DEBE para IVA Crédito Fiscal
      if (totals.vat > 0 && config?.vat_credit_account_id) {
        generatedLines.push({
          id: crypto.randomUUID(),
          account_id: config.vat_credit_account_id,
          description: `IVA Crédito Fiscal - ${purchases.length} factura(s)`,
          bank_reference: documentReference,
          cost_center: "",
          debit_amount: Number(totals.vat.toFixed(2)),
          credit_amount: 0,
        });
        lineCounter++;
      }

      // 4. Crear línea HABER para Proveedores
      if (config?.suppliers_account_id) {
        generatedLines.push({
          id: crypto.randomUUID(),
          account_id: config.suppliers_account_id,
          description: `Proveedores - ${purchases.length} factura(s) - Ref: ${documentReference || 'S/N'}`,
          bank_reference: documentReference,
          cost_center: "",
          debit_amount: 0,
          credit_amount: Number(totals.total.toFixed(2)),
        });
      }

      // Retornar líneas al diálogo padre
      onPurchasesPosted(generatedLines);
      
      toast({
        title: "Facturas contabilizadas",
        description: `Se generaron ${generatedLines.length} líneas de detalle`,
      });

      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error al contabilizar",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const totals = getTotals();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Agregar Facturas de Compra
          </DialogTitle>
        </DialogHeader>

        {/* Header fijo con info y botón Contabilizar */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b pb-4 -mx-6 px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="secondary" className="text-sm">
                Período: {monthName}
              </Badge>
              <Badge variant="outline" className="text-sm font-mono">
                Ref. Pago: {documentReference || 'Sin referencia'}
              </Badge>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="text-right text-sm">
                <p className="text-muted-foreground">Total: <span className="font-semibold text-foreground">{formatCurrency(totals.total)}</span></p>
                <p className="text-xs text-muted-foreground">Base: {formatCurrency(totals.base)} | IVA: {formatCurrency(totals.vat)}</p>
              </div>
              
              <Button 
                onClick={handleContabilizar} 
                disabled={loading || purchases.length === 0}
                className="gap-2"
              >
                <Calculator className="h-4 w-4" />
                Contabilizar
              </Button>
            </div>
          </div>
        </div>

        {/* Lista de facturas */}
        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-4 pb-4">
            <div className="flex justify-between items-center">
              <h4 className="font-medium">Facturas ({purchases.length})</h4>
              <Button onClick={addPurchase} variant="outline" size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Agregar Factura
              </Button>
            </div>

            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Tipo</TableHead>
                    <TableHead className="w-[80px]">Serie</TableHead>
                    <TableHead className="w-[100px]">Número</TableHead>
                    <TableHead className="w-[120px]">Fecha</TableHead>
                    <TableHead className="w-[120px]">NIT</TableHead>
                    <TableHead className="w-[180px]">Proveedor</TableHead>
                    <TableHead className="w-[120px]">Total</TableHead>
                    <TableHead className="w-[200px]">Cuenta Gasto</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchases.map((purchase) => (
                    <TableRow key={purchase.id}>
                      <TableCell>
                        <Select 
                          value={purchase.fel_document_type} 
                          onValueChange={(v) => updatePurchase(purchase.id, 'fel_document_type', v)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {felDocTypes.map((t) => (
                              <SelectItem key={t.code} value={t.code}>
                                {t.code}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={purchase.invoice_series}
                          onChange={(e) => updatePurchase(purchase.id, 'invoice_series', e.target.value)}
                          placeholder="A"
                          className="h-8 text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={purchase.invoice_number}
                          onChange={(e) => updatePurchase(purchase.id, 'invoice_number', e.target.value)}
                          placeholder="123456"
                          className="h-8 text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="date"
                          value={purchase.invoice_date}
                          onChange={(e) => updatePurchase(purchase.id, 'invoice_date', e.target.value)}
                          className="h-8 text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={purchase.supplier_nit}
                          onChange={(e) => updatePurchase(purchase.id, 'supplier_nit', e.target.value)}
                          placeholder="12345678"
                          className="h-8 text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={purchase.supplier_name}
                          onChange={(e) => updatePurchase(purchase.id, 'supplier_name', e.target.value)}
                          placeholder="Nombre proveedor"
                          className="h-8 text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={purchase.total_amount || ""}
                          onChange={(e) => updatePurchase(purchase.id, 'total_amount', parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          className="h-8 text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <AccountCombobox
                          accounts={accounts}
                          value={purchase.expense_account_id}
                          onValueChange={(v) => updatePurchase(purchase.id, 'expense_account_id', v)}
                          placeholder="Cuenta..."
                          className="w-full"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removePurchase(purchase.id)}
                          disabled={purchases.length <= 1}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Resumen de contabilización */}
            {purchases.length > 0 && purchases.some(p => p.expense_account_id && p.total_amount > 0) && (
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <h5 className="font-medium text-sm">Vista previa de contabilización:</h5>
                <div className="text-xs space-y-1">
                  <p className="text-muted-foreground">
                    <span className="font-medium">DEBE:</span> Gastos ({formatCurrency(totals.base)}) + IVA Crédito ({formatCurrency(totals.vat)})
                  </p>
                  <p className="text-muted-foreground">
                    <span className="font-medium">HABER:</span> Proveedores ({formatCurrency(totals.total)})
                  </p>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
