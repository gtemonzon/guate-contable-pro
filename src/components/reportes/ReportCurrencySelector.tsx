import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEnterpriseCurrencies } from "@/hooks/useEnterpriseCurrencies";
import { useEnterpriseBaseCurrency } from "@/hooks/useEnterpriseBaseCurrency";
import { Coins } from "lucide-react";

export type ReportCurrencyMode = "FUNCTIONAL" | "FOREIGN" | "DUAL";

export interface ReportCurrencyState {
  mode: ReportCurrencyMode;
  /** Solo cuando mode = FOREIGN o DUAL */
  foreignCode: string | null;
}

interface Props {
  enterpriseId: number | null;
  value: ReportCurrencyState;
  onChange: (v: ReportCurrencyState) => void;
  /** Si true y la empresa solo tiene la moneda base, no renderiza nada (modo silencioso). */
  hideIfMonoCurrency?: boolean;
}

/**
 * Selector reutilizable para reportes con vista multi-moneda.
 * - Solo funcional: muestra reportes en moneda base (default).
 * - Solo extranjera: muestra montos originales en una moneda extranjera específica.
 * - Comparativo: muestra ambas monedas lado a lado.
 *
 * Si la empresa no tiene monedas adicionales habilitadas, devuelve null (modo silencioso).
 */
export function ReportCurrencySelector({ enterpriseId, value, onChange, hideIfMonoCurrency = true }: Props) {
  const baseCode = useEnterpriseBaseCurrency(enterpriseId);
  const { items: enterpriseCurrencies } = useEnterpriseCurrencies(enterpriseId);
  const foreignCurrencies = enterpriseCurrencies
    .filter((c) => c.is_active && c.currency_code !== baseCode);

  if (hideIfMonoCurrency && foreignCurrencies.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Coins className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wide">Vista de Moneda</span>
      </div>

      <div className="min-w-[180px]">
        <Label className="text-xs text-muted-foreground">Modo</Label>
        <Select
          value={value.mode}
          onValueChange={(v) => onChange({ ...value, mode: v as ReportCurrencyMode })}
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="FUNCTIONAL">Solo {baseCode} (funcional)</SelectItem>
            <SelectItem value="FOREIGN" disabled={foreignCurrencies.length === 0}>
              Solo extranjera
            </SelectItem>
            <SelectItem value="DUAL" disabled={foreignCurrencies.length === 0}>
              Comparativo (ambas)
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {(value.mode === "FOREIGN" || value.mode === "DUAL") && foreignCurrencies.length > 0 && (
        <div className="min-w-[140px]">
          <Label className="text-xs text-muted-foreground">Moneda extranjera</Label>
          <Select
            value={value.foreignCode ?? foreignCurrencies[0].currency_code}
            onValueChange={(v) => onChange({ ...value, foreignCode: v })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {foreignCurrencies.map((c) => (
                <SelectItem key={c.currency_code} value={c.currency_code}>
                  {c.currency_code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

export const defaultReportCurrencyState: ReportCurrencyState = {
  mode: "FUNCTIONAL",
  foreignCode: null,
};
