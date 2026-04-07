import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { allocateEntryNumber } from "@/utils/journalEntryNumbering";
import { formatCurrency } from "@/lib/utils";
import type { BankDirection } from "./JournalEntryBankSection";
import { enforceBankLineInvariant } from "./enforceBankLineInvariant";

export type EntryStatus = 'borrador' | 'pendiente_revision' | 'aprobado' | 'contabilizado' | 'rechazado';

export interface Account {
  id: number;
  account_code: string;
  account_name: string;
  requires_cost_center: boolean;
  balance_type: string;
  is_bank_account?: boolean;
}

export interface Period {
  id: number;
  year: number;
  start_date: string;
  end_date: string;
  status: string;
}

export interface DetailLine {
  id: string;
  account_id: number | null;
  description: string;
  cost_center: string;
  debit_amount: number;
  credit_amount: number;
  is_bank_line?: boolean;
  source_type?: string | null;
  source_id?: number | null;
  source_ref?: string | null;
}

export interface AuditInfo {
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

interface EntryToEdit {
  id: number;
  entry_number: string;
  entry_date: string;
  entry_type: string;
  description: string;
  total_debit: number;
  total_credit: number;
  is_posted: boolean;
  accounting_period_id?: number | null;
  status?: EntryStatus;
  rejection_reason?: string | null;
}

export function useJournalEntryForm(
  open: boolean,
  entryToEdit: EntryToEdit | null,
  onSuccess: (savedEntryId?: number) => void,
  onOpenChange: (open: boolean) => void,
) {
  const [loading, setLoading] = useState(false);
  const [isLoadingEntry, setIsLoadingEntry] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [nextEntryNumber, setNextEntryNumber] = useState("");

  // Header fields
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [entryType, setEntryType] = useState("diario");
  const [periodId, setPeriodId] = useState<number | null>(null);
  const [documentReference, setDocumentReference] = useState("");
  const [headerDescription, setHeaderDescription] = useState("");
  const [documentReferences, setDocumentReferences] = useState<string[]>([]);

  // Bank fields
  const [bankAccountId, setBankAccountId] = useState<number | null>(null);
  const [bankReference, setBankReference] = useState("");
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [bankDirection, setBankDirection] = useState<BankDirection>('OUT');

  // Lines
  const [detailLines, setDetailLines] = useState<DetailLine[]>([
    { id: crypto.randomUUID(), account_id: null, description: "", cost_center: "", debit_amount: 0, credit_amount: 0 },
    { id: crypto.randomUUID(), account_id: null, description: "", cost_center: "", debit_amount: 0, credit_amount: 0 },
  ]);

  const [accountSearch, setAccountSearch] = useState<Record<string, string>>({});
  const [accountPopoverOpen, setAccountPopoverOpen] = useState<Record<string, boolean>>({});
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [entryStatus, setEntryStatus] = useState<EntryStatus>('borrador');
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [auditInfo, setAuditInfo] = useState<AuditInfo | null>(null);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [showStickyHeader, setShowStickyHeader] = useState(false);
  const [bankRefDuplicate, setBankRefDuplicate] = useState<{ entryNumber: string; entryId: number } | null>(null);
  const [bankRefChecking, setBankRefChecking] = useState(false);

  // Auto-draft support
  const draftEntryIdRef = useRef<number | null>(null);

  const headerRef = useRef<HTMLDivElement>(null);
  const initialSnapshotRef = useRef<string>("");
  const { toast } = useToast();
  const permissions = useUserPermissions();

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleString('es-GT', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const serializeForDirtyCheck = useCallback((state: {
    entryDate: string; entryType: string; periodId: number | null;
    documentReference: string; headerDescription: string;
    detailLines: Array<Omit<DetailLine, "id">>;
  }) => JSON.stringify({
    ...state,
    detailLines: state.detailLines.map((l) => ({
      account_id: l.account_id, description: l.description,
      cost_center: l.cost_center,
      debit_amount: Number(l.debit_amount || 0),
      credit_amount: Number(l.credit_amount || 0),
    })),
  }), []);

  const resetFormForEdit = () => {
    setNextEntryNumber(""); setEntryDate(""); setEntryType(""); setPeriodId(null);
    setDocumentReference(""); setHeaderDescription(""); setDocumentReferences([]);
    setBankAccountId(null); setBankReference(""); setBeneficiaryName(""); setBankDirection('OUT'); setDetailLines([]);
    setAuditInfo(null); setEntryStatus('borrador'); setAccountSearch({});
    setIsReadOnly(false); setActiveLineId(null);
    draftEntryIdRef.current = null;
  };

  const resetForm = () => {
    const freshDate = new Date().toISOString().split("T")[0];
    const freshLines: DetailLine[] = [
      { id: crypto.randomUUID(), account_id: null, description: "", cost_center: "", debit_amount: 0, credit_amount: 0 },
      { id: crypto.randomUUID(), account_id: null, description: "", cost_center: "", debit_amount: 0, credit_amount: 0 },
    ];
    initialSnapshotRef.current = serializeForDirtyCheck({
      entryDate: freshDate, entryType: "diario", periodId: null,
      documentReference: "", headerDescription: "",
      detailLines: freshLines.map(({ id, ...rest }) => rest),
    });
    setEntryDate(freshDate); setEntryType("diario"); setPeriodId(null);
    setDocumentReference(""); setHeaderDescription(""); setDocumentReferences([]);
    setBankAccountId(null); setBankReference(""); setBeneficiaryName(""); setBankDirection('OUT'); setDetailLines(freshLines);
    setShowCloseConfirm(false); setShowRejectDialog(false); setRejectionReason("");
    setEntryStatus('borrador'); setActiveLineId(freshLines[0]?.id || null);
    draftEntryIdRef.current = null;
  };

  const loadInitialData = async () => {
    const enterpriseId = localStorage.getItem("currentEnterpriseId");
    if (!enterpriseId) return;
    try {
      const [{ data: accountsData, error: aErr }, { data: periodsData, error: pErr }, { data: lastEntry }] =
        await Promise.all([
          supabase.from("tab_accounts").select("id, account_code, account_name, requires_cost_center, balance_type, is_bank_account")
            .eq("enterprise_id", parseInt(enterpriseId)).eq("allows_movement", true).eq("is_active", true).order("account_code"),
          supabase.from("tab_accounting_periods").select("*").eq("enterprise_id", parseInt(enterpriseId))
            .eq("status", "abierto").order("year", { ascending: false }),
          supabase.from("tab_journal_entries").select("entry_date").eq("enterprise_id", parseInt(enterpriseId))
            .is("deleted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        ]);
      if (aErr) throw aErr;
      if (pErr) throw pErr;
      setAccounts(accountsData || []);
      setPeriods(periodsData || []);
      const defaultDate = lastEntry?.entry_date || new Date().toISOString().split('T')[0];
      setEntryDate(defaultDate);
      if (periodsData && periodsData.length > 0) {
        const match = periodsData.find(p => defaultDate >= p.start_date && defaultDate <= p.end_date);
        setPeriodId(match ? match.id : periodsData[0].id);
      }
      // Don't preview/allocate a number on open — show "Sin asignar" until save
      setNextEntryNumber("");
    } catch (error: unknown) {
      toast({ title: "Error al cargar datos", description: getSafeErrorMessage(error), variant: "destructive" });
    }
  };

  const loadEntryData = async (entryId: number) => {
    const enterpriseId = localStorage.getItem("currentEnterpriseId");
    if (!enterpriseId) return;
    try {
      await loadInitialData();
      const [{ data: entry, error: entryError }, { data: details, error: detailsError }] = await Promise.all([
        supabase.from("tab_journal_entries").select(`*, creator:tab_users!tab_journal_entries_created_by_fkey(full_name), modifier:tab_users!tab_journal_entries_updated_by_fkey(full_name)`)
          .eq("id", entryId).single(),
        supabase.from("tab_journal_entry_details").select("*").eq("journal_entry_id", entryId).order("line_number"),
      ]);
      if (entryError) throw entryError;
      if (detailsError) throw detailsError;

      setNextEntryNumber(entry.entry_number);
      setEntryDate(entry.entry_date);
      setEntryType(entry.entry_type);
      setPeriodId(entry.accounting_period_id);
      setDocumentReference(entry.document_reference || "");
      setHeaderDescription(entry.description);
      setDocumentReferences((entry as any).document_references || []);
      setAuditInfo({ createdBy: entry.creator?.full_name || null, createdAt: entry.created_at, updatedBy: entry.modifier?.full_name || null, updatedAt: entry.updated_at });
      setEntryStatus((entry.status || (entry.is_posted ? 'contabilizado' : 'borrador')) as EntryStatus);
      setBankAccountId(entry.bank_account_id || null);
      setBankReference(entry.bank_reference || "");
      setBeneficiaryName(entry.beneficiary_name || "");
      setBankDirection((entry as any).bank_direction || 'OUT');

      if (entry.accounting_period_id) {
        const { data: periodData } = await supabase.from('tab_accounting_periods').select('status').eq('id', entry.accounting_period_id).single();
        if (periodData?.status === 'cerrado') {
          setIsReadOnly(true);
          toast({ title: "Período cerrado", description: "Esta partida pertenece a un período cerrado y no puede ser editada" });
        }
      }

      const lines: DetailLine[] = details.map((d: any) => ({
        id: crypto.randomUUID(), account_id: d.account_id, description: d.description || "",
        cost_center: d.cost_center || "", debit_amount: d.debit_amount, credit_amount: d.credit_amount,
        is_bank_line: d.is_bank_line || false,
        source_type: d.source_type || null, source_id: d.source_id || null, source_ref: d.source_ref || null,
      }));

      // Legacy fix: if bank_account_id is set but no bank line exists, create one
      if (entry.bank_account_id && !lines.some(l => l.is_bank_line)) {
        lines.push({
          id: crypto.randomUUID(),
          account_id: entry.bank_account_id,
          description: entry.description || "Banco (auto)",
          cost_center: "",
          debit_amount: 0,
          credit_amount: 0,
          is_bank_line: true,
        });
      }

      initialSnapshotRef.current = serializeForDirtyCheck({
        entryDate: entry.entry_date, entryType: entry.entry_type, periodId: entry.accounting_period_id,
        documentReference: entry.document_reference || "", headerDescription: entry.description,
        detailLines: lines.map(({ id, ...rest }) => rest),
      });
      setDetailLines(lines);
    } catch (error: unknown) {
      toast({ title: "Error al cargar partida", description: getSafeErrorMessage(error), variant: "destructive" });
    }
  };

  useEffect(() => {
    if (open) {
      if (entryToEdit) {
        resetFormForEdit();
        setIsLoadingEntry(true);
        loadEntryData(entryToEdit.id).finally(() => setIsLoadingEntry(false));
      } else {
        loadInitialData();
        resetForm();
      }
      setShowStickyHeader(false);
    }
  }, [open, entryToEdit]);

  useEffect(() => {
    if (!open || !headerRef.current) return;
    const observer = new IntersectionObserver(([entry]) => setShowStickyHeader(!entry.isIntersecting), { threshold: 0, rootMargin: '-10px 0px 0px 0px' });
    observer.observe(headerRef.current);
    return () => observer.disconnect();
  }, [open, isLoadingEntry]);

  // No longer preview entry numbers on open — numbers are assigned only at save time

  useEffect(() => {
    if (!open || !bankAccountId || bankReference) return;
    const enterpriseId = localStorage.getItem("currentEnterpriseId");
    if (!enterpriseId) return;
    supabase.from("tab_journal_entries").select("bank_reference")
      .eq("enterprise_id", parseInt(enterpriseId)).eq("bank_account_id", bankAccountId)
      .not("bank_reference", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => {
        if (data?.bank_reference) {
          const match = data.bank_reference.match(/(\d+)$/);
          if (match) setBankReference(`${data.bank_reference.replace(/\d+$/, '')}${parseInt(match[1]) + 1}`);
        }
      });
  }, [open, bankAccountId]);

  // ─── Auto Bank Line Management (single invariant) ──────────────────
  useEffect(() => {
    if (!open || isLoadingEntry) return;

    setDetailLines(prev => {
      const next = enforceBankLineInvariant(prev, bankAccountId, bankDirection, {
        headerDescription,
        beneficiaryName,
        bankReference,
      });
      if (next.length === prev.length && next.every((l, i) =>
        l.id === prev[i].id &&
        l.account_id === prev[i].account_id &&
        l.description === prev[i].description &&
        l.debit_amount === prev[i].debit_amount &&
        l.credit_amount === prev[i].credit_amount &&
        l.is_bank_line === prev[i].is_bank_line
      )) {
        return prev;
      }
      return next;
    });
  }, [bankAccountId, bankDirection, open, isLoadingEntry, headerDescription, beneficiaryName, bankReference, detailLines.filter(l => !l.is_bank_line).map(l => `${l.debit_amount}-${l.credit_amount}-${l.account_id}`).join(',')]);

  // ─── Duplicate bank reference check ──────────────────────────────
  const checkDuplicateBankRef = useCallback(async () => {
    if (!bankAccountId || !bankReference.trim()) {
      setBankRefDuplicate(null);
      return;
    }
    const enterpriseId = localStorage.getItem("currentEnterpriseId");
    if (!enterpriseId) return;

    setBankRefChecking(true);
    try {
      let query = supabase.from("tab_journal_entries")
        .select("id, entry_number")
        .eq("enterprise_id", parseInt(enterpriseId))
        .eq("bank_account_id", bankAccountId)
        .eq("bank_reference", bankReference.trim())
        .neq("status", "anulado")
        .is("deleted_at", null)
        .not("entry_number", "like", "REV-%")
        .limit(1);

      const currentId = entryToEdit?.id || draftEntryIdRef.current;
      if (currentId) {
        query = query.neq("id", currentId);
      }

      const { data } = await query.maybeSingle();
      setBankRefDuplicate(data ? { entryNumber: data.entry_number, entryId: data.id } : null);
    } catch {
      setBankRefDuplicate(null);
    } finally {
      setBankRefChecking(false);
    }
  }, [bankAccountId, bankReference, entryToEdit]);

  // Clear duplicate when bank account changes
  useEffect(() => {
    setBankRefDuplicate(null);
  }, [bankAccountId]);

  const propagateDescriptionToLines = useCallback(() => {
    if (headerDescription && !entryToEdit) {
      setDetailLines(lines => lines.map(line => line.is_bank_line ? line : ({ ...line, description: line.description === "" ? headerDescription : line.description })));
    }
  }, [headerDescription, entryToEdit]);

  const hasUnsavedChanges = useCallback(() => {
    if (!initialSnapshotRef.current) return false;
    return serializeForDirtyCheck({ entryDate, entryType, periodId, documentReference, headerDescription, detailLines: detailLines.map(({ id, ...rest }) => rest) }) !== initialSnapshotRef.current;
  }, [detailLines, documentReference, entryDate, entryType, headerDescription, periodId, serializeForDirtyCheck]);

  const handleCloseAttempt = useCallback(async (newOpen: boolean) => {
    if (!newOpen && hasUnsavedChanges()) {
      const alreadyPosted = entryToEdit?.is_posted || entryToEdit?.status === 'contabilizado';
      if (alreadyPosted) {
        await cleanupDraftEntry();
        onOpenChange(false);
        return;
      }
      setShowCloseConfirm(true);
    } else {
      if (!newOpen) {
        await cleanupDraftEntry();
      }
      onOpenChange(newOpen);
    }
  }, [hasUnsavedChanges, onOpenChange, entryToEdit]);

  const getTotalDebit = () => detailLines.reduce((sum, l) => sum + (l.debit_amount || 0), 0);
  const getTotalCredit = () => detailLines.reduce((sum, l) => sum + (l.credit_amount || 0), 0);
  const isBalanced = () => { const d = getTotalDebit(), c = getTotalCredit(); return Math.abs(d - c) < 0.01 && d > 0; };

  // Imbalance amount for draft warnings
  const getImbalanceAmount = () => {
    const d = getTotalDebit(), c = getTotalCredit();
    return Math.round((d - c) * 100) / 100;
  };

  const isLineComplete = (line: DetailLine) =>
    !!line.account_id && (line.debit_amount > 0 || line.credit_amount > 0);

  const addLine = () => {
    // Find an existing incomplete non-bank line
    const incompleteLine = detailLines.find(l => !l.is_bank_line && !isLineComplete(l));
    if (incompleteLine) {
      // Focus the incomplete line instead of creating a new one
      setActiveLineId(incompleteLine.id);
      setTimeout(() => setAccountPopoverOpen(prev => ({ ...prev, [incompleteLine.id]: true })), 50);
      toast({ title: "Completa la línea actual", description: "Selecciona cuenta e ingresa monto antes de agregar otra línea." });
      return;
    }

    const newLineId = crypto.randomUUID();
    setDetailLines(prev => {
      const bankIdx = prev.findIndex(l => l.is_bank_line);
      const newLine: DetailLine = { id: newLineId, account_id: null, description: headerDescription, cost_center: "", debit_amount: 0, credit_amount: 0 };
      if (bankIdx !== -1) {
        const copy = [...prev];
        copy.splice(bankIdx, 0, newLine);
        return copy;
      }
      return [...prev, newLine];
    });
    setActiveLineId(newLineId);
    setTimeout(() => setAccountPopoverOpen(prev => ({ ...prev, [newLineId]: true })), 50);
  };

  const removeLine = (id: string) => {
    const line = detailLines.find(l => l.id === id);
    if (line?.is_bank_line) {
      toast({ title: "Línea protegida", description: "La línea bancaria se gestiona automáticamente. Para eliminarla, quite la cuenta bancaria del encabezado.", variant: "destructive" });
      return;
    }
    const nonBankLines = detailLines.filter(l => !l.is_bank_line);
    if (nonBankLines.length <= 1) {
      // Reset line instead of removing it
      const newLineId = crypto.randomUUID();
      setDetailLines(prev => prev.map(l => l.id === id ? { id: newLineId, account_id: null, description: headerDescription, cost_center: "", debit_amount: 0, credit_amount: 0 } : l));
      setActiveLineId(newLineId);
      setTimeout(() => setAccountPopoverOpen(prev => ({ ...prev, [newLineId]: true })), 50);
      return;
    }
    setDetailLines(detailLines.filter(l => l.id !== id));
  };

  const updateLine = (id: string, field: keyof DetailLine, value: any) => {
    const line = detailLines.find(l => l.id === id);
    if (line?.is_bank_line && field === 'account_id') return;

    setDetailLines(lines => {
      const updated = lines.map(l => l.id === id ? { ...l, [field]: value } : l);
      const idx = updated.findIndex(l => l.id === id);
      if (idx === updated.length - 1 && !updated[idx].is_bank_line && (field === "debit_amount" || field === "credit_amount") && value > 0) {
        const bankIdx = updated.findIndex(l => l.is_bank_line);
        const newLine: DetailLine = { id: crypto.randomUUID(), account_id: null, description: headerDescription, cost_center: "", debit_amount: 0, credit_amount: 0 };
        if (bankIdx !== -1) {
          updated.splice(bankIdx, 0, newLine);
        } else {
          updated.push(newLine);
        }
      }
      return updated;
    });
  };

  // ─── Auto-draft creation ──────────────────────────────────────────
  const ensureDraftEntry = async (): Promise<number> => {
    if (draftEntryIdRef.current) return draftEntryIdRef.current;
    if (entryToEdit) return entryToEdit.id;

    const enterpriseId = localStorage.getItem("currentEnterpriseId");
    if (!enterpriseId) throw new Error("Sin empresa seleccionada");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No autenticado");

    // Use a temporary non-sequential number for auto-drafts (number assigned on save)
    const tempNumber = `DRAFT-${Date.now()}`;

    const bankDirectionValue = bankAccountId ? bankDirection : null;

    const { data: entry, error } = await supabase.from("tab_journal_entries").insert({
      enterprise_id: parseInt(enterpriseId),
      entry_number: tempNumber,
      entry_date: entryDate,
      entry_type: entryType,
      accounting_period_id: periodId,
      description: headerDescription || 'Borrador (sin líneas)',
      bank_account_id: bankAccountId || null,
      bank_reference: bankReference || null,
      beneficiary_name: beneficiaryName || null,
      bank_direction: bankDirectionValue,
      total_debit: 0,
      total_credit: 0,
      is_posted: false,
      status: 'borrador',
      created_by: user.id,
    } as any).select().single();

    if (error) throw error;
    draftEntryIdRef.current = entry.id;
    return entry.id;
  };

  // ─── Regenerate journal lines from linked purchases ───────────────
  const regenerateLinesFromLinkedPurchases = async (entryId: number) => {
    const enterpriseId = localStorage.getItem("currentEnterpriseId");
    if (!enterpriseId) return;

    // Fetch linked purchase IDs
    const { data: links } = await supabase
      .from("tab_purchase_journal_links" as any)
      .select("purchase_id")
      .eq("journal_entry_id", entryId);

    const purchaseIds = (links || []).map((l: any) => l.purchase_id);

    if (purchaseIds.length === 0) {
      // Remove purchase-sourced lines, ensure minimum lines remain
      setDetailLines(prev => {
        const filtered = prev.filter(l => l.source_type !== 'PURCHASE');
        while (filtered.filter(l => !l.is_bank_line).length < 2) {
          filtered.push({ id: crypto.randomUUID(), account_id: null, description: "", cost_center: "", debit_amount: 0, credit_amount: 0 });
        }
        return filtered;
      });
      return;
    }

    const [{ data: purchases }, { data: felDocTypes }] = await Promise.all([
      supabase
        .from("tab_purchase_ledger")
        .select("*")
        .in("id", purchaseIds)
        .is("deleted_at", null),
      supabase
        .from("tab_fel_document_types")
        .select("code, affects_total, applies_vat")
        .eq("is_active", true),
    ]);

    if (!purchases || purchases.length === 0) return;

    // Build lookup for FEL document type multipliers and VAT applicability
    const docTypeMap: Record<string, { multiplier: number; appliesVat: boolean }> = {};
    (felDocTypes || []).forEach((dt: any) => {
      docTypeMap[dt.code] = { multiplier: dt.affects_total ?? 1, appliesVat: dt.applies_vat ?? true };
    });

    // Exempt document types that don't generate IVA crédito fiscal
    const exemptDocTypes = ['FPEQ', 'FESP', 'NABN', 'RDON', 'RECI'];

    // Load enterprise config for VAT and supplier accounts
    const { data: configData } = await supabase
      .from("tab_enterprise_config")
      .select("*")
      .eq("enterprise_id", parseInt(enterpriseId))
      .maybeSingle();

    const generatedLines: DetailLine[] = [];
    const expensesByAccount: Record<number, { total: number; descriptions: string[]; refs: string[] }> = {};
    let totalVat = 0;
    let totalAmount = 0;

    for (const p of purchases) {
      const docType = p.fel_document_type || 'FACT';
      const { multiplier, appliesVat } = docTypeMap[docType] || { multiplier: 1, appliesVat: true };
      const isExempt = exemptDocTypes.includes(docType) || !appliesVat;
      const ref = `${docType} ${p.invoice_series ? p.invoice_series + '-' : ''}${p.invoice_number}`;

      // Apply multiplier (e.g. NCRE has multiplier -1)
      const effectiveVat = isExempt ? 0 : (p.vat_amount || 0) * multiplier;
      const effectiveTotal = (p.total_amount || 0) * multiplier;

      totalVat += effectiveVat;
      totalAmount += effectiveTotal;

      if (p.expense_account_id) {
        if (!expensesByAccount[p.expense_account_id]) {
          expensesByAccount[p.expense_account_id] = { total: 0, descriptions: [], refs: [] };
        }
        const baseAmount = p.base_amount || p.net_amount || (p.total_amount - (p.vat_amount || 0));
        const idpAmount = p.idp_amount || 0;
        // For exempt docs, the full amount goes to expense (no VAT separation)
        const expenseAmount = isExempt
          ? (p.total_amount || 0) * multiplier
          : (baseAmount + idpAmount) * multiplier;
        expensesByAccount[p.expense_account_id].total += expenseAmount;
        expensesByAccount[p.expense_account_id].descriptions.push(`${p.supplier_name} - Fact. ${ref}`);
        expensesByAccount[p.expense_account_id].refs.push(ref);
      }
    }

    // Expense lines — split into debit and credit based on sign
    for (const [accountId, data] of Object.entries(expensesByAccount)) {
      const amount = Number(data.total.toFixed(2));
      generatedLines.push({
        id: crypto.randomUUID(),
        account_id: Number(accountId),
        description: data.descriptions.join('; '),
        cost_center: "",
        debit_amount: amount >= 0 ? amount : 0,
        credit_amount: amount < 0 ? Math.abs(amount) : 0,
        source_type: 'PURCHASE',
        source_ref: data.refs.join(', '),
      });
    }

    // IVA line (debit) — only for non-exempt purchases
    if (totalVat > 0 && configData?.vat_credit_account_id) {
      const vatPurchaseRefs = purchases
        .filter(p => !exemptDocTypes.includes(p.fel_document_type || 'FACT'))
        .map(p => `${p.fel_document_type} ${p.invoice_series ? p.invoice_series + '-' : ''}${p.invoice_number}`);
      generatedLines.push({
        id: crypto.randomUUID(),
        account_id: configData.vat_credit_account_id,
        description: `IVA Crédito Fiscal - ${vatPurchaseRefs.length} factura(s)`,
        cost_center: "",
        debit_amount: Number(totalVat.toFixed(2)),
        credit_amount: 0,
        source_type: 'PURCHASE',
        source_ref: vatPurchaseRefs.join(', '),
      });
    }

    // Supplier line (credit) — only if no bank account selected
    if (!bankAccountId && configData?.suppliers_account_id) {
      const creditAmount = Number(totalAmount.toFixed(2));
      generatedLines.push({
        id: crypto.randomUUID(),
        account_id: configData.suppliers_account_id,
        description: `Proveedores - ${purchases.length} factura(s)`,
        cost_center: "",
        debit_amount: creditAmount < 0 ? Math.abs(creditAmount) : 0,
        credit_amount: creditAmount >= 0 ? creditAmount : 0,
        source_type: 'PURCHASE',
        source_ref: purchases.map(p => `${p.fel_document_type} ${p.invoice_number}`).join(', '),
      });
    }

    // Merge: keep non-purchase, non-bank lines; replace purchase lines
    const nonPurchaseLines = detailLines.filter(l => l.source_type !== 'PURCHASE' && !l.is_bank_line);
    const otherLines = nonPurchaseLines.filter(l => l.account_id !== null || l.debit_amount > 0 || l.credit_amount > 0);
    const merged = otherLines.length === 0 ? generatedLines : [...otherLines, ...generatedLines];

    // Enforce bank line invariant
    const enforced = enforceBankLineInvariant(merged, bankAccountId, bankDirection, {
      headerDescription,
      beneficiaryName,
      bankReference,
    });
    setDetailLines(enforced);

    // Auto-populate document_references from linked purchases
    const refs = purchases.map(p => {
      const series = p.invoice_series ? `${p.invoice_series}-` : '';
      return `${series}${p.invoice_number}`;
    });
    setDocumentReferences(refs);
  };

  /** Minimal validation for draft save — very permissive */
  const validateDraft = () => {
    // Only require a period if one is available
    if (periods.length > 0 && !periodId) {
      toast({ title: "Período requerido", description: "Debes seleccionar un período contable", variant: "destructive" });
      return false;
    }
    if (bankRefDuplicate) {
      toast({ title: "Referencia bancaria duplicada", description: `Ya existe la partida ${bankRefDuplicate.entryNumber} con esta referencia para esta cuenta bancaria.`, variant: "destructive" });
      return false;
    }
    return true;
  };

  /** Strict validation for posting (Contabilizar) */
  const validateForPosting = () => {
    if (!headerDescription.trim()) { toast({ title: "Descripción requerida", description: "Debes ingresar una descripción general", variant: "destructive" }); return false; }
    if (!periodId) { toast({ title: "Período requerido", description: "Debes seleccionar un período contable", variant: "destructive" }); return false; }

    if (bankRefDuplicate) {
      toast({ title: "Referencia bancaria duplicada", description: `Ya existe la partida ${bankRefDuplicate.entryNumber} con esta referencia para esta cuenta bancaria.`, variant: "destructive" });
      return false;
    }

    if (bankAccountId) {
      const bankLines = detailLines.filter(l => l.is_bank_line);
      if (bankLines.length !== 1) { toast({ title: "Error en línea bancaria", description: "Debe existir exactamente una línea bancaria cuando hay cuenta bancaria seleccionada.", variant: "destructive" }); return false; }
      const bl = bankLines[0];
      if (bl.account_id !== bankAccountId) { toast({ title: "Error en línea bancaria", description: "La cuenta de la línea bancaria no coincide con la cuenta bancaria seleccionada.", variant: "destructive" }); return false; }
    }

    const validLines = detailLines.filter(l => l.account_id !== null || l.debit_amount > 0 || l.credit_amount > 0);
    if (validLines.length < 2) { toast({ title: "Líneas insuficientes", description: "Una partida debe tener al menos 2 líneas de detalle para contabilizar", variant: "destructive" }); return false; }
    for (const line of validLines) {
      if (!line.account_id && (line.debit_amount > 0 || line.credit_amount > 0)) { toast({ title: "Cuenta requerida", description: "Hay líneas con monto que no tienen cuenta asignada", variant: "destructive" }); return false; }
      if (line.account_id && line.debit_amount === 0 && line.credit_amount === 0 && !line.is_bank_line) { toast({ title: "Monto requerido", description: "Hay líneas con cuenta asignada que no tienen monto", variant: "destructive" }); return false; }
      const acc = accounts.find(a => a.id === line.account_id);
      if (acc?.requires_cost_center && !line.cost_center.trim()) { toast({ title: "Centro de costo requerido", description: `La cuenta ${acc.account_code} requiere centro de costo`, variant: "destructive" }); return false; }
      if (line.debit_amount > 0 && line.credit_amount > 0) { toast({ title: "Debe o haber", description: "Una línea no puede tener monto en debe y haber al mismo tiempo", variant: "destructive" }); return false; }
    }

    if (!isBalanced()) {
      toast({ title: "Partida desbalanceada", description: "El debe y el haber deben ser iguales para contabilizar", variant: "destructive" });
      return false;
    }

    return true;
  };

  const saveEntry = async (post: boolean) => {
    // Use permissive validation for drafts, strict for posting
    if (post) {
      if (!validateForPosting()) return;
    } else {
      if (!validateDraft()) return;
    }

    const enterpriseId = localStorage.getItem("currentEnterpriseId");
    if (!enterpriseId) return;

    // ── Fresh duplicate bank-ref check before save ──────────────────
    if (bankAccountId && bankReference.trim()) {
      let dupQuery = supabase.from("tab_journal_entries")
        .select("id, entry_number")
        .eq("enterprise_id", parseInt(enterpriseId))
        .eq("bank_account_id", bankAccountId)
        .eq("bank_reference", bankReference.trim())
        .neq("status", "anulado")
        .is("deleted_at", null)
        .not("entry_number", "like", "REV-%")
        .limit(1);

      const currentId = entryToEdit?.id || draftEntryIdRef.current;
      if (currentId) dupQuery = dupQuery.neq("id", currentId);

      const { data: dupRow } = await dupQuery.maybeSingle();
      if (dupRow) {
        setBankRefDuplicate({ entryNumber: dupRow.entry_number, entryId: dupRow.id });
        toast({ title: "Referencia bancaria duplicada", description: `Ya existe la partida ${dupRow.entry_number} con esta referencia para esta cuenta bancaria.`, variant: "destructive" });
        return;
      }
      setBankRefDuplicate(null);
    }

    // Set loading immediately for instant UI feedback
    setLoading(true);

    try {
    // Overdraft check — only on posting
    if (post) {
      const validLines = detailLines.filter(l => l.account_id !== null);
      for (const line of validLines) {
        const account = accounts.find(a => a.id === line.account_id);
        if (!account || account.balance_type === 'indiferente') continue;
        let query = supabase.from("tab_journal_entry_details").select("debit_amount, credit_amount").eq("account_id", line.account_id);
        // Only consider posted entries for overdraft check
        const { data: postedEntryIds } = await supabase.from("tab_journal_entries")
          .select("id").eq("enterprise_id", parseInt(enterpriseId)).eq("is_posted", true).is("deleted_at", null);
        const postedIds = (postedEntryIds || []).map(e => e.id);
        const currentEntryId = entryToEdit?.id || draftEntryIdRef.current;
        if (currentEntryId) {
          const idx = postedIds.indexOf(currentEntryId);
          if (idx !== -1) postedIds.splice(idx, 1);
        }
        if (postedIds.length === 0) continue;
        const { data: movements } = await supabase.from("tab_journal_entry_details")
          .select("debit_amount, credit_amount").eq("account_id", line.account_id).in("journal_entry_id", postedIds);
        const currentBalance = (movements || []).reduce((acc, m) => acc + (Number(m.debit_amount) || 0) - (Number(m.credit_amount) || 0), 0);
        const newBalance = Math.round((currentBalance + (Number(line.debit_amount) || 0) - (Number(line.credit_amount) || 0)) * 100) / 100;
        if (account.balance_type === 'deudor' && newBalance < 0) { setLoading(false); toast({ title: "Sobregiro detectado", description: `La cuenta ${account.account_code} - ${account.account_name} no tiene saldos suficientes. Saldo actual: ${formatCurrency(currentBalance)}.`, variant: "destructive" }); return; }
        if (account.balance_type === 'acreedor' && newBalance > 0) { setLoading(false); toast({ title: "Sobregiro detectado", description: `La cuenta ${account.account_code} - ${account.account_name} no tiene saldos suficientes. Saldo actual: ${formatCurrency(Math.abs(currentBalance))}.`, variant: "destructive" }); return; }
      }
    }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuario no autenticado");

      const bankDirectionValue = bankAccountId ? bankDirection : null;

      const buildLineInserts = (targetEntryId: number) => {
        // For drafts, only insert lines that have meaningful data
        const meaningfulLines = detailLines.filter(l =>
          l.account_id !== null || l.debit_amount > 0 || l.credit_amount > 0 || l.is_bank_line
        );
        return meaningfulLines.map((l, i) => ({
          journal_entry_id: targetEntryId, line_number: i + 1, account_id: l.account_id,
          description: l.description || headerDescription || '', cost_center: l.cost_center || null,
          debit_amount: l.debit_amount, credit_amount: l.credit_amount,
          is_bank_line: l.is_bank_line || false,
          source_type: l.source_type || null, source_id: l.source_id || null, source_ref: l.source_ref || null,
        } as any));
      };

      if (entryToEdit) {
        // ─── Existing entry: update ─────────────────────────────
        // Step 1: Update header as draft first (avoid trigger rejecting empty lines)
        const { error: updateError } = await supabase.from("tab_journal_entries").update({
          entry_date: entryDate, entry_type: entryType, accounting_period_id: periodId,
          document_reference: documentReference || null, description: headerDescription,
          document_references: documentReferences.length > 0 ? documentReferences : null,
          bank_account_id: bankAccountId || null, bank_reference: bankReference || null,
          beneficiary_name: beneficiaryName || null, bank_direction: bankDirectionValue,
          total_debit: getTotalDebit(), total_credit: getTotalCredit(),
          is_posted: false, posted_at: null,
          updated_by: user.id, updated_at: new Date().toISOString(), status: 'borrador',
        } as any).eq("id", entryToEdit.id);
        if (updateError) throw updateError;

        // Step 2: Replace lines
        await supabase.from("tab_journal_entry_details").delete().eq("journal_entry_id", entryToEdit.id);
        const lineInserts = buildLineInserts(entryToEdit.id);
        if (lineInserts.length > 0) {
          const { error: insertError } = await supabase.from("tab_journal_entry_details").insert(lineInserts);
          if (insertError) throw insertError;
        }

        // Step 3: Post if requested (lines exist now)
        if (post) {
          const { error: postError } = await supabase.from("tab_journal_entries").update({
            is_posted: true, posted_at: new Date().toISOString(), status: 'contabilizado',
          } as any).eq("id", entryToEdit.id);
          if (postError) throw postError;
        }
        toast({ title: "Partida actualizada", description: `Partida ${nextEntryNumber} actualizada exitosamente` });
        onSuccess(entryToEdit.id);

      } else if (draftEntryIdRef.current) {
        // ─── Draft entry: allocate real number now and update ─────────
        const draftId = draftEntryIdRef.current;
        const finalEntryNumber = await allocateEntryNumber(enterpriseId, entryType, entryDate);
        setNextEntryNumber(finalEntryNumber);

        // Step 1: Update header as draft (without posting yet)
        const { error: updateError } = await supabase.from("tab_journal_entries").update({
          entry_number: finalEntryNumber,
          entry_date: entryDate, entry_type: entryType, accounting_period_id: periodId,
          document_reference: documentReference || null, description: headerDescription,
          document_references: documentReferences.length > 0 ? documentReferences : null,
          bank_account_id: bankAccountId || null, bank_reference: bankReference || null,
          beneficiary_name: beneficiaryName || null, bank_direction: bankDirectionValue,
          total_debit: getTotalDebit(), total_credit: getTotalCredit(),
          is_posted: false, posted_at: null,
          updated_by: user.id, updated_at: new Date().toISOString(),
          status: 'borrador',
        } as any).eq("id", draftId);
        if (updateError) throw updateError;

        // Step 2: Delete old lines and insert new ones
        await supabase.from("tab_journal_entry_details").delete().eq("journal_entry_id", draftId);
        const draftLineInserts = buildLineInserts(draftId);
        if (draftLineInserts.length > 0) {
          const { error: insertError } = await supabase.from("tab_journal_entry_details").insert(draftLineInserts);
          if (insertError) throw insertError;
        }

        // Step 3: Now post if requested (lines exist at this point)
        if (post) {
          const { error: postError } = await supabase.from("tab_journal_entries").update({
            is_posted: true, posted_at: new Date().toISOString(), status: 'contabilizado',
          } as any).eq("id", draftId);
          if (postError) throw postError;
        }

        toast({ title: post ? "Partida contabilizada" : "Borrador guardado", description: `Partida ${finalEntryNumber} ${post ? 'contabilizada' : 'guardada'} exitosamente` });
        onSuccess(draftId);

      } else {
        // ─── Brand new entry: insert header → lines → post ──────
        let finalEntryNumber = await allocateEntryNumber(enterpriseId, entryType, entryDate);
        setNextEntryNumber(finalEntryNumber);

        const { data: entry, error: entryError } = await supabase.from("tab_journal_entries").insert({
          enterprise_id: parseInt(enterpriseId), entry_number: finalEntryNumber, entry_date: entryDate,
          entry_type: entryType, accounting_period_id: periodId, document_reference: documentReference || null,
          description: headerDescription, document_references: documentReferences.length > 0 ? documentReferences : null,
          bank_account_id: bankAccountId || null, bank_reference: bankReference || null,
          beneficiary_name: beneficiaryName || null, bank_direction: bankDirectionValue,
          total_debit: getTotalDebit(), total_credit: getTotalCredit(),
          is_posted: false, posted_at: null, created_by: user.id,
          status: 'borrador',
        } as any).select().single();
        if (entryError) throw entryError;

        const newLineInserts = buildLineInserts(entry.id);
        if (newLineInserts.length > 0) {
          const { error: detailsError } = await supabase.from("tab_journal_entry_details").insert(newLineInserts);
          if (detailsError) throw detailsError;
        }

        if (post) {
          const { error: postError } = await supabase.from("tab_journal_entries").update({
            is_posted: true, posted_at: new Date().toISOString(), status: 'contabilizado',
          } as any).eq("id", entry.id);
          if (postError) throw postError;
        }

        toast({ title: post ? "Partida contabilizada" : "Borrador guardado", description: `Partida ${finalEntryNumber} ${post ? 'contabilizada' : 'guardada'} exitosamente` });
        onSuccess(entry.id);
      }

      draftEntryIdRef.current = null;
      onOpenChange(false);
    } catch (error: unknown) {
      toast({ title: "Error al guardar", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const cleanupDraftEntry = async () => {
    if (!draftEntryIdRef.current) return;
    try {
      const draftId = draftEntryIdRef.current;
      await supabase.from("tab_purchase_journal_links" as any).delete().eq("journal_entry_id", draftId);
      // Also unlink purchases that were linked to this draft
      await supabase.from("tab_purchase_ledger").update({ journal_entry_id: null } as any).eq("journal_entry_id", draftId);
      await supabase.from("tab_journal_entry_details").delete().eq("journal_entry_id", draftId);
      await supabase.from("tab_journal_entries").delete().eq("id", draftId);
    } catch (e) {
      console.error("Error cleaning up draft:", e);
    }
    draftEntryIdRef.current = null;
  };

  return {
    // State
    loading, isLoadingEntry, accounts, periods, nextEntryNumber,
    entryDate, setEntryDate, entryType, setEntryType, periodId, setPeriodId,
    documentReference, setDocumentReference, headerDescription, setHeaderDescription,
    documentReferences, setDocumentReferences,
    bankAccountId, setBankAccountId, bankReference, setBankReference,
    beneficiaryName, setBeneficiaryName, bankDirection, setBankDirection, detailLines,
    accountSearch, setAccountSearch, accountPopoverOpen, setAccountPopoverOpen,
    showCloseConfirm, setShowCloseConfirm, showRejectDialog, setShowRejectDialog,
    rejectionReason, setRejectionReason, entryStatus,
    isReadOnly, auditInfo, activeLineId, setActiveLineId,
    showStickyHeader, headerRef,
    bankRefDuplicate, bankRefChecking, checkDuplicateBankRef,
    // Computed
    getTotalDebit, getTotalCredit, isBalanced, getImbalanceAmount,
    // Draft support
    get draftEntryId() { return draftEntryIdRef.current; },
    ensureDraftEntry,
    regenerateLinesFromLinkedPurchases,
    getEntryId: () => entryToEdit?.id || draftEntryIdRef.current,
    // Actions
    addLine, removeLine, updateLine,
    handleCloseAttempt, saveEntry, propagateDescriptionToLines,
    handleDiscardAndClose: async () => {
      setShowCloseConfirm(false);
      await cleanupDraftEntry();
      resetForm();
      onOpenChange(false);
    },
    handleSaveDraftAndClose: async () => { setShowCloseConfirm(false); await saveEntry(false); },
    permissions, formatDateTime,
  };
}
