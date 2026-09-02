import { useCallback, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import type { InventoryWarehouse } from "./InventoryPage";

type ExcelCell = string | number | boolean | Date | null | undefined;
type ExcelRow = Record<string, ExcelCell>;

interface ParsedRow {
  excelRow: number;
  sku: string;
  name: string;
  unit_of_measure: string;
  category: string | null;
  suggested_price: number;
  warehouse_code: string;
  warehouse_id: number | null;
  initial_quantity: number;
  initial_unit_cost: number;
  errors: string[];
}

interface ImportOutcome {
  created: string[];
  failed: { sku: string; reason: string }[];
  movementFailed: { sku: string; reason: string }[];
}

const TEMPLATE_HEADERS = [
  "sku", "name", "unit_of_measure", "category",
  "suggested_price", "warehouse_code", "initial_quantity", "initial_unit_cost",
] as const;

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

function pick(row: ExcelRow, key: string): ExcelCell {
  const target = norm(key);
  for (const k of Object.keys(row)) {
    if (norm(k) === target) return row[k];
  }
  return undefined;
}

function asText(v: ExcelCell): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

function asNumber(v: ExcelCell): { value: number; valid: boolean; empty: boolean } {
  const s = asText(v);
  if (s === "") return { value: 0, valid: true, empty: true };
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(n)) return { value: 0, valid: false, empty: false };
  return { value: n, valid: true, empty: false };
}

function errorMessage(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "Ocurrió un error inesperado.";
}

