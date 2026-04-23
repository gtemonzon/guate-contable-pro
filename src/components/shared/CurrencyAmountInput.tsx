import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useEnterpriseCurrencies } from "@/hooks/useEnterpriseCurrencies";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import { formatCurrency } from "@/hooks/useCurrencies";
import { AlertCircle } from "lucide-react";

interface Props {
  enterpriseId: number;
  baseCurrencyCode: string;
  date: string; // YYYY-MM-DD
  amount: number;
  currencyCode: string;
  exchangeRate: number;
  onChange: (next: { amount: number; currencyCode: string; exchangeRate: number }) => void;
  label?: string;
  disabled?: boolean;
}

/**
 * Captura un monto en una moneda elegida con su tipo de cambio.
 * - Si la empresa solo tiene la moneda funcional: muestra solo el input de monto.
 * - Si tiene varias: muestra selector + tasa editable + diálogo inline para registrar tasa faltante.
 */
export function CurrencyAmountInput({
  enterpriseId,
  baseCurrencyCode,
  date,
  amount,
  currencyCode,
  exchangeRate,
  onChange,
  label = "Monto",
  disabled,
}: Props) {
  const { items: enabledCurrencies } = useEnterpriseCurrencies(enterpriseId);
  const { getRate, upsert, reload } = useExchangeRates(enterpriseId);
  const [showRateDialog, setShowRateDialog] = useState(false);
  const [pendingRate, setPendingRate] = useState("");

  const allCodes = useMemo(
    () => [baseCurrencyCode, ...enabledCurrencies.map((c) => c.currency_code)],
    [baseCurrencyCode, enabledCurrencies]
  );
  const isMulti = enabledCurrencies.length > 0;
  const isFunctional = currencyCode === baseCurrencyCode;

  // Auto-llenar tasa al cambiar moneda o fecha
  useEffect(() => {
    if (!isMulti || isFunctional) {
      if (exchangeRate !== 1) onChange({ amount, currencyCode, exchangeRate: 1 });
      return;
    }
    const r = getRate(currencyCode, date);
    if (r !== null && r !== exchangeRate) {
      onChange({ amount, currencyCode, exchangeRate: r });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currencyCode, date, isMulti, isFunctional]);

  const handleCurrencyChange = (code: string) => {
    if (code === baseCurrencyCode) {
      onChange({ amount, currencyCode: code, exchangeRate: 1 });
      return;
    }
    const r = getRate(code, date);
    if (r === null) {
      setPendingRate("");
      onChange({ amount, currencyCode: code, exchangeRate: 0 });
      setShowRateDialog(true);
    } else {
      onChange({ amount, currencyCode: code, exchangeRate: r });
    }
  };

  const handleSaveRate = async () => {
    const rate = Number(pendingRate);
    if (!rate || rate <= 0) return;
    const d = new Date(date);
    const ok = await upsert({
      currency_code: currencyCode,
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      rate,
      source: "Captura inline",
    });
    if (ok) {
      await reload();
      onChange({ amount, currencyCode, exchangeRate: rate });
      setShowRateDialog(false);
    }
  };

  const functionalEquivalent = amount * (exchangeRate || 1);

  if (!isMulti) {
    return (
      <div>
        <Label>{label}</Label>
        <Input
          type="number"
          step="0.01"
          value={amount || ""}
          onChange={(e) => onChange({ amount: Number(e.target.value), currencyCode, exchangeRate: 1 })}
          disabled={disabled}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-12 gap-2 items-end">
        <div className="col-span-5">
          <Label>{label}</Label>
          <Input
            type="number"
            step="0.01"
            value={amount || ""}
            onChange={(e) => onChange({ amount: Number(e.target.value), currencyCode, exchangeRate })}
            disabled={disabled}
          />
        </div>
        <div className="col-span-3">
          <Label>Moneda</Label>
          <Select value={currencyCode} onValueChange={handleCurrencyChange} disabled={disabled}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {allCodes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-4">
          <Label>Tipo de cambio</Label>
          <Input
            type="number"
            step="0.000001"
            value={exchangeRate || ""}
            onChange={(e) => onChange({ amount, currencyCode, exchangeRate: Number(e.target.value) })}
            disabled={disabled || isFunctional}
            className={isFunctional ? "bg-muted" : ""}
          />
        </div>
      </div>
      {!isFunctional && exchangeRate > 0 && (
        <p className="text-xs text-muted-foreground">
          Equivale a <strong>{formatCurrency(functionalEquivalent, baseCurrencyCode)}</strong>
        </p>
      )}
      {!isFunctional && exchangeRate === 0 && (
        <p className="text-xs text-amber-600 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" /> Falta registrar tipo de cambio
        </p>
      )}

      <Dialog open={showRateDialog} onOpenChange={setShowRateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar tipo de cambio</DialogTitle>
            <DialogDescription>
              No hay tipo de cambio registrado para <strong>{currencyCode}</strong> en{" "}
              {new Date(date).toLocaleDateString("es-GT", { month: "long", year: "numeric" })}.
              Ingrésalo ahora para continuar.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>1 {currencyCode} = ? {baseCurrencyCode}</Label>
            <Input
              type="number"
              step="0.000001"
              autoFocus
              value={pendingRate}
              onChange={(e) => setPendingRate(e.target.value)}
              placeholder="7.85"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRateDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveRate}>Guardar tasa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
