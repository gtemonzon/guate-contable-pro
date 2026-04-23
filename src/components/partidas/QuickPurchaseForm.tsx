/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountCombobox, type Account } from "@/components/ui/account-combobox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, CheckCircle2, XCircle, Loader2, RotateCcw, Fuel, AlertTriangle, Link2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { validateNIT, sanitizeNIT } from "@/utils/nitValidation";
import { NitAutocomplete } from "@/components/ui/nit-autocomplete";
import { useEnterpriseBaseCurrency } from "@/hooks/useEnterpriseBaseCurrency";
import { useEnterpriseCurrencies } from "@/hooks/useEnterpriseCurrencies";
import { useExchangeRates } from "@/hooks/useExchangeRates";

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

interface DuplicateInfo {
  id: number;
  supplier_name: string;
  total_amount: number;
  invoice_date: string;
  journal_entry_id: number | null;
}

const VAT_RATE = 0.12;

export function QuickPurchaseForm({
  enterpriseId, journalEntryId, entryDate, entryMonth, entryYear,
  accounts, felDocTypes, onCreated,
}: QuickPurchaseFormProps) {
  const baseCurrency = useEnterpriseBaseCurrency(enterpriseId);
  const { items: enabledCurrencies } = useEnterpriseCurrencies(enterpriseId);
  const { getRate } = useExchangeRates(enterpriseId);
  const isMultiCurrency = enabledCurrencies.length > 0;

  const [date, setDate] = useState(entryDate);
  const [docType, setDocType] = useState("FACT");
  const [series, setSeries] = useState("");
  const [number, setNumber] = useState("");
  const [nit, setNit] = useState("");
  const [nitValid, setNitValid] = useState<boolean | null>(null);
  const [supplier, setSupplier] = useState("");
  const [total, setTotal] = useState<number>(0);
  const [idpAmount, setIdpAmount] = useState<number>(0);
  const [currencyCode, setCurrencyCode] = useState<string>(baseCurrency);
  const [exchangeRate, setExchangeRate] = useState<number>(1);
  const [expenseAccountId, setExpenseAccountId] = useState<number | null>(null);
  const [operationTypeId, setOperationTypeId] = useState<number | null>(null);
  const [operationTypes, setOperationTypes] = useState<OperationType[]>([]);
  const [loading, setLoading] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const { toast } = useToast();

  // Sync default currency once base loads
  useEffect(() => {
    setCurrencyCode((c) => (c === "GTQ" || !c) ? baseCurrency : c);
  }, [baseCurrency]);

  // Auto-fill rate when currency or date changes
  useEffect(() => {
    if (currencyCode === baseCurrency) {
      setExchangeRate(1);
      return;
    }
    const r = getRate(currencyCode, date);
    if (r !== null) setExchangeRate(r);
  }, [currencyCode, date, baseCurrency, getRate]);

  

  // Duplicate detection state
  const [duplicate, setDuplicate] = useState<DuplicateInfo | null>(null);
  const [dupChecking, setDupChecking] = useState(false);
  const [linkingExisting, setLinkingExisting] = useState(false);

  // Track which fields user has manually changed (to avoid overriding)
  const touchedFields = useRef<Set<string>>(new Set());
  const dateInputRef = useRef<HTMLInputElement>(null);
  const nitInputRef = useRef<HTMLInputElement>(null);
  const opTypeSelectRef = useRef<HTMLButtonElement>(null);
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

  // Detect special operation types
  const selectedOpType = operationTypes.find(t => t.id === operationTypeId);
  const isFuelOperation = selectedOpType?.code === "COMBUSTIBLE";
  const isExemptOperation = selectedOpType?.code === "EXENTAS";

  // ─── Duplicate check ───
  const checkDuplicate = useCallback(async () => {
    const cleanedNit = nit.trim();
    const cleanedNumber = number.trim();
    if (!cleanedNit || !cleanedNumber || !docType) {
      setDuplicate(null);
      return;
    }

    setDupChecking(true);
    try {
      let query = supabase
        .from("tab_purchase_ledger")
        .select("id, supplier_name, total_amount, invoice_date, journal_entry_id")
        .eq("enterprise_id", enterpriseId)
        .eq("supplier_nit", cleanedNit)
        .eq("fel_document_type", docType)
        .eq("invoice_number", cleanedNumber)
        .is("deleted_at", null);

      // Match series (empty string = no series)
      if (series.trim()) {
        query = query.eq("invoice_series", series.trim());
      } else {
        query = query.or("invoice_series.is.null,invoice_series.eq.");
      }

      const { data } = await query.limit(1).maybeSingle();
      setDuplicate(data as DuplicateInfo | null);
    } catch {
      // Ignore errors in duplicate check
    } finally {
      setDupChecking(false);
    }
  }, [enterpriseId, nit, docType, series, number]);

  // Run duplicate check when key fields change (debounced via blur)
  const handleNumberBlur = () => {
    checkDuplicate();
  };

  // Also recheck when docType or series change (if number is already filled)
  useEffect(() => {
    if (number.trim() && nit.trim()) {
      checkDuplicate();
    } else {
      setDuplicate(null);
    }
  }, [docType, series]); // eslint-disable-line react-hooks/exhaustive-deps

  // Is the duplicate already linked to THIS journal entry?
  const dupAlreadyLinked = duplicate?.journal_entry_id === journalEntryId;

  // ─── Link existing duplicate ───
  const handleLinkExisting = async () => {
    if (!duplicate) return;
    setLinkingExisting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      const [{ error: linkError }, { error: legacyError }] = await Promise.all([
        supabase
          .from("tab_purchase_journal_links" as any)
          .upsert({
            enterprise_id: enterpriseId,
            purchase_id: duplicate.id,
            journal_entry_id: journalEntryId,
            link_source: 'FROM_JOURNAL_MODAL',
            linked_by: user.id,
            linked_at: new Date().toISOString(),
          }, { onConflict: "enterprise_id,purchase_id" }),
        supabase
          .from("tab_purchase_ledger")
          .update({ journal_entry_id: journalEntryId })
          .eq("enterprise_id", enterpriseId)
          .eq("id", duplicate.id)
          .is("deleted_at", null),
      ]);

      if (linkError) throw linkError;
      if (legacyError) throw legacyError;

      toast({ title: "Factura existente vinculada", description: `${duplicate.supplier_name} - ${number}` });
      // Reset form
      setNumber("");
      setNit("");
      setNitValid(null);
      setSupplier("");
      setTotal(0);
      setDuplicate(null);
      onCreated();
    } catch (err: unknown) {
      toast({ title: "Error al vincular", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setLinkingExisting(false);
    }
  };

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
    if (!cleaned || !validateNIT(cleaned)) {
      // Invalid NIT — keep focus on NIT input
      if (cleaned.length > 0) {
        nitInputRef.current?.focus();
      }
      return;
    }

    // Also trigger duplicate check if number is filled
    if (number.trim()) checkDuplicate();

    setSuggestLoading(true);
    try {
      // Name autofill is handled by NitAutocomplete onSelectTaxpayer
      // Auto-suggest operation type + expense account from last purchase
      let sugOpType: number | null = null;
      let sugAccount: number | null = null;

      // Try RPC first, fallback to direct query
      try {
        const { data: mapping } = await supabase.rpc("get_batch_purchase_mappings", {
          p_enterprise_id: enterpriseId,
          p_supplier_nits: [cleaned],
        });
        if (mapping && mapping.length > 0) {
          const m = mapping[0] as any;
          sugOpType = m.operation_type_id ?? null;
          sugAccount = m.expense_account_id ?? null;
        }
      } catch {
        // RPC not available, ignore
      }

      // Fallback: direct query to tab_purchase_ledger
      if (!sugOpType && !sugAccount) {
        const { data: lastPurchase } = await supabase
          .from("tab_purchase_ledger")
          .select("operation_type_id, expense_account_id")
          .eq("enterprise_id", enterpriseId)
          .eq("supplier_nit", cleaned)
          .is("deleted_at", null)
          .order("invoice_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastPurchase) {
          sugOpType = lastPurchase.operation_type_id ?? null;
          sugAccount = lastPurchase.expense_account_id ?? null;
        }
      }

      if (sugOpType || sugAccount) {
        setSuggestedOpTypeId(sugOpType);
        setSuggestedAccountId(sugAccount);
        setHasSuggestion(true);

        if (!touchedFields.current.has("operationTypeId") && sugOpType) {
          setOperationTypeId(sugOpType);
        }
        if (!touchedFields.current.has("expenseAccountId") && sugAccount) {
          setExpenseAccountId(sugAccount);
        }
      } else {
        setHasSuggestion(false);
        setSuggestedOpTypeId(null);
        setSuggestedAccountId(null);
      }

      // Move focus to operation type after successful validation
      requestAnimationFrame(() => {
        opTypeSelectRef.current?.focus();
      });
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
    // Exempt operations: no VAT
    if (isExemptOperation) {
      return { base: total, vat: 0 };
    }
    if (isFuelOperation && idpAmount > 0) {
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

  const canSubmit = nitValid === true && number.trim() && total > 0 && operationTypeId && expenseAccountId && !duplicate;

  const handleSave = useCallback(async () => {
    if (!canSubmit) {
      toast({ title: "Campos requeridos", description: "Complete NIT válido, número, monto, tipo de operación y cuenta de gasto", variant: "destructive" });
      return;
    }

    // Final duplicate check before insert
    await checkDuplicate();
    if (duplicate) {
      toast({ title: "Factura duplicada", description: "Ya existe una factura con estos datos. Vincule la existente.", variant: "destructive" });
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

      const r = Number(exchangeRate || 1);
      const totalFunctional = Math.round(total * r * 100) / 100;
      const baseFunctional = Math.round(base * r * 100) / 100;
      const vatFunctional = Math.round(vat * r * 100) / 100;

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
          // Montos en moneda funcional (para reportes SAT)
          total_amount: totalFunctional,
          base_amount: baseFunctional,
          net_amount: baseFunctional,
          vat_amount: vatFunctional,
          idp_amount: isFuelOperation ? Math.round(idpAmount * r * 100) / 100 : 0,
          // Multi-moneda: moneda original + tasa + montos originales
          currency_code: currencyCode,
          exchange_rate: r,
          original_total: total,
          original_subtotal: base,
          original_vat: vat,
          expense_account_id: expenseAccountId,
          operation_type_id: operationTypeId,
          journal_entry_id: journalEntryId,
          purchase_book_id: purchaseBookId,
        })
        .select("id").single();

      if (pErr) {
        // Catch unique constraint violation
        if (pErr.code === '23505' || pErr.message?.includes('duplicate') || pErr.message?.includes('unique')) {
          toast({ title: "Factura duplicada", description: "Ya existe una factura con estos datos. Vincule la existente.", variant: "destructive" });
          await checkDuplicate(); // Refresh duplicate info
          return;
        }
        throw pErr;
      }

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
      setDuplicate(null);
      touchedFields.current.clear();

      onCreated();
      setTimeout(() => dateInputRef.current?.focus(), 50);
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [canSubmit, nit, number, docType, series, date, supplier, total, base, vat, idpAmount, isFuelOperation, expenseAccountId, operationTypeId, enterpriseId, journalEntryId, entryMonth, entryYear, duplicate, checkDuplicate, toast, onCreated]);

  // ─── Alt+N shortcut ───
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey || !(e.key === 'n' || e.key === 'N') || e.ctrlKey || e.metaKey || e.shiftKey) return;
      e.preventDefault();
      e.stopPropagation();
      if (!canSubmit) return;
      handleSave();
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [canSubmit, handleSave]);  

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
          <Input ref={dateInputRef} type="date" value={date} onChange={e => setDate(e.target.value)} className="h-8 text-xs mt-1" />
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
          <div className="relative mt-1">
            <Input
              value={number}
              onChange={e => setNumber(e.target.value)}
              onBlur={handleNumberBlur}
              className={`h-8 text-xs ${duplicate ? 'border-destructive focus-visible:ring-destructive' : ''}`}
              placeholder="No. factura"
            />
            {dupChecking && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Duplicate warning */}
      {duplicate && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-2.5 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div className="text-xs space-y-0.5">
              {dupAlreadyLinked ? (
                <p className="font-medium text-destructive">Esta factura ya existe y está vinculada a esta partida.</p>
              ) : (
                <>
                  <p className="font-medium text-destructive">Factura duplicada detectada</p>
                  <p className="text-muted-foreground">
                    {duplicate.supplier_name} · {duplicate.invoice_date} · {formatCurrency(duplicate.total_amount)}
                  </p>
                </>
              )}
            </div>
          </div>
          {!dupAlreadyLinked && (
            <Button
              size="sm"
              variant="outline"
              className="w-full h-7 text-xs gap-1.5"
              onClick={handleLinkExisting}
              disabled={linkingExisting}
            >
              {linkingExisting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              Vincular factura existente
            </Button>
          )}
        </div>
      )}

      {/* Row 3: NIT + Supplier */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-muted-foreground">NIT</label>
          <div className="relative mt-1">
            <NitAutocomplete
              ref={nitInputRef}
              value={nit}
              onChange={e => handleNitChange(e.target.value)}
              onBlur={handleNitBlur}
              onSelectTaxpayer={(selectedNit, name) => {
                handleNitChange(selectedNit);
                setNitValid(validateNIT(selectedNit));
                setSupplier(name);
              }}
              className={`h-8 text-xs pr-8 ${nitValid === false ? 'border-destructive focus-visible:ring-destructive' : nitValid === true ? 'border-green-500 focus-visible:ring-green-500' : ''}`}
              placeholder="NIT proveedor"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 z-10">
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
          <SelectTrigger ref={opTypeSelectRef} className="h-8 text-xs mt-1">
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

      {/* Row Multi-currency: Currency selector + Rate (only if enterprise has >1 currency) */}
      {isMultiCurrency && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Moneda</label>
            <Select value={currencyCode} onValueChange={setCurrencyCode}>
              <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={baseCurrency}>{baseCurrency}</SelectItem>
                {enabledCurrencies.map((c) => (
                  <SelectItem key={c.currency_code} value={c.currency_code}>{c.currency_code}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Tipo de cambio</label>
            <Input
              type="number" step="0.000001" min="0"
              value={exchangeRate || ""}
              onChange={(e) => setExchangeRate(Number(e.target.value) || 0)}
              disabled={currencyCode === baseCurrency}
              className="h-8 text-xs font-mono mt-1"
            />
          </div>
        </div>
      )}

      {/* Row 5: Total + IDP (if fuel) */}
      <div className={`grid gap-2 ${isFuelOperation ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Total {currencyCode === baseCurrency ? `(${baseCurrency})` : currencyCode}
          </label>
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

      <Button onClick={handleSave} disabled={loading || !canSubmit} size="sm" className="w-full" title="Crear y Vincular (Alt+N)">
        {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
        Crear y Vincular
        <kbd className="ml-1.5 pointer-events-none hidden sm:inline-flex h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">Alt+N</kbd>
      </Button>
    </div>
  );
}
