import { useState } from "react";
import { toast } from "sonner";
import { Wand2, RotateCcw, Loader2, Link2, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DEFAULT_TENANT_PRIMARY,
  DEFAULT_TENANT_SECONDARY,
  contrastRatio,
  foregroundFor,
  hexToHsl,
  normalizeHex,
} from "@/utils/colorUtils";
import { extractPaletteFromPixels, suggestTenantColors } from "@/utils/logoPalette";

export interface LogoSource {
  file?: File | null;
  url?: string | null;
}

interface TenantColorFieldsProps {
  primary: string;
  secondary: string;
  onChange: (primary: string, secondary: string) => void;
  logoSource: LogoSource;
  primaryError?: string;
  secondaryError?: string;
}

const INVALID = "Color inválido (ejemplo: #1e40af)";

function loadImage(src: string, cross: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cross) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la imagen"));
    img.src = src;
  });
}

async function readLogoPalette(source: LogoSource): Promise<string[]> {
  let objectUrl: string | null = null;
  try {
    let img: HTMLImageElement;
    if (source.file) {
      objectUrl = URL.createObjectURL(source.file);
      img = await loadImage(objectUrl, false);
    } else if (source.url) {
      img = await loadImage(source.url, true);
    } else {
      return [];
    }
    const w0 = img.naturalWidth || img.width || 96;
    const h0 = img.naturalHeight || img.height || 96;
    const scale = 96 / Math.max(w0, h0);
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas no disponible");
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    return extractPaletteFromPixels(data, w, h);
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

function ColorInput({
  id,
  label,
  value,
  error,
  onValue,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onValue: (v: string) => void;
}) {
  const normalized = normalizeHex(value);
  const msg = error ?? (normalized ? undefined : INVALID);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          type="color"
          aria-label={`${label} (selector)`}
          value={normalized ?? "#000000"}
          onChange={(e) => onValue(e.target.value)}
          className="w-12 h-10 p-1"
        />
        <Input
          id={id}
          value={value}
          onChange={(e) => onValue(e.target.value)}
          className="flex-1 font-mono"
          aria-invalid={!!msg}
        />
      </div>
      {msg && <p className="text-sm font-medium text-destructive">{msg}</p>}
    </div>
  );
}

function Swatch({ color, selected, onClick, label }: { color: string; selected: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={selected}
      title={color}
      className={`h-8 w-8 rounded-md border flex items-center justify-center transition ${
        selected ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : ""
      }`}
      style={{ backgroundColor: color }}
    >
      {selected && <Check className="h-4 w-4" style={{ color: `hsl(${foregroundFor(color)})` }} />}
    </button>
  );
}

export function TenantColorFields({
  primary,
  secondary,
  onChange,
  logoSource,
  primaryError,
  secondaryError,
}: TenantColorFieldsProps) {
  const [detecting, setDetecting] = useState(false);
  const [palette, setPalette] = useState<string[] | null>(null);
  const [pickPrimary, setPickPrimary] = useState<string | null>(null);
  const [pickSecondary, setPickSecondary] = useState<string | null>(null);
  const hasLogo = !!(logoSource.file || logoSource.url);

  const handleDetect = async () => {
    setDetecting(true);
    try {
      const pal = await readLogoPalette(logoSource);
      if (pal.length === 0) throw new Error("Sin colores");
      const s = suggestTenantColors(pal);
      const full = [...pal];
      if (s.secondary && !full.includes(s.secondary)) full.push(s.secondary);
      setPalette(full);
      setPickPrimary(s.primary);
      setPickSecondary(s.secondary);
    } catch {
      toast.error("No se pudieron leer los colores del logo. Elige los colores manualmente.");
    } finally {
      setDetecting(false);
    }
  };

  const applyDetected = () => {
    if (pickPrimary && pickSecondary) {
      onChange(pickPrimary, pickSecondary);
      setPalette(null);
    }
  };

  const p = normalizeHex(primary);
  const s = normalizeHex(secondary);
  const fg = p ? foregroundFor(p) : null;
  const fgHex = fg === "0 0% 100%" ? "#ffffff" : "#121212";
  const lowContrast = p ? contrastRatio(p, fgHex) < 4.5 : false;
  const accentBase = s ? hexToHsl(s) : p ? hexToHsl(p) : null;
  const accentSat = accentBase ? (accentBase.s < 10 ? accentBase.s : Math.max(25, Math.min(70, accentBase.s))) : 0;

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="grid grid-cols-2 gap-4">
        <ColorInput id="tenant-primary" label="Color primario" value={primary} error={primaryError} onValue={(v) => onChange(v, secondary)} />
        <ColorInput id="tenant-secondary" label="Color secundario" value={secondary} error={secondaryError} onValue={(v) => onChange(primary, v)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={hasLogo ? -1 : 0}>
                <Button type="button" variant="outline" size="sm" onClick={handleDetect} disabled={!hasLogo || detecting}>
                  {detecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                  Detectar colores del logo
                </Button>
              </span>
            </TooltipTrigger>
            {!hasLogo && <TooltipContent>Sube un logo primero</TooltipContent>}
          </Tooltip>
        </TooltipProvider>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange(DEFAULT_TENANT_PRIMARY, DEFAULT_TENANT_SECONDARY)}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Usar colores por defecto
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Estas acciones solo cambian los campos de color; se guardan con «Guardar Cambios». Restablece los colores por defecto del sistema con «Usar colores por defecto».
      </p>

      {palette && (
        <div className="space-y-3 rounded-md border bg-muted/40 p-3">
          <p className="text-sm font-medium">Colores detectados</p>
          {([
            ["Primario", pickPrimary, setPickPrimary],
            ["Secundario", pickSecondary, setPickSecondary],
          ] as const).map(([label, picked, setPicked]) => (
            <div key={label} className="flex items-center gap-3">
              <span className="w-20 text-xs text-muted-foreground">{label}</span>
              <div className="flex flex-wrap gap-2">
                {palette.map((c) => (
                  <Swatch key={c} color={c} selected={picked === c} onClick={() => setPicked(c)} label={`${label}: ${c}`} />
                ))}
              </div>
            </div>
          ))}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setPalette(null)}>
              Descartar
            </Button>
            <Button type="button" size="sm" onClick={applyDetected} disabled={!pickPrimary || !pickSecondary}>
              Aplicar
            </Button>
          </div>
        </div>
      )}

      {p && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Vista previa</p>
          <div className="flex flex-wrap items-center gap-3 rounded-md border bg-background p-3">
            <span
              className="inline-flex h-8 items-center rounded-md px-3 text-sm font-medium"
              style={{ backgroundColor: p, color: `hsl(${fg})` }}
            >
              Botón
            </span>
            {accentBase && (
              <span
                className="inline-flex h-8 items-center rounded-md px-3 text-sm"
                style={{
                  backgroundColor: `hsl(${accentBase.h} ${accentSat}% 94%)`,
                  color: `hsl(${accentBase.h} ${accentSat}% 28%)`,
                }}
              >
                Fila seleccionada
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-sm underline" style={{ color: p }}>
              <Link2 className="h-4 w-4" /> Enlace
            </span>
          </div>
          {lowContrast && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5" />
              El texto sobre este color tiene poco contraste; considera un tono más oscuro o más claro.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
