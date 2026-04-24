import { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEnterpriseBaseCurrency } from "@/hooks/useEnterpriseBaseCurrency";
import { useEnterpriseCurrencies } from "@/hooks/useEnterpriseCurrencies";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import { formatCurrency } from "@/hooks/useCurrencies";
import type { Period } from "./useJournalEntryForm";

interface JournalEntryHeaderProps {
  headerRef: React.RefObject<HTMLDivElement>;
  nextEntryNumber: string;
  entryDate: string;
  setEntryDate: (v: string) => void;
  entryType: string;
  setEntryType: (v: string) => void;
  periodId: number | null;
  setPeriodId: (v: number) => void;
  periods: Period[];
  headerDescription: string;
  setHeaderDescription: (v: string) => void;
  propagateDescriptionToLines: () => void;
  // Multi-currency
  enterpriseId: number | null;
  currencyCode: string;
  setCurrencyCode: (v: string) => void;
  exchangeRate: number;
  setExchangeRate: (v: number) => void;
}

export function JournalEntryHeader({
  headerRef, nextEntryNumber, entryDate, setEntryDate, entryType, setEntryType,
  periodId, setPeriodId, periods, headerDescription, setHeaderDescription, propagateDescriptionToLines,
  enterpriseId, currencyCode, setCurrencyCode, exchangeRate, setExchangeRate,
}: JournalEntryHeaderProps) {
  const baseCurrency = useEnterpriseBaseCurrency(enterpriseId);
  const { items: enabledCurrencies } = useEnterpriseCurrencies(enterpriseId);
  const { getRate } = useExchangeRates(enterpriseId);

  const isMultiCurrency = enabledCurrencies.length > 0;
  const isFunctional = currencyCode === baseCurrency;
  const allCodes = [baseCurrency, ...enabledCurrencies.map((c) => c.currency_code)];

  // Initialize to base currency on mount / when base loads
  useEffect(() => {
    if (baseCurrency && (!currencyCode || currencyCode === "GTQ") && currencyCode !== baseCurrency) {
      setCurrencyCode(baseCurrency);
      setExchangeRate(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseCurrency]);

  const handleCurrencyChange = (code: string) => {
    setCurrencyCode(code);
    if (code === baseCurrency) {
      setExchangeRate(1);
      return;
    }
    const r = getRate(code, entryDate || new Date().toISOString().slice(0, 10));
    setExchangeRate(r ?? 0);
  };

  // Auto-resolve when date changes (only if not functional)
  useEffect(() => {
    if (!isFunctional && entryDate) {
      const r = getRate(currencyCode, entryDate);
      if (r !== null && r !== exchangeRate) setExchangeRate(r);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryDate]);

  return (
    <div ref={headerRef} className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <Label>Número de Partida</Label>
          <Input value={nextEntryNumber || 'Sin asignar (se asignará al guardar)'} disabled className="font-mono" />
        </div>

        <div>
          <Label htmlFor="entryDate">Fecha</Label>
          <Input id="entryDate" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
        </div>

        <div>
          <Label htmlFor="entryType">Tipo</Label>
          <Select value={entryType} onValueChange={setEntryType}>
            <SelectTrigger id="entryType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="apertura">Apertura</SelectItem>
              <SelectItem value="diario">Diario</SelectItem>
              <SelectItem value="ajuste">Ajuste</SelectItem>
              <SelectItem value="cierre">Cierre</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="period">Período Contable</Label>
          <Select value={periodId?.toString() || ""} onValueChange={(v) => setPeriodId(parseInt(v))}>
            <SelectTrigger id="period">
              <SelectValue placeholder="Seleccionar período" />
            </SelectTrigger>
            <SelectContent>
              {periods.map((period) => {
                const start = new Date(period.start_date + 'T00:00:00');
                const end = new Date(period.end_date + 'T00:00:00');
                return (
                  <SelectItem key={period.id} value={period.id.toString()}>
                    {period.year} ({start.toLocaleDateString('es-GT')} - {end.toLocaleDateString('es-GT')})
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isMultiCurrency && (
        <div className="grid grid-cols-12 gap-3 items-end p-3 rounded-md border bg-muted/30">
          <div className="col-span-3">
            <Label>Moneda</Label>
            <Select value={currencyCode} onValueChange={handleCurrencyChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {allCodes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-3">
            <Label>Tipo de cambio</Label>
            <Input
              type="number"
              step="0.000001"
              value={exchangeRate || ""}
              onChange={(e) => setExchangeRate(Number(e.target.value))}
              disabled={isFunctional}
              className={cn(isFunctional && "bg-muted")}
            />
          </div>
          <div className="col-span-6 text-xs">
            {isFunctional && (
              <p className="text-muted-foreground">
                Moneda funcional. Los montos de las líneas se registran en {baseCurrency}.
              </p>
            )}
            {!isFunctional && exchangeRate > 0 && (
              <p className="text-muted-foreground">
                Las líneas se capturan en <strong>{currencyCode}</strong>. La conversión a{" "}
                <strong>{baseCurrency}</strong> se aplica al contabilizar (1 {currencyCode} ={" "}
                {formatCurrency(exchangeRate, baseCurrency)}).
              </p>
            )}
            {!isFunctional && (!exchangeRate || exchangeRate <= 0) && (
              <p className="text-warning flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> Falta registrar tipo de cambio para {currencyCode} en este mes.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
