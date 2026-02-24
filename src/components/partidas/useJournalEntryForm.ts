import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { previewNextEntryNumber, allocateEntryNumber } from "@/utils/journalEntryNumbering";
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
  const [showLinkedPurchasesModal, setShowLinkedPurchasesModal] = useState(false);
  const [linkedPurchases, setLinkedPurchases] = useState<any[]>([]);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [auditInfo, setAuditInfo] = useState<AuditInfo | null>(null);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [showStickyHeader, setShowStickyHeader] = useState(false);

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
    setDocumentReference(""); setHeaderDescription(""); setBankAccountId(null);
    setBankReference(""); setBeneficiaryName(""); setBankDirection('OUT'); setDetailLines([]);
    setAuditInfo(null); setEntryStatus('borrador'); setAccountSearch({});
    setIsReadOnly(false); setActiveLineId(null); setLinkedPurchases([]);
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
    setDocumentReference(""); setHeaderDescription(""); setBankAccountId(null);
    setBankReference(""); setBeneficiaryName(""); setBankDirection('OUT'); setDetailLines(freshLines);
    setShowCloseConfirm(false); setShowRejectDialog(false); setRejectionReason("");
    setEntryStatus('borrador'); setActiveLineId(freshLines[0]?.id || null); setLinkedPurchases([]);
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
      const nextNumber = await previewNextEntryNumber(enterpriseId, entryType, entryDate);
      setNextEntryNumber(nextNumber);
    } catch (error: any) {
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
        const dir = (entry as any).bank_direction || 'OUT';
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
    } catch (error: any) {
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

  useEffect(() => {
    if (!open || entryToEdit || !entryDate || !entryType) return;
    const enterpriseId = localStorage.getItem("currentEnterpriseId");
    if (!enterpriseId) return;
    previewNextEntryNumber(enterpriseId, entryType, entryDate)
      .then(setNextEntryNumber)
      .catch(console.error);
  }, [open, entryToEdit, entryType, entryDate]);

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
  // Enforce exactly one bank line whenever bankAccountId, bankDirection, or non-bank line amounts change
  useEffect(() => {
    if (!open || isLoadingEntry) return;

    setDetailLines(prev => {
      const next = enforceBankLineInvariant(prev, bankAccountId, bankDirection, {
        headerDescription,
        beneficiaryName,
        bankReference,
      });
      // Cheap identity check to avoid infinite loops
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

  const propagateDescriptionToLines = useCallback(() => {
    if (headerDescription && !entryToEdit) {
      setDetailLines(lines => lines.map(line => line.is_bank_line ? line : ({ ...line, description: line.description === "" ? headerDescription : line.description })));
    }
  }, [headerDescription, entryToEdit]);

  const hasUnsavedChanges = useCallback(() => {
    if (!initialSnapshotRef.current) return false;
    return serializeForDirtyCheck({ entryDate, entryType, periodId, documentReference, headerDescription, detailLines: detailLines.map(({ id, ...rest }) => rest) }) !== initialSnapshotRef.current;
  }, [detailLines, documentReference, entryDate, entryType, headerDescription, periodId, serializeForDirtyCheck]);

  const handleCloseAttempt = useCallback((newOpen: boolean) => {
    if (!newOpen && hasUnsavedChanges()) {
      // If entry is already posted, don't offer "save as draft" — just close
      const alreadyPosted = entryToEdit?.is_posted || entryToEdit?.status === 'contabilizado';
      if (alreadyPosted) {
        onOpenChange(false);
        return;
      }
      setShowCloseConfirm(true);
    } else {
      onOpenChange(newOpen);
    }
  }, [hasUnsavedChanges, onOpenChange, entryToEdit]);

  const getTotalDebit = () => detailLines.reduce((sum, l) => sum + (l.debit_amount || 0), 0);
  const getTotalCredit = () => detailLines.reduce((sum, l) => sum + (l.credit_amount || 0), 0);
  const isBalanced = () => { const d = getTotalDebit(), c = getTotalCredit(); return Math.abs(d - c) < 0.01 && d > 0; };

  const addLine = () => {
    const newLineId = crypto.randomUUID();
    setDetailLines(prev => {
      // Insert before bank line if it exists
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
      toast({ title: "Mínimo requerido", description: "Debe haber al menos 1 línea de detalle además de la línea bancaria.", variant: "destructive" });
      return;
    }
    setDetailLines(detailLines.filter(l => l.id !== id));
  };

  const updateLine = (id: string, field: keyof DetailLine, value: any) => {
    const line = detailLines.find(l => l.id === id);
    // Protect bank line from account changes
    if (line?.is_bank_line && field === 'account_id') return;

    setDetailLines(lines => {
      const updated = lines.map(l => l.id === id ? { ...l, [field]: value } : l);
      const idx = updated.findIndex(l => l.id === id);
      if (idx === updated.length - 1 && !updated[idx].is_bank_line && (field === "debit_amount" || field === "credit_amount") && value > 0) {
        // Insert new line before bank line
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

  const handlePurchasesPosted = (newLines: DetailLine[], purchases?: any[]) => {
    if (purchases) setLinkedPurchases(purchases);
    // Filter out any purchase-generated line that uses the bank GL account
    const filteredNewLines = bankAccountId
      ? newLines.filter(l => l.account_id !== bankAccountId)
      : newLines;

    // Remove any previous purchase-sourced lines to avoid duplicates on re-contabilizar
    const nonPurchaseLines = detailLines.filter(l => l.is_bank_line || l.source_type !== 'PURCHASE');
    const otherLines = nonPurchaseLines.filter(l => !l.is_bank_line && (l.account_id !== null || l.debit_amount > 0 || l.credit_amount > 0));
    const merged = otherLines.length === 0 ? filteredNewLines : [...otherLines, ...filteredNewLines];

    // Run invariant to ensure exactly one bank line with correct amount
    const enforced = enforceBankLineInvariant(merged, bankAccountId, bankDirection, {
      headerDescription,
      beneficiaryName,
      bankReference,
    });
    setDetailLines(enforced);
  };

  const validateEntry = () => {
    if (!headerDescription.trim()) { toast({ title: "Descripción requerida", description: "Debes ingresar una descripción general", variant: "destructive" }); return false; }
    if (!periodId) { toast({ title: "Período requerido", description: "Debes seleccionar un período contable", variant: "destructive" }); return false; }

    // Bank validation
    if (bankAccountId) {
      const bankLines = detailLines.filter(l => l.is_bank_line);
      if (bankLines.length !== 1) { toast({ title: "Error en línea bancaria", description: "Debe existir exactamente una línea bancaria cuando hay cuenta bancaria seleccionada.", variant: "destructive" }); return false; }
      const bl = bankLines[0];
      if (bl.account_id !== bankAccountId) { toast({ title: "Error en línea bancaria", description: "La cuenta de la línea bancaria no coincide con la cuenta bancaria seleccionada.", variant: "destructive" }); return false; }
    }

    const validLines = detailLines.filter(l => l.account_id !== null || l.debit_amount > 0 || l.credit_amount > 0);
    setDetailLines(validLines.length >= 2 ? validLines : detailLines);
    if (validLines.length < 2) { toast({ title: "Líneas insuficientes", description: "Una partida debe tener al menos 2 líneas de detalle", variant: "destructive" }); return false; }
    for (const line of validLines) {
      if (!line.account_id && (line.debit_amount > 0 || line.credit_amount > 0)) { toast({ title: "Cuenta requerida", description: "Hay líneas con monto que no tienen cuenta asignada", variant: "destructive" }); return false; }
      if (line.account_id && line.debit_amount === 0 && line.credit_amount === 0 && !line.is_bank_line) { toast({ title: "Monto requerido", description: "Hay líneas con cuenta asignada que no tienen monto", variant: "destructive" }); return false; }
      const acc = accounts.find(a => a.id === line.account_id);
      if (acc?.requires_cost_center && !line.cost_center.trim()) { toast({ title: "Centro de costo requerido", description: `La cuenta ${acc.account_code} requiere centro de costo`, variant: "destructive" }); return false; }
      if (line.debit_amount > 0 && line.credit_amount > 0) { toast({ title: "Debe o haber", description: "Una línea no puede tener monto en debe y haber al mismo tiempo", variant: "destructive" }); return false; }
    }
    return true;
  };

  const saveEntry = async (post: boolean) => {
    if (!validateEntry()) return;
    if (post && !isBalanced()) { toast({ title: "Partida desbalanceada", description: "El debe y el haber deben ser iguales para contabilizar", variant: "destructive" }); return; }
    const enterpriseId = localStorage.getItem("currentEnterpriseId");
    if (!enterpriseId) return;

    // Overdraft check
    const validLines = detailLines.filter(l => l.account_id !== null);
    for (const line of validLines) {
      const account = accounts.find(a => a.id === line.account_id);
      if (!account || account.balance_type === 'indiferente') continue;
      let query = supabase.from("tab_journal_entry_details").select("debit_amount, credit_amount").eq("account_id", line.account_id);
      if (entryToEdit?.id) query = query.neq("journal_entry_id", entryToEdit.id);
      const { data: movements } = await query;
      const currentBalance = (movements || []).reduce((acc, m) => acc + (Number(m.debit_amount) || 0) - (Number(m.credit_amount) || 0), 0);
      const newBalance = Math.round((currentBalance + (Number(line.debit_amount) || 0) - (Number(line.credit_amount) || 0)) * 100) / 100;
      if (account.balance_type === 'deudor' && newBalance < 0) { toast({ title: "Sobregiro detectado", description: `La cuenta ${account.account_code} - ${account.account_name} no tiene saldos suficientes. Saldo actual: ${formatCurrency(currentBalance)}.`, variant: "destructive" }); return; }
      if (account.balance_type === 'acreedor' && newBalance > 0) { toast({ title: "Sobregiro detectado", description: `La cuenta ${account.account_code} - ${account.account_name} no tiene saldos suficientes. Saldo actual: ${formatCurrency(Math.abs(currentBalance))}.`, variant: "destructive" }); return; }
    }

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuario no autenticado");

      const bankDirectionValue = bankAccountId ? bankDirection : null;

      if (entryToEdit) {
        const { error: updateError } = await supabase.from("tab_journal_entries").update({
          entry_date: entryDate, entry_type: entryType, accounting_period_id: periodId,
          document_reference: documentReference || null, description: headerDescription,
          bank_account_id: bankAccountId || null, bank_reference: bankReference || null,
          beneficiary_name: beneficiaryName || null, bank_direction: bankDirectionValue,
          total_debit: getTotalDebit(), total_credit: getTotalCredit(),
          is_posted: post, posted_at: post ? new Date().toISOString() : null,
          updated_by: user.id, updated_at: new Date().toISOString(), status: post ? 'contabilizado' : 'borrador',
        } as any).eq("id", entryToEdit.id);
        if (updateError) throw updateError;
        await supabase.from("tab_journal_entry_details").delete().eq("journal_entry_id", entryToEdit.id);
        const { error: insertError } = await supabase.from("tab_journal_entry_details").insert(
          detailLines.map((l, i) => ({
            journal_entry_id: entryToEdit.id, line_number: i + 1, account_id: l.account_id,
            description: l.description || headerDescription, cost_center: l.cost_center || null,
            debit_amount: l.debit_amount, credit_amount: l.credit_amount,
            is_bank_line: l.is_bank_line || false,
            source_type: l.source_type || null, source_id: l.source_id || null, source_ref: l.source_ref || null,
          } as any))
        );
        if (insertError) throw insertError;
        toast({ title: "Partida actualizada", description: `Partida ${nextEntryNumber} actualizada exitosamente` });
        onSuccess(entryToEdit.id);
      } else {
        // Atomically allocate the entry number server-side
        let finalEntryNumber = await allocateEntryNumber(enterpriseId, entryType, entryDate);
        setNextEntryNumber(finalEntryNumber);
        // Always insert as draft first, then add lines, then post if needed
        const { data: entry, error: entryError } = await supabase.from("tab_journal_entries").insert({
          enterprise_id: parseInt(enterpriseId), entry_number: finalEntryNumber, entry_date: entryDate,
          entry_type: entryType, accounting_period_id: periodId, document_reference: documentReference || null,
          description: headerDescription, bank_account_id: bankAccountId || null, bank_reference: bankReference || null,
          beneficiary_name: beneficiaryName || null, bank_direction: bankDirectionValue,
          total_debit: getTotalDebit(), total_credit: getTotalCredit(),
          is_posted: false, posted_at: null, created_by: user.id,
          status: 'borrador',
        } as any).select().single();
        if (entryError) throw entryError;
        const { error: detailsError } = await supabase.from("tab_journal_entry_details").insert(
          detailLines.map((l, i) => ({
            journal_entry_id: entry.id, line_number: i + 1, account_id: l.account_id,
            description: l.description || headerDescription, cost_center: l.cost_center || null,
            debit_amount: l.debit_amount, credit_amount: l.credit_amount,
            is_bank_line: l.is_bank_line || false,
            source_type: l.source_type || null, source_id: l.source_id || null, source_ref: l.source_ref || null,
          } as any))
        );
        if (detailsError) throw detailsError;
        // Now post if requested (triggers validate lines exist and balance)
        if (post) {
          const { error: postError } = await supabase.from("tab_journal_entries").update({
            is_posted: true, posted_at: new Date().toISOString(), status: 'contabilizado',
          } as any).eq("id", entry.id);
          if (postError) throw postError;
        }
        // Link any purchases saved by the modal to this new journal entry
        if (linkedPurchases.length > 0) {
          const purchaseIds = linkedPurchases.filter(p => p.id != null).map(p => p.id);
          if (purchaseIds.length > 0) {
            // Update legacy journal_entry_id column
            await supabase
              .from("tab_purchase_ledger")
              .update({ journal_entry_id: entry.id } as any)
              .in("id", purchaseIds);

            // Create links in tab_purchase_journal_links
            try {
              const linkRows = purchaseIds.map((pid: number) => ({
                enterprise_id: parseInt(enterpriseId),
                purchase_id: pid,
                journal_entry_id: entry.id,
                link_source: 'FROM_JOURNAL_MODAL',
                linked_by: user.id,
                linked_at: new Date().toISOString(),
              }));
              await supabase
                .from("tab_purchase_journal_links" as any)
                .upsert(linkRows, { onConflict: "enterprise_id,purchase_id" });
            } catch (linkError) {
              console.error("Error creating purchase-journal links:", linkError);
            }
          }
        }
        toast({ title: post ? "Partida contabilizada" : "Borrador guardado", description: `Partida ${finalEntryNumber} ${post ? 'contabilizada' : 'guardada'} exitosamente` });
        onSuccess(entry.id);
      }
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: "Error al guardar", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return {
    // State
    loading, isLoadingEntry, accounts, periods, nextEntryNumber,
    entryDate, setEntryDate, entryType, setEntryType, periodId, setPeriodId,
    documentReference, setDocumentReference, headerDescription, setHeaderDescription,
    bankAccountId, setBankAccountId, bankReference, setBankReference,
    beneficiaryName, setBeneficiaryName, bankDirection, setBankDirection, detailLines,
    accountSearch, setAccountSearch, accountPopoverOpen, setAccountPopoverOpen,
    showCloseConfirm, setShowCloseConfirm, showRejectDialog, setShowRejectDialog,
    rejectionReason, setRejectionReason, entryStatus,
    showLinkedPurchasesModal, setShowLinkedPurchasesModal,
    linkedPurchases, setLinkedPurchases,
    isReadOnly, auditInfo, activeLineId, setActiveLineId,
    showStickyHeader, headerRef,
    // Computed
    getTotalDebit, getTotalCredit, isBalanced,
    // Actions
    addLine, removeLine, updateLine, handlePurchasesPosted,
    handleCloseAttempt, saveEntry, propagateDescriptionToLines,
    handleDiscardAndClose: () => { setShowCloseConfirm(false); resetForm(); onOpenChange(false); },
    handleSaveDraftAndClose: async () => { setShowCloseConfirm(false); await saveEntry(false); },
    permissions, formatDateTime,
  };
}
