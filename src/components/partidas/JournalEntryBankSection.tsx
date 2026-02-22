import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import type { Account } from "./useJournalEntryForm";

export type BankDirection = 'OUT' | 'IN';

interface JournalEntryBankSectionProps {
  accounts: Account[];
  bankAccountId: number | null;
  setBankAccountId: (v: number | null) => void;
  bankReference: string;
  setBankReference: (v: string) => void;
  beneficiaryName: string;
  setBeneficiaryName: (v: string) => void;
  bankDirection: BankDirection;
  setBankDirection: (v: BankDirection) => void;
  isReadOnly?: boolean;
}

export function JournalEntryBankSection({
  accounts, bankAccountId, setBankAccountId, bankReference, setBankReference,
  beneficiaryName, setBeneficiaryName, bankDirection, setBankDirection, isReadOnly,
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
          disabled={isReadOnly}
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
            <div className="flex items-center gap-1">
              <Label htmlFor="bankDirection">Movimiento Bancario</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[250px]">
                  <p className="font-medium mb-1">Dirección del movimiento:</p>
                  <p className="text-xs"><strong>Salida:</strong> Pagos, cheques y transferencias salientes.</p>
                  <p className="text-xs"><strong>Entrada:</strong> Depósitos, reembolsos y transferencias entrantes.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <Select value={bankDirection} onValueChange={(v) => setBankDirection(v as BankDirection)} disabled={isReadOnly}>
              <SelectTrigger id="bankDirection">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OUT">Salida (Pago/Cheque)</SelectItem>
                <SelectItem value="IN">Entrada (Depósito/Ingreso)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="bankRef">Número de Documento</Label>
            <Input id="bankRef" placeholder="# cheque, transferencia, etc." value={bankReference} onChange={(e) => setBankReference(e.target.value)} disabled={isReadOnly} />
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="beneficiary">Beneficiario</Label>
            <Input id="beneficiary" placeholder="Nombre del beneficiario" value={beneficiaryName} onChange={(e) => setBeneficiaryName(e.target.value)} disabled={isReadOnly} />
          </div>
        </>
      )}
    </div>
  );
}
