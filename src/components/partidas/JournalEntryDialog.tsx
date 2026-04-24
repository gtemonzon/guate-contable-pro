import { useEffect, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AccountBalanceInspector } from "./AccountBalanceInspector";
import VoidChequeDialog from "./VoidChequeDialog";
import { MetadataEditDialog } from "./MetadataEditDialog";
import { PurchaseLinkManager } from "./PurchaseLinkManager";
import { ReferenceBadges } from "./ReferenceBadges";
import { LiquidateForeignInvoiceDialog } from "./LiquidateForeignInvoiceDialog";
import { useEnterpriseBaseCurrency } from "@/hooks/useEnterpriseBaseCurrency";
import { useJournalEntryForm, type EntryStatus } from "./useJournalEntryForm";
import { JournalEntryHeader } from "./JournalEntryHeader";
import { JournalEntryBankSection } from "./JournalEntryBankSection";
import { JournalEntryLinesTable } from "./JournalEntryLinesTable";
import { JournalEntryTotalsBar } from "./JournalEntryTotalsBar";
import { JournalEntryActions } from "./JournalEntryActions";
import { useFormShortcuts } from "@/hooks/useFormShortcuts";
import { useEnterprise } from "@/contexts/EnterpriseContext";
import { useEnterpriseConfig } from "@/hooks/useEnterpriseConfig";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface JournalEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (savedEntryId?: number) => void;
  entryToEdit?: {
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
  } | null;
}