export function downloadTemplate(warehouses: InventoryWarehouse[]) {
  const example: Record<string, string | number> = {
    sku: "EJEMPLO-001",
    name: "Producto de ejemplo (borrar esta fila)",
    unit_of_measure: "unidad",
    category: "Categoría ejemplo",
    suggested_price: 150,
    warehouse_code: warehouses[0]?.code ?? "BOD-01",
    initial_quantity: 10,
    initial_unit_cost: 100,
  };
  const ws = XLSX.utils.json_to_sheet([example], { header: [...TEMPLATE_HEADERS] });
  ws["!cols"] = TEMPLATE_HEADERS.map((h) => ({ wch: Math.max(h.length + 4, 18) }));

  const instructions = [
    ["Instrucciones para importar productos"],
    [""],
    ["Columna", "Obligatorio", "Descripción"],
    ["sku", "Sí", "Código único del producto. No puede repetirse en el sistema ni dentro del archivo."],
    ["name", "Sí", "Nombre del producto."],
    ["unit_of_measure", "No", "Unidad de medida. Si se deja vacío se usa \"unidad\"."],
    ["category", "No", "Categoría libre del producto."],
    ["suggested_price", "No", "Precio sugerido de venta. Numérico mayor o igual a 0. Vacío = 0."],
    ["warehouse_code", "Sí", "Código de una bodega ACTIVA ya creada en la pestaña Bodegas."],
    ["initial_quantity", "No", "Existencia inicial. Numérico mayor o igual a 0. Vacío = 0."],
    ["initial_unit_cost", "Condicional", "Costo unitario inicial. Obligatorio solo si initial_quantity es mayor a 0."],
    [""],
    ["IMPORTANTE: la primera hoja incluye una FILA DE EJEMPLO. Bórrala antes de importar."],
    [""],
    ["Bodegas activas disponibles:"],
    ["Código", "Nombre"],
    ...warehouses.filter((w) => w.is_active).map((w) => [w.code, w.name]),
  ];
  const wsi = XLSX.utils.aoa_to_sheet(instructions);
  wsi["!cols"] = [{ wch: 24 }, { wch: 14 }, { wch: 80 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Productos");
  XLSX.utils.book_append_sheet(wb, wsi, "Instrucciones");
  XLSX.writeFile(wb, "Plantilla_Importacion_Productos.xlsx");
}

export function ImportItemsWizard({
  enterpriseId, warehouses, onClose,
}: {
  enterpriseId: number;
  warehouses: InventoryWarehouse[];
  onClose: (imported: boolean) => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const activeWarehouses = useMemo(() => warehouses.filter((w) => w.is_active), [warehouses]);
  const validRows = useMemo(() => rows.filter((r) => r.errors.length === 0), [rows]);
  const invalidCount = rows.length - validRows.length;

  const handleFile = useCallback(async (file: File) => {
    setParsing(true);
    setOutcome(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const sheetName =
        wb.SheetNames.find((s) => norm(s) === norm("Productos")) ?? wb.SheetNames[0];
      if (!sheetName) throw new Error("El archivo no contiene hojas.");
      const raw = XLSX.utils.sheet_to_json<ExcelRow>(wb.Sheets[sheetName], { defval: null });

      const { data: existing, error: existingError } = await supabase
        .from("tab_inventory_items")
        .select("sku")
        .eq("enterprise_id", enterpriseId);
      if (existingError) throw existingError;
      const existingSkus = new Set(
        (existing ?? []).map((r) => String(r.sku).trim().toLowerCase())
      );

      const warehouseByCode = new Map(
        activeWarehouses.map((w) => [w.code.trim().toLowerCase(), w])
      );

      const seen = new Map<string, number>();
      const parsed: ParsedRow[] = [];

      raw.forEach((r, idx) => {
        const rowNum = typeof r.__rowNum__ === "number" ? r.__rowNum__ + 1 : idx + 2;
        const sku = asText(pick(r, "sku"));
        const name = asText(pick(r, "name"));
        const uom = asText(pick(r, "unit_of_measure"));
        const category = asText(pick(r, "category"));
        const whCode = asText(pick(r, "warehouse_code"));
        const price = asNumber(pick(r, "suggested_price"));
        const qty = asNumber(pick(r, "initial_quantity"));
        const cost = asNumber(pick(r, "initial_unit_cost"));

        // Fila totalmente vacía: se ignora
        if (!sku && !name && !whCode && price.empty && qty.empty) return;

        const errors: string[] = [];
        if (!sku) errors.push("El código (sku) es obligatorio.");
        if (!name) errors.push("El nombre (name) es obligatorio.");

        const skuKey = sku.toLowerCase();
        if (sku && existingSkus.has(skuKey)) {
          errors.push(`El código "${sku}" ya existe en el catálogo de esta empresa.`);
        }
        if (sku && seen.has(skuKey)) {
          errors.push(`El código "${sku}" está duplicado en el archivo (fila ${seen.get(skuKey)}).`);
        } else if (sku) {
          seen.set(skuKey, rowNum);
        }

        const wh = whCode ? warehouseByCode.get(whCode.toLowerCase()) : undefined;
        if (!whCode) errors.push("El código de bodega (warehouse_code) es obligatorio.");
        else if (!wh) errors.push(`No existe una bodega activa con el código "${whCode}".`);

        if (!price.valid) errors.push("El precio sugerido no es numérico.");
        else if (price.value < 0) errors.push("El precio sugerido no puede ser negativo.");

        if (!qty.valid) errors.push("La cantidad inicial no es numérica.");
        else if (qty.value < 0) errors.push("La cantidad inicial no puede ser negativa.");

        if (qty.valid && qty.value > 0) {
          if (cost.empty) errors.push("El costo unitario inicial es obligatorio cuando hay cantidad inicial.");
          else if (!cost.valid) errors.push("El costo unitario inicial no es numérico.");
          else if (cost.value < 0) errors.push("El costo unitario inicial no puede ser negativo.");
        } else if (!cost.valid) {
          errors.push("El costo unitario inicial no es numérico.");
        }

        parsed.push({
          excelRow: rowNum,
          sku,
          name,
          unit_of_measure: uom || "unidad",
          category: category || null,
          suggested_price: price.valid ? price.value : 0,
          warehouse_code: whCode,
          warehouse_id: wh?.id ?? null,
          initial_quantity: qty.valid ? qty.value : 0,
          initial_unit_cost: cost.valid ? cost.value : 0,
          errors,
        });
      });

      if (parsed.length === 0) {
        toast({
          title: "Archivo sin datos",
          description: "No se encontraron filas con información en la hoja de productos.",
          variant: "destructive",
        });
      }
      setFileName(file.name);
      setRows(parsed);
      setStep(2);
    } catch (err) {
      toast({ title: "No se pudo leer el archivo", description: errorMessage(err), variant: "destructive" });
    } finally {
      setParsing(false);
    }
  }, [enterpriseId, activeWarehouses]);

  const runImport = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    const result: ImportOutcome = { created: [], failed: [], movementFailed: [] };
    try {
      const { data: userData } = await supabase.auth.getUser();
      const createdBy = userData.user?.id ?? null;
      const today = new Date().toISOString().slice(0, 10);

      const payload = validRows.map((r) => ({
        enterprise_id: enterpriseId,
        warehouse_id: r.warehouse_id as number,
        sku: r.sku,
        name: r.name,
        unit_of_measure: r.unit_of_measure,
        suggested_price: r.suggested_price,
        category: r.category,
      }));

      const { data: inserted, error: insertError } = await supabase
        .from("tab_inventory_items")
        .insert(payload)
        .select("id,sku");

      if (insertError || !inserted) {
        // Fallback fila por fila para identificar exactamente cuáles fallan
        for (const r of validRows) {
          const { data: one, error: oneError } = await supabase
            .from("tab_inventory_items")
            .insert({
              enterprise_id: enterpriseId,
              warehouse_id: r.warehouse_id as number,
              sku: r.sku,
              name: r.name,
              unit_of_measure: r.unit_of_measure,
              suggested_price: r.suggested_price,
              category: r.category,
            })
            .select("id,sku")
            .maybeSingle();
          if (oneError || !one) {
            result.failed.push({ sku: r.sku, reason: oneError ? errorMessage(oneError) : "No se recibió confirmación del servidor." });
            continue;
          }
          result.created.push(r.sku);
          if (r.initial_quantity > 0) {
            const { error: mvError } = await supabase.from("tab_inventory_movements").insert({
              enterprise_id: enterpriseId,
              item_id: one.id,
              movement_type: "entrada",
              adjustment_direction: null,
              quantity: r.initial_quantity,
              unit_cost: r.initial_unit_cost,
              movement_date: today,
              reference: "Importación inicial",
              notes: null,
              created_by: createdBy,
            });
            if (mvError) result.movementFailed.push({ sku: r.sku, reason: errorMessage(mvError) });
          }
        }
      } else {
        const idBySku = new Map(inserted.map((i) => [String(i.sku), i.id]));
        for (const r of validRows) {
          const id = idBySku.get(r.sku);
          if (id === undefined) {
            result.failed.push({ sku: r.sku, reason: "El servidor no devolvió el producto creado." });
            continue;
          }
          result.created.push(r.sku);
          if (r.initial_quantity > 0) {
            const { error: mvError } = await supabase.from("tab_inventory_movements").insert({
              enterprise_id: enterpriseId,
              item_id: id,
              movement_type: "entrada",
              adjustment_direction: null,
              quantity: r.initial_quantity,
              unit_cost: r.initial_unit_cost,
              movement_date: today,
              reference: "Importación inicial",
              notes: null,
              created_by: createdBy,
            });
            if (mvError) result.movementFailed.push({ sku: r.sku, reason: errorMessage(mvError) });
          }
        }
      }
    } catch (err) {
      toast({ title: "Error durante la importación", description: errorMessage(err), variant: "destructive" });
    } finally {
      setImporting(false);
      setOutcome(result);
      if (result.created.length > 0) {
        toast({ title: `${result.created.length} producto(s) importado(s) correctamente` });
      }
    }
  };

  const finished = outcome !== null;

  return (
    <Dialog open onOpenChange={(o) => !o && !importing && onClose(!!outcome && outcome.created.length > 0)}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Importar productos desde Excel
          </DialogTitle>
          <DialogDescription>
            Paso {step} de 3 — {step === 1 ? "descarga la plantilla" : step === 2 ? "sube y valida tu archivo" : "confirma la importación"}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            {activeWarehouses.length === 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>No hay bodegas activas</AlertTitle>
                <AlertDescription>
                  Crea al menos una bodega en la pestaña “Bodegas” antes de importar productos.
                </AlertDescription>
              </Alert>
            )}
            <p className="text-sm text-muted-foreground">
              Descarga la plantilla, llénala con tus productos (borra la fila de ejemplo) y luego súbela en el
              siguiente paso. La hoja “Instrucciones” describe cada columna y lista los códigos de bodega disponibles.
            </p>
            <div className="rounded-md border p-4 text-sm">
              <p className="font-medium mb-2">Columnas de la plantilla</p>
              <code className="text-xs break-all">{TEMPLATE_HEADERS.join(" · ")}</code>
            </div>
            <Button variant="outline" onClick={() => downloadTemplate(warehouses)} className="gap-2">
              <Download className="h-4 w-4" /> Descargar plantilla
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={parsing} className="gap-2">
                {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {rows.length > 0 ? "Cambiar archivo" : "Seleccionar archivo"}
              </Button>
              {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
              {rows.length > 0 && (
                <div className="flex gap-2">
                  <Badge variant="secondary">{validRows.length} válidas</Badge>
                  {invalidCount > 0 && <Badge variant="destructive">{invalidCount} con error</Badge>}
                </div>
              )}
            </div>
            {rows.length > 0 && (
              <div className="rounded-md border max-h-[45vh] overflow-y-auto min-h-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">Fila</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Producto</TableHead>
                      <TableHead>Bodega</TableHead>
                      <TableHead className="text-right">Cant. inicial</TableHead>
                      <TableHead className="text-right">Costo</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.excelRow} className={r.errors.length > 0 ? "bg-destructive/5" : undefined}>
                        <TableCell className="text-muted-foreground">{r.excelRow}</TableCell>
                        <TableCell className="font-mono text-xs">{r.sku || "—"}</TableCell>
                        <TableCell>{r.name || "—"}</TableCell>
                        <TableCell>{r.warehouse_code || "—"}</TableCell>
                        <TableCell className="text-right">{r.initial_quantity}</TableCell>
                        <TableCell className="text-right">{r.initial_unit_cost}</TableCell>
                        <TableCell>
                          {r.errors.length === 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Válida
                            </span>
                          ) : (
                            <ul className="text-xs text-destructive list-disc pl-4 space-y-0.5">
                              {r.errors.map((e, i) => <li key={i}>{e}</li>)}
                            </ul>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            {!finished && (
              <>
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>Se importarán {validRows.length} productos válidos</AlertTitle>
                  <AlertDescription>
                    {invalidCount > 0
                      ? `${invalidCount} fila(s) con error serán omitidas.`
                      : "Todas las filas del archivo son válidas."}
                    {" "}Las filas con existencia inicial generarán un movimiento de entrada con referencia “Importación inicial”.
                  </AlertDescription>
                </Alert>
              </>
            )}
            {finished && outcome && (
              <div className="space-y-3">
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>{outcome.created.length} productos importados correctamente</AlertTitle>
                  <AlertDescription>
                    {outcome.failed.length === 0 && outcome.movementFailed.length === 0
                      ? "La importación finalizó sin incidencias."
                      : "Revisa el detalle de incidencias más abajo."}
                  </AlertDescription>
                </Alert>
                {outcome.failed.length > 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>{outcome.failed.length} producto(s) NO se crearon</AlertTitle>
                    <AlertDescription>
                      <ul className="list-disc pl-4 text-xs space-y-0.5">
                        {outcome.failed.map((f) => <li key={f.sku}>{f.sku}: {f.reason}</li>)}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
                {outcome.movementFailed.length > 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Productos creados sin su existencia inicial</AlertTitle>
                    <AlertDescription>
                      <ul className="list-disc pl-4 text-xs space-y-0.5">
                        {outcome.movementFailed.map((f) => <li key={f.sku}>{f.sku}: {f.reason}</li>)}
                      </ul>
                      Registra el saldo inicial manualmente desde “Movimiento”.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void handleFile(f);
          }}
        />

        <DialogFooter className="gap-2">
          {finished ? (
            <Button onClick={() => onClose(outcome!.created.length > 0)}>Cerrar</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onClose(false)} disabled={importing}>Cancelar</Button>
              {step > 1 && (
                <Button variant="outline" onClick={() => setStep(step === 3 ? 2 : 1)} disabled={importing}>
                  Atrás
                </Button>
              )}
              {step === 1 && (
                <Button onClick={() => setStep(2)} disabled={activeWarehouses.length === 0}>Continuar</Button>
              )}
              {step === 2 && (
                <Button onClick={() => setStep(3)} disabled={validRows.length === 0}>
                  Continuar ({validRows.length} válidas)
                </Button>
              )}
              {step === 3 && (
                <Button onClick={runImport} disabled={importing || validRows.length === 0}>
                  {importing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Confirmar importación de {validRows.length} productos
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
