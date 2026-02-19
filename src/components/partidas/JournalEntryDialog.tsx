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

  const totalDebit = form.getTotalDebit();
  const totalCredit = form.getTotalCredit();
  const balanced = form.isBalanced();

  const canSaveDraft = form.entryStatus !== 'contabilizado' && form.permissions.canCreateEntries && !form.isReadOnly;
  const canPost = form.entryStatus !== 'contabilizado' && form.permissions.canPostEntries && !form.isReadOnly;

  // Keyboard shortcuts: Ctrl+Enter → Post, Ctrl+Shift+Enter → Save Draft
  useFormShortcuts({
    isEnabled: open && !form.isLoadingEntry,
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
              />

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
                onCancel={() => form.handleCloseAttempt(false)}
                onSaveDraft={() => form.saveEntry(false)}
                onPost={() => form.saveEntry(true)}
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
    </>
  );
}