export default function JournalEntryDialog({
  open,
  onOpenChange,
  onSuccess,
  entryToEdit = null,
}: JournalEntryDialogProps) {
  const form = useJournalEntryForm(open, entryToEdit ?? null, onSuccess, onOpenChange);
  const { selectedEnterpriseId } = useEnterprise();
  const { toast } = useToast();
  const { config } = useEnterpriseConfig(selectedEnterpriseId ?? null);
  const baseCurrency = useEnterpriseBaseCurrency(selectedEnterpriseId ?? null);

  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [voidChequeOpen, setVoidChequeOpen] = useState(false);
  const [metadataEditOpen, setMetadataEditOpen] = useState(false);
  const [linkManagerOpen, setLinkManagerOpen] = useState(false);
  const [liquidateOpen, setLiquidateOpen] = useState(false);
  // Auto-suggest liquidation context (Item 10E)
  const [pendingLiquidationEntryId, setPendingLiquidationEntryId] = useState<number | null>(null);

  // Wrap onSuccess to auto-detect FX-payment scenarios that need realized FX differential
  const handleFormSuccess = useCallback(async (savedEntryId?: number) => {
    if (!savedEntryId || !selectedEnterpriseId || !baseCurrency) {
      onSuccess(savedEntryId);
      return;
    }
    try {
      // Re-fetch the saved entry with its details + accounts to evaluate criteria
      const { data: entry } = await supabase
        .from("tab_journal_entries")
        .select(`
          id, entry_type, currency_code, status, is_posted,
          tab_journal_entry_details (
            account_id,
            tab_accounts:account_id (id, account_code, account_name)
          )
        `)
        .eq("id", savedEntryId)
        .maybeSingle();

      if (!entry || !entry.is_posted || (entry.currency_code || baseCurrency) === baseCurrency) {
        onSuccess(savedEntryId);
        return;
      }

      // Trigger heuristic: payment-type entries OR entries that touch
      // configured Customers/Suppliers accounts in foreign currency.
      const customerAccId = config?.customers_account_id ?? null;
      const supplierAccId = config?.suppliers_account_id ?? null;
      const touchesAR_AP = (entry.tab_journal_entry_details || []).some((d: any) =>
        (customerAccId && d.account_id === customerAccId) ||
        (supplierAccId && d.account_id === supplierAccId),
      );
      const isPayment = ["pago", "ingreso", "egreso", "cobro"].includes(String(entry.entry_type).toLowerCase());

      if (touchesAR_AP || isPayment) {
        toast({
          title: "Posible diferencial cambiario",
          description: "Esta partida en moneda extranjera afecta cuentas por cobrar/pagar. Revisa si necesitas registrar el diferencial realizado.",
        });
        setPendingLiquidationEntryId(savedEntryId);
        setLiquidateOpen(true);
        // Defer the parent's onSuccess until liquidation dialog closes
        return;
      }
    } catch (err) {
      console.error("Auto-FX detection failed:", err);
    }
    onSuccess(savedEntryId);
  }, [onSuccess, selectedEnterpriseId, baseCurrency, config?.customers_account_id, config?.suppliers_account_id, toast]);

  const form = useJournalEntryForm(open, entryToEdit ?? null, handleFormSuccess, onOpenChange);


  const totalDebit = form.getTotalDebit();
  const totalCredit = form.getTotalCredit();
  const balanced = form.isBalanced();

  const canSaveDraft = form.entryStatus !== 'contabilizado' && form.permissions.canCreateEntries && !form.isReadOnly;
  const canPost = form.entryStatus !== 'contabilizado' && form.permissions.canPostEntries && !form.isReadOnly;

  const activeLine = form.activeLineId
    ? form.detailLines.find(l => l.id === form.activeLineId)
    : null;
  const activeAccount = activeLine?.account_id
    ? form.accounts.find(a => a.id === activeLine.account_id)
    : null;

  // Helper: add line and focus its account selector
  const addLineAndFocus = useCallback(() => {
    if (form.isReadOnly) return;
    form.addLine();
    // The addLine sets activeLineId and opens the popover automatically
  }, [form.isReadOnly, form.addLine]);

  // Helper: focus first editable detail line's account selector
  const focusFirstDetailLine = useCallback(() => {
    const firstNonBank = form.detailLines.find(l => !l.is_bank_line);
    if (firstNonBank) {
      form.setActiveLineId(firstNonBank.id);
      setTimeout(() => form.setAccountPopoverOpen(prev => ({ ...prev, [firstNonBank.id]: true })), 50);
    }
  }, [form.detailLines, form.setActiveLineId, form.setAccountPopoverOpen]);

  // Global keyboard shortcuts: Alt+V, Alt+A, F2, Alt+B
  useEffect(() => {
    if (!open || linkManagerOpen) return;
    const handler = (e: KeyboardEvent) => {
      // Alt+V → Vincular Facturas (works even in inputs)
      const isLinkShortcut = e.altKey && (e.key === 'v' || e.key === 'V') && !e.ctrlKey && !e.metaKey && !e.shiftKey;
      if (isLinkShortcut && !form.isReadOnly) {
        e.preventDefault();
        e.stopPropagation();
        handleOpenLinkManager();
        return;
      }

      // Alt+A → Add new detail line (works even in inputs)
      const isAddLineShortcut = e.altKey && (e.key === 'a' || e.key === 'A') && !e.ctrlKey && !e.metaKey && !e.shiftKey;
      if (isAddLineShortcut && !form.isReadOnly) {
        e.preventDefault();
        e.stopPropagation();
        addLineAndFocus();
        return;
      }

      // Skip remaining shortcuts if focus is in text input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;

      if (inspectorOpen) return;
      const isF2   = e.key === "F2"  && !e.ctrlKey && !e.metaKey && !e.shiftKey;
      const isAltB = e.key === "b"   && e.altKey   && !e.ctrlKey && !e.metaKey;
      if (isF2 || isAltB) {
        if (activeAccount) {
          e.preventDefault();
          e.stopPropagation();
          setInspectorOpen(true);
        }
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [open, activeAccount, inspectorOpen, linkManagerOpen, form.isReadOnly, addLineAndFocus]);

  // Keyboard shortcuts
  useFormShortcuts({
    isEnabled: open && !form.isLoadingEntry && !inspectorOpen && !linkManagerOpen,
    onSave: canPost ? () => form.saveEntry(true) : undefined,
    onSaveDraft: canSaveDraft ? () => form.saveEntry(false) : undefined,
    onCancel: () => form.handleCloseAttempt(false),
    isDirty: false,
  });

  const enterpriseId = selectedEnterpriseId ?? parseInt(localStorage.getItem("currentEnterpriseId") || "0");

  // Handle "Vincular Facturas" click — auto-creates draft if needed
  const handleOpenLinkManager = async () => {
    try {
      await form.ensureDraftEntry();
      setLinkManagerOpen(true);
    } catch (err: unknown) {
      toast({ title: "Error al preparar vinculación", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
  };

  // Handle explicit "Aplicar a póliza" — regenerate journal lines
  const handleApplyToEntry = async () => {
    const entryId = form.getEntryId();
    if (entryId) {
      await form.regenerateLinesFromLinkedPurchases(entryId);
    }
  };

  const currentEntryId = form.getEntryId();
  const currentEntryNumber = form.nextEntryNumber || entryToEdit?.entry_number || '(sin asignar)';
  const currentEntryMonth = form.entryDate ? new Date(form.entryDate + 'T00:00:00').getMonth() + 1 : undefined;
  const currentEntryYear = form.entryDate ? new Date(form.entryDate + 'T00:00:00').getFullYear() : undefined;

  return (
    <>
      <Dialog open={open} onOpenChange={form.handleCloseAttempt}>
        <DialogContent className="w-[98vw] max-w-[1400px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{entryToEdit ? 'Editar' : 'Nueva'} Partida Contable</DialogTitle>
          </DialogHeader>

          {form.isLoadingEntry ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              <p className="text-muted-foreground">Cargando partida...</p>
            </div>
          ) : (
            <div className="space-y-6">
              <JournalEntryTotalsBar
                show={form.showStickyHeader}
                nextEntryNumber={form.nextEntryNumber}
                entryDate={form.entryDate}
                entryType={form.entryType}
                headerDescription={form.headerDescription}
                totalDebit={totalDebit}
                totalCredit={totalCredit}
                isBalanced={balanced}
              />

              <JournalEntryHeader
                headerRef={form.headerRef}
                nextEntryNumber={form.nextEntryNumber}
                entryDate={form.entryDate}
                setEntryDate={form.setEntryDate}
                entryType={form.entryType}
                setEntryType={form.setEntryType}
                periodId={form.periodId}
                setPeriodId={form.setPeriodId}
                periods={form.periods}
                headerDescription={form.headerDescription}
                setHeaderDescription={form.setHeaderDescription}
                propagateDescriptionToLines={form.propagateDescriptionToLines}
                enterpriseId={parseInt(localStorage.getItem("currentEnterpriseId") || "0") || null}
                currencyCode={form.currencyCode}
                setCurrencyCode={form.setCurrencyCode}
                exchangeRate={form.exchangeRate}
                setExchangeRate={form.setExchangeRate}
              />

              <JournalEntryBankSection
                accounts={form.accounts}
                bankAccountId={form.bankAccountId}
                setBankAccountId={form.setBankAccountId}
                bankReference={form.bankReference}
                setBankReference={form.setBankReference}
                beneficiaryName={form.beneficiaryName}
                setBeneficiaryName={form.setBeneficiaryName}
                bankDirection={form.bankDirection}
                setBankDirection={form.setBankDirection}
                isReadOnly={form.isReadOnly}
                bankRefDuplicate={form.bankRefDuplicate}
                bankRefChecking={form.bankRefChecking}
                onBankRefBlur={form.checkDuplicateBankRef}
              />

              {/* Descripción General */}
              <div>
                <label htmlFor="headerDesc" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Descripción General</label>
                <textarea
                  id="headerDesc"
                  placeholder="Descripción de la partida..."
                  value={form.headerDescription}
                  onChange={(e) => form.setHeaderDescription(e.target.value)}
                  onBlur={form.propagateDescriptionToLines}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      form.propagateDescriptionToLines();
                      const hasNonBankLines = form.detailLines.some(l => !l.is_bank_line);
                      if (hasNonBankLines) {
                        focusFirstDetailLine();
                      } else {
                        addLineAndFocus();
                      }
                    }
                  }}
                  rows={2}
                  className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 mt-1.5"
                />
                {form.documentReferences.length > 0 && (
                  <div className="mt-2">
                    <ReferenceBadges references={form.documentReferences} maxVisible={5} />
                  </div>
                )}
              </div>

              <JournalEntryLinesTable
                detailLines={form.detailLines}
                accounts={form.accounts}
                activeLineId={form.activeLineId}
                setActiveLineId={form.setActiveLineId}
                accountSearch={form.accountSearch}
                setAccountSearch={form.setAccountSearch}
                accountPopoverOpen={form.accountPopoverOpen}
                setAccountPopoverOpen={form.setAccountPopoverOpen}
                isReadOnly={form.isReadOnly}
                totalDebit={totalDebit}
                totalCredit={totalCredit}
                isBalanced={balanced}
                onAddLine={form.addLine}
                onRemoveLine={form.removeLine}
                onUpdateLine={form.updateLine}
                onOpenBalanceInspector={() => setInspectorOpen(true)}
                entryDate={form.entryDate}
              />

              <JournalEntryActions
                entryToEdit={!!entryToEdit}
                entryStatus={form.entryStatus}
                isBalanced={balanced}
                loading={form.loading}
                isReadOnly={form.isReadOnly}
                canCreateEntries={form.permissions.canCreateEntries}
                canPostEntries={form.permissions.canPostEntries}
                hasBankAccount={!!form.bankAccountId}
                hasBankReference={!!form.bankReference.trim()}
                totalDebit={totalDebit}
                totalCredit={totalCredit}
                imbalanceAmount={form.getImbalanceAmount()}
                onCancel={() => form.handleCloseAttempt(false)}
                onSaveDraft={() => form.saveEntry(false)}
                onPost={() => form.saveEntry(true)}
                onVoidCheque={() => setVoidChequeOpen(true)}
                onEditMetadata={form.entryStatus === 'contabilizado' ? () => setMetadataEditOpen(true) : undefined}
                onLinkPurchases={!form.isReadOnly ? handleOpenLinkManager : undefined}
                onLiquidateForeignInvoice={
                  form.entryStatus === 'contabilizado' && form.currencyCode && form.currencyCode !== baseCurrency
                    ? () => setLiquidateOpen(true)
                    : undefined
                }
                auditInfo={form.auditInfo}
                formatDateTime={form.formatDateTime}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={form.showCloseConfirm} onOpenChange={form.setShowCloseConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Guardar borrador?</AlertDialogTitle>
            <AlertDialogDescription>
              Tiene cambios sin guardar. ¿Desea guardar la partida como borrador antes de salir?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => form.setShowCloseConfirm(false)}>Cancelar</AlertDialogCancel>
            <AlertDialogCancel onClick={form.handleDiscardAndClose}>No, descartar</AlertDialogCancel>
            <AlertDialogAction onClick={form.handleSaveDraftAndClose}>Sí, guardar borrador</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Account Balance Inspector — F2 / Alt+B */}
      <AccountBalanceInspector
        open={inspectorOpen}
        onOpenChange={setInspectorOpen}
        accountId={activeAccount?.id ?? null}
        accountCode={activeAccount?.account_code ?? ""}
        accountName={activeAccount?.account_name ?? ""}
        balanceType={activeAccount?.balance_type ?? null}
        entryDate={form.entryDate}
        enterpriseId={enterpriseId}
      />

      {/* Void Cheque Dialog */}
      <VoidChequeDialog
        open={voidChequeOpen}
        onOpenChange={setVoidChequeOpen}
        entry={entryToEdit ? {
          id: entryToEdit.id,
          entry_number: entryToEdit.entry_number,
          entry_date: entryToEdit.entry_date,
          description: entryToEdit.description,
          total_debit: entryToEdit.total_debit,
          total_credit: entryToEdit.total_credit,
          is_posted: entryToEdit.is_posted,
          accounting_period_id: entryToEdit.accounting_period_id,
          enterprise_id: enterpriseId,
          bank_account_id: form.bankAccountId,
          bank_reference: form.bankReference,
          beneficiary_name: form.beneficiaryName,
          bank_direction: form.bankDirection,
        } : null}
        formValues={!entryToEdit ? {
          enterpriseId,
          bankAccountId: form.bankAccountId,
          bankReference: form.bankReference,
          beneficiaryName: form.beneficiaryName,
          entryDate: form.entryDate,
          description: form.headerDescription,
          bankDirection: form.bankDirection,
          draftEntryId: form.draftEntryId,
        } : undefined}
        onSuccess={async () => {
          // After voiding: cleanup draft if any, close dialog, refresh list
          await form.handleDiscardAndClose();
          onSuccess();
        }}
      />

      {/* Metadata Edit Dialog for posted entries */}
      {entryToEdit && form.entryStatus === 'contabilizado' && (
        <MetadataEditDialog
          open={metadataEditOpen}
          onOpenChange={setMetadataEditOpen}
          entryId={entryToEdit.id}
          entryNumber={form.nextEntryNumber || entryToEdit.entry_number}
          currentValues={{
            description: form.headerDescription,
            beneficiary_name: form.beneficiaryName || null,
            bank_reference: form.bankReference || null,
            document_reference: form.documentReference || null,
          }}
          onSuccess={() => {
            onSuccess();
            onOpenChange(false);
          }}
        />
      )}

      {/* Purchase Link Manager — unified single flow */}
      {currentEntryId && (
        <PurchaseLinkManager
          open={linkManagerOpen}
          onOpenChange={setLinkManagerOpen}
          enterpriseId={enterpriseId}
          journalEntryId={currentEntryId}
          journalEntryNumber={currentEntryNumber}
          entryStatus={form.entryStatus}
          entryDate={form.entryDate}
          entryMonth={currentEntryMonth}
          entryYear={currentEntryYear}
          bankAccountId={form.bankAccountId}
          onLinksChanged={() => {}} 
          onApplyToEntry={handleApplyToEntry}
        />
      )}

      {/* Liquidar Factura ME — diferencial cambiario realizado */}
      {currentEntryId && form.currencyCode && form.currencyCode !== baseCurrency && (
        <LiquidateForeignInvoiceDialog
          open={liquidateOpen}
          onOpenChange={setLiquidateOpen}
          enterpriseId={enterpriseId}
          baseCurrency={baseCurrency}
          paymentJournalId={currentEntryId}
          paymentDate={form.entryDate}
          defaultPaymentRate={Number(form.exchangeRate) || undefined}
          currencyCode={form.currencyCode}
          counterpartNit={null}
          onCompleted={() => {
            onSuccess(currentEntryId);
          }}
        />
      )}
    </>
  );
}
