import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountCombobox, type Account } from "@/components/ui/account-combobox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, CheckCircle2, XCircle, Loader2, RotateCcw, Fuel } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { validateNIT, sanitizeNIT } from "@/utils/nitValidation";

interface QuickPurchaseFormProps {
  enterpriseId: number;
  journalEntryId: number;
  entryDate: string;
  entryMonth: number;
  entryYear: number;
  accounts: Account[];
  felDocTypes: Array<{ code: string; name: string }>;
  onCreated: () => void;
}

interface OperationType {
  id: number;
  code: string;
  name: string;
}

const VAT_RATE = 0.12;

export function QuickPurchaseForm({
  enterpriseId, journalEntryId, entryDate, entryMonth, entryYear,
  accounts, felDocTypes, onCreated,
}: QuickPurchaseFormProps) {
  const [date, setDate] = useState(entryDate);
  const [docType, setDocType] = useState("FACT");
  const [series, setSeries] = useState("");
  const [number, setNumber] = useState("");
  const [nit, setNit] = useState("");
  const [nitValid, setNitValid] = useState<boolean | null>(null);
  const [supplier, setSupplier] = useState("");
  const [total, setTotal] = useState<number>(0);
  const [idpAmount, setIdpAmount] = useState<number>(0);
  const [expenseAccountId, setExpenseAccountId] = useState<number | null>(null);
  const [operationTypeId, setOperationTypeId] = useState<number | null>(null);
  const [operationTypes, setOperationTypes] = useState<OperationType[]>([]);
  const [loading, setLoading] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const { toast } = useToast();

  // Track which fields user has manually changed (to avoid overriding)
  const touchedFields = useRef<Set<string>>(new Set());
  const [suggestedOpTypeId, setSuggestedOpTypeId] = useState<number | null>(null);
  const [suggestedAccountId, setSuggestedAccountId] = useState<number | null>(null);
  const [hasSuggestion, setHasSuggestion] = useState(false);

  // Load operation types
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("tab_operation_types")
        .select("id, code, name")
        .in("applies_to", ["purchases", "both"])
        .eq("is_active", true)
        .order("name");
      setOperationTypes(data || []);
    };
    load();
  }, []);

  // Detect fuel operation
  const isFuelOperation = operationTypes.find(t => t.id === operationTypeId)?.code === "COMBUSTIBLE";

  // NIT validation on change
  const handleNitChange = (value: string) => {
    const cleaned = sanitizeNIT(value);
    setNit(cleaned);
    if (cleaned.length === 0) {
      setNitValid(null);
    } else {
      setNitValid(validateNIT(cleaned));
    }
  };

  // On NIT blur: lookup supplier name + auto-suggest
  const handleNitBlur = async () => {
    const cleaned = nit.trim();
    if (!cleaned || !validateNIT(cleaned)) return;

    setSuggestLoading(true);
    try {
      // Lookup supplier name
      if (!supplier.trim()) {
        const { data } = await supabase
          .from("tab_purchase_ledger")
          .select("supplier_name")
          .eq("enterprise_id", enterpriseId)
          .eq("supplier_nit", cleaned)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data?.supplier_name) setSupplier(data.supplier_name);
      }

      // Auto-suggest operation type + expense account
      const { data: mapping } = await supabase.rpc("get_batch_purchase_mappings", {
        p_enterprise_id: enterpriseId,
        p_supplier_nits: [cleaned],
      });

      if (mapping && mapping.length > 0) {
        const m = mapping[0] as any;
        setSuggestedOpTypeId(m.operation_type_id);
        setSuggestedAccountId(m.expense_account_id);
        setHasSuggestion(true);

        if (!touchedFields.current.has("operationTypeId") && m.operation_type_id) {
          setOperationTypeId(m.operation_type_id);
        }
        if (!touchedFields.current.has("expenseAccountId") && m.expense_account_id) {
          setExpenseAccountId(m.expense_account_id);
        }
      } else {
        setHasSuggestion(false);
        setSuggestedOpTypeId(null);
        setSuggestedAccountId(null);
      }
    } catch { /* ignore */ }
    finally { setSuggestLoading(false); }
  };

  const resetToSuggested = () => {
    if (suggestedOpTypeId) setOperationTypeId(suggestedOpTypeId);
    if (suggestedAccountId) setExpenseAccountId(suggestedAccountId);
    touchedFields.current.delete("operationTypeId");
    touchedFields.current.delete("expenseAccountId");
  };

  // Calculate base/VAT with fuel (IDP) logic
  const calculateAmounts = () => {
    if (total <= 0) return { base: 0, vat: 0 };
    if (isFuelOperation && idpAmount > 0) {
      // Fuel: IVA = (Total - IDP) / 1.12 * 0.12
      const netAfterIdp = total - idpAmount;
      const base = Number((netAfterIdp / (1 + VAT_RATE)).toFixed(2));
      const vat = Number((netAfterIdp - base).toFixed(2));
      return { base, vat };
    }
    const base = Number((total / (1 + VAT_RATE)).toFixed(2));
    const vat = Number((total - base).toFixed(2));
    return { base, vat };
  };

  const { base, vat } = calculateAmounts();

  const canSubmit = nitValid === true && number.trim() && total > 0 && operationTypeId && expenseAccountId;

  const handleSave = async () => {
    if (!canSubmit) {
      toast({ title: "Campos requeridos", description: "Complete NIT válido, número, monto, tipo de operación y cuenta de gasto", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      // Resolve purchase_book_id
      let purchaseBookId: number | null = null;
      const { data: existingBook } = await supabase
        .from("tab_purchase_books").select("id")
        .eq("enterprise_id", enterpriseId)
        .eq("month", entryMonth).eq("year", entryYear)
        .maybeSingle();

      if (existingBook) {
        purchaseBookId = existingBook.id;
      } else {
        const { data: newBook } = await supabase
          .from("tab_purchase_books")
          .insert({ enterprise_id: enterpriseId, month: entryMonth, year: entryYear, created_by: user.id })
          .select("id").single();
        if (newBook) purchaseBookId = newBook.id;
      }

      const { data: purchase, error: pErr } = await supabase
        .from("tab_purchase_ledger")
        .insert({
          enterprise_id: enterpriseId,
          invoice_date: date,
          fel_document_type: docType,
          invoice_series: series || null,
          invoice_number: number,
          supplier_nit: nit,
          supplier_name: supplier || nit,
          total_amount: total,
          base_amount: base,
          net_amount: base,
          vat_amount: vat,
          idp_amount: isFuelOperation ? idpAmount : 0,
          expense_account_id: expenseAccountId,
          operation_type_id: operationTypeId,
          journal_entry_id: journalEntryId,
          purchase_book_id: purchaseBookId,
        })
        .select("id").single();

      if (pErr) throw pErr;

      await supabase
        .from("tab_purchase_journal_links" as any)
        .upsert({
          enterprise_id: enterpriseId,
          purchase_id: purchase.id,
          journal_entry_id: journalEntryId,
          link_source: 'FROM_JOURNAL_MODAL',
          linked_by: user.id,
          linked_at: new Date().toISOString(),
        }, { onConflict: "enterprise_id,purchase_id" });

      toast({ title: "Factura creada y vinculada", description: `${supplier || nit} - ${number}` });

      // Reset form
      setNumber("");
      setNit("");
      setNitValid(null);
      setSupplier("");
      setTotal(0);
      setIdpAmount(0);
      setSeries("");
      setOperationTypeId(null);
      setExpenseAccountId(null);
      setHasSuggestion(false);
      setSuggestedOpTypeId(null);
      setSuggestedAccountId(null);
      touchedFields.current.clear();

      onCreated();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const effectiveDocTypes = felDocTypes.length > 0 ? felDocTypes : [
    { code: "FACT", name: "Factura" },
    { code: "FCAM", name: "Factura Cambiaria" },
    { code: "FPEQ", name: "Factura Pequeño C." },
    { code: "NCRE", name: "Nota de Crédito" },
    { code: "NDEB", name: "Nota de Débito" },
    { code: "RECE", name: "Recibo" },
  ];

  return (
    <div className="space-y-3 p-3">
      {/* Row 1: Date + Doc Type */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Fecha</label>
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-8 text-xs mt-1" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Tipo Doc.</label>
          <Select value={docType} onValueChange={setDocType}>
            <SelectTrigger className="h-8 text-xs mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {effectiveDocTypes.map(dt => (
                <SelectItem key={dt.code} value={dt.code}>{dt.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 2: Series + Number */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Serie</label>
          <Input value={series} onChange={e => setSeries(e.target.value)} className="h-8 text-xs mt-1" placeholder="Opc." />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-muted-foreground">Número</label>
          <Input value={number} onChange={e => setNumber(e.target.value)} className="h-8 text-xs mt-1" placeholder="No. factura" />
        </div>
      </div>

      {/* Row 3: NIT + Supplier */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-muted-foreground">NIT</label>
          <div className="relative mt-1">
            <Input
              value={nit}
              onChange={e => handleNitChange(e.target.value)}
              onBlur={handleNitBlur}
              className={`h-8 text-xs pr-8 ${nitValid === false ? 'border-destructive focus-visible:ring-destructive' : nitValid === true ? 'border-green-500 focus-visible:ring-green-500' : ''}`}
              placeholder="NIT proveedor"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              {suggestLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              ) : nitValid === true ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              ) : nitValid === false ? (
                <XCircle className="h-3.5 w-3.5 text-destructive" />
              ) : null}
            </div>
          </div>
          {nitValid === false && (
            <p className="text-[10px] text-destructive mt-0.5">NIT inválido (dígito verificador)</p>
          )}
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Proveedor</label>
          <Input value={supplier} onChange={e => setSupplier(e.target.value)} className="h-8 text-xs mt-1" placeholder="Nombre" />
        </div>
      </div>

      {/* Row 4: Operation Type */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">
          Tipo de Operación <span className="text-destructive">*</span>
          {hasSuggestion && suggestedOpTypeId === operationTypeId && (
            <span className="ml-1 text-[10px] italic text-muted-foreground/60">(sugerido)</span>
          )}
        </label>
        <Select
          value={operationTypeId?.toString() || ""}
          onValueChange={v => {
            touchedFields.current.add("operationTypeId");
            setOperationTypeId(v ? parseInt(v) : null);
          }}
        >
          <SelectTrigger className="h-8 text-xs mt-1">
            <SelectValue placeholder="Seleccionar tipo..." />
          </SelectTrigger>
          <SelectContent>
            {operationTypes.map(ot => (
              <SelectItem key={ot.id} value={ot.id.toString()}>
                {ot.code} – {ot.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Row 5: Total + IDP (if fuel) */}
      <div className={`grid gap-2 ${isFuelOperation ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Total Q</label>
          <Input
            type="number" step="0.01" min="0"
            value={total || ""}
            onChange={e => setTotal(Number(e.target.value) || 0)}
            className="h-8 text-xs font-mono mt-1"
            placeholder="0.00"
          />
        </div>
        {isFuelOperation && (
          <div>
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Fuel className="h-3 w-3" /> IDP
            </label>
            <Input
              type="number" step="0.01" min="0"
              value={idpAmount || ""}
              onChange={e => setIdpAmount(Number(e.target.value) || 0)}
              className="h-8 text-xs font-mono mt-1"
              placeholder="0.00"
              title="Impuesto a Distribución de Petróleo"
            />
          </div>
        )}
      </div>

      {total > 0 && (
        <p className="text-[10px] text-muted-foreground">
          Base: {formatCurrency(base)} · IVA: {formatCurrency(vat)}
          {isFuelOperation && idpAmount > 0 && ` · IDP: ${formatCurrency(idpAmount)}`}
        </p>
      )}

      {/* Row 6: Expense Account */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">
          Cuenta Gasto <span className="text-destructive">*</span>
          {hasSuggestion && suggestedAccountId === expenseAccountId && (
            <span className="ml-1 text-[10px] italic text-muted-foreground/60">(sugerido)</span>
          )}
        </label>
        <div className="mt-1">
          <AccountCombobox
            accounts={accounts}
            value={expenseAccountId}
            onValueChange={v => {
              touchedFields.current.add("expenseAccountId");
              setExpenseAccountId(v);
            }}
            placeholder="Seleccionar cuenta..."
          />
        </div>
      </div>

      {/* Suggestion helper */}
      {hasSuggestion && (
        <div className="flex items-center justify-between text-[10px] text-muted-foreground bg-muted/40 rounded px-2 py-1">
          <span>Sugerido del último registro para este NIT</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-[10px] gap-0.5"
                onClick={resetToSuggested}
              >
                <RotateCcw className="h-2.5 w-2.5" />
                Restaurar
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">Restaurar valores sugeridos</TooltipContent>
          </Tooltip>
        </div>
      )}

      <Button onClick={handleSave} disabled={loading || !canSubmit} size="sm" className="w-full">
        {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
        Crear y Vincular
      </Button>
    </div>
  );
}
