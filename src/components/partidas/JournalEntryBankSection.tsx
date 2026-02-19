import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Account } from "./useJournalEntryForm";

interface JournalEntryBankSectionProps {
  accounts: Account[];
  bankAccountId: number | null;
  setBankAccountId: (v: number | null) => void;
  bankReference: string;
  setBankReference: (v: string) => void;
  beneficiaryName: string;
  setBeneficiaryName: (v: string) => void;
}

export function JournalEntryBankSection({
  accounts, bankAccountId, setBankAccountId, bankReference, setBankReference, beneficiaryName, setBeneficiaryName,
}: JournalEntryBankSectionProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg border border-dashed">
      <div>
        <Label htmlFor="bankAccount">Cuenta Bancaria</Label>
        <Select
          value={bankAccountId?.toString() || "none"}
          onValueChange={(v) => {
            const newValue = v === "none" ? null : parseInt(v);
            setBankAccountId(newValue);
            if (!newValue) { setBankReference(""); setBeneficiaryName(""); }
          }}
        >
          <SelectTrigger id="bankAccount">
            <SelectValue placeholder="Seleccionar banco (opcional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sin cuenta bancaria</SelectItem>
            {accounts.filter(a => a.is_bank_account).map((acc) => (
              <SelectItem key={acc.id} value={acc.id.toString()}>
                {acc.account_code} - {acc.account_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {bankAccountId && (
        <>
          <div>
            <Label htmlFor="bankRef">Número de Documento</Label>
            <Input id="bankRef" placeholder="# cheque, transferencia, etc." value={bankReference} onChange={(e) => setBankReference(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="beneficiary">Beneficiario</Label>
            <Input id="beneficiary" placeholder="Nombre del beneficiario" value={beneficiaryName} onChange={(e) => setBeneficiaryName(e.target.value)} />
          </div>
        </>
      )}
    </div>
  );
}
