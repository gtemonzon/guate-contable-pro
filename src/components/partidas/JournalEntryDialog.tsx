import { useEffect, useState } from "react";
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
import LinkedPurchasesModal from "./LinkedPurchasesModal";
import { AccountBalanceInspector } from "./AccountBalanceInspector";
import VoidChequeDialog from "./VoidChequeDialog";
import { useJournalEntryForm, type EntryStatus } from "./useJournalEntryForm";
import { JournalEntryHeader } from "./JournalEntryHeader";
import { JournalEntryBankSection } from "./JournalEntryBankSection";
import { JournalEntryLinesTable } from "./JournalEntryLinesTable";
import { JournalEntryTotalsBar } from "./JournalEntryTotalsBar";
import { JournalEntryActions } from "./JournalEntryActions";
import { useFormShortcuts } from "@/hooks/useFormShortcuts";
import { useEnterprise } from "@/contexts/EnterpriseContext";

interface JournalEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  entryToEdit?: {
    id: number;
    entry_number: string;
    entry_date: string;
    entry_type: string;
    description: string;
    total_debit: number;
    total_credit: number;
    is_posted: boolean;
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

  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [voidChequeOpen, setVoidChequeOpen] = useState(false);

  const totalDebit = form.getTotalDebit();
  const totalCredit = form.getTotalCredit();
  const balanced = form.isBalanced();

  const canSaveDraft = form.entryStatus !== 'contabilizado' && form.permissions.canCreateEntries && !form.isReadOnly;
  const canPost = form.entryStatus !== 'contabilizado' && form.permissions.canPostEntries && !form.isReadOnly;

  // Determine the currently active line's account (for Balance Inspector)
  const activeLine = form.activeLineId
    ? form.detailLines.find(l => l.id === form.activeLineId)
    : null;
  const activeAccount = activeLine?.account_id
    ? form.accounts.find(a => a.id === activeLine.account_id)
    : null;

  // F2 / Alt+B → open Balance Inspector for active account
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (inspectorOpen) return; // let inspector handle its own keys
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
  }, [open, activeAccount, inspectorOpen]);

  // Keyboard shortcuts: Ctrl+Enter → Post, Ctrl+Shift+Enter → Save Draft
  useFormShortcuts({
    isEnabled: open && !form.isLoadingEntry && !inspectorOpen,
    onSave: canPost ? () => form.saveEntry(true) : undefined,
    onSaveDraft: canSaveDraft ? () => form.saveEntry(false) : undefined,
    onCancel: () => form.handleCloseAttempt(false),
    isDirty: false, // ESC always allowed from dialog
  });

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
              />

              {/* Descripción General — after bank section for better flow */}
              <div>
                <label htmlFor="headerDesc" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Descripción General</label>
                <textarea
                  id="headerDesc"
                  placeholder="Descripción de la partida..."
                  value={form.headerDescription}
                  onChange={(e) => form.setHeaderDescription(e.target.value)}
                  onBlur={form.propagateDescriptionToLines}
                  rows={2}
                  className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 mt-1.5"
                />
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
                onOpenPurchasesModal={() => form.setShowLinkedPurchasesModal(true)}
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
                onCancel={() => form.handleCloseAttempt(false)}
                onSaveDraft={() => form.saveEntry(false)}
                onPost={() => form.saveEntry(true)}
                onVoidCheque={() => setVoidChequeOpen(true)}
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

      <LinkedPurchasesModal
        open={form.showLinkedPurchasesModal}
        onOpenChange={form.setShowLinkedPurchasesModal}
        entryDate={form.entryDate}
        documentReference={form.bankReference}
        enterpriseId={selectedEnterpriseId ?? parseInt(localStorage.getItem("currentEnterpriseId") || "0")}
        bankAccountId={form.bankAccountId}
        journalEntryId={entryToEdit?.id || null}
        onPurchasesPosted={form.handlePurchasesPosted}
      />

      {/* Account Balance Inspector — F2 / Alt+B */}
      <AccountBalanceInspector
        open={inspectorOpen}
        onOpenChange={setInspectorOpen}
        accountId={activeAccount?.id ?? null}
        accountCode={activeAccount?.account_code ?? ""}
        accountName={activeAccount?.account_name ?? ""}
        balanceType={activeAccount?.balance_type ?? null}
        entryDate={form.entryDate}
        enterpriseId={selectedEnterpriseId ?? parseInt(localStorage.getItem("currentEnterpriseId") || "0")}
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
          enterprise_id: selectedEnterpriseId ?? parseInt(localStorage.getItem("currentEnterpriseId") || "0"),
          bank_account_id: form.bankAccountId,
          bank_reference: form.bankReference,
          beneficiary_name: form.beneficiaryName,
          bank_direction: form.bankDirection,
        } : null}
        formValues={!entryToEdit ? {
          enterpriseId: selectedEnterpriseId ?? parseInt(localStorage.getItem("currentEnterpriseId") || "0"),
          bankAccountId: form.bankAccountId,
          bankReference: form.bankReference,
          beneficiaryName: form.beneficiaryName,
          entryDate: form.entryDate,
          description: form.headerDescription,
          bankDirection: form.bankDirection,
        } : undefined}
        onSuccess={onSuccess}
      />
    </>
  );
}

