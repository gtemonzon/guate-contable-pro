import { useId, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface ReportPercentToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  disabledReason?: string;
}

export function useReportPercent(report: "resultados" | "balance" | "variaciones") {
  const key = `reportPercent:${report}`;
  const [checked, setChecked] = useState(() => {
    try { return localStorage.getItem(key) === "true"; } catch { return false; }
  });
  const onCheckedChange = (value: boolean) => {
    setChecked(value);
    try { localStorage.setItem(key, String(value)); } catch { /* Storage may be unavailable. */ }
  };
  return { checked, onCheckedChange };
}

export default function ReportPercentToggle({ checked, onCheckedChange, disabled, disabledReason }: ReportPercentToggleProps) {
  const id = useId();
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2" tabIndex={disabled ? 0 : undefined}>
            <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-describedby={disabledReason ? `${id}-reason` : undefined} />
            <Label htmlFor={id} className="text-sm whitespace-nowrap">% vertical</Label>
            {disabledReason && <span id={`${id}-reason`} className="sr-only">{disabledReason}</span>}
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          {disabled && disabledReason ? disabledReason : "Muestra cada cifra como porcentaje de la base: Total Ingresos en Resultados, Total Activo en Balance"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}