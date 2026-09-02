import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useEnterprise } from "@/contexts/EnterpriseContext";
import { useTenant } from "@/contexts/TenantContext";
import { fetchAllRecords } from "@/utils/supabaseHelpers";
import { exportToPDF } from "@/utils/reportExport";
import { usePdfConfig } from "@/hooks/usePdfConfig";
import { useFormShortcuts } from "@/hooks/useFormShortcuts";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Package, Plus, Search, ShieldAlert, FileDown, Pencil, Power, Warehouse, Upload } from "lucide-react";
import { ImportItemsWizard } from "./ImportItemsWizard";
import { InventoryReportsTab } from "./InventoryReportsTab";



// ---------- Types ----------

export interface InventoryWarehouse {
  id: number;
  enterprise_id: number;
  code: string;
  name: string;
  address: string | null;
  is_active: boolean;
}

export interface InventoryItem {
  id: number;
  enterprise_id: number;
  warehouse_id: number;
  sku: string;
  name: string;
  unit_of_measure: string;
  unit_cost: number;
  suggested_price: number;
  category: string | null;
  current_quantity: number;
  is_active: boolean;
}

type MovementType = "entrada" | "salida" | "ajuste";
type AdjustmentDirection = "positivo" | "negativo";

export interface InventoryMovement {
  id: number;
  item_id: number;
  movement_type: MovementType;
  adjustment_direction: AdjustmentDirection | null;
  quantity: number;
  unit_cost: number;
  movement_date: string;
  reference: string | null;
  notes: string | null;
}

interface RawMovementRow {
  id: number;
  item_id: number;
  movement_type: string;
  adjustment_direction: string | null;
  quantity: number;
  unit_cost: number;
  movement_date: string;
  reference: string | null;
  notes: string | null;
}

function toMovement(r: RawMovementRow): InventoryMovement {
  const type: MovementType =
    r.movement_type === "entrada" || r.movement_type === "salida" || r.movement_type === "ajuste"
      ? r.movement_type
      : "ajuste";
  const dir: AdjustmentDirection | null =
    r.adjustment_direction === "positivo" || r.adjustment_direction === "negativo"
      ? r.adjustment_direction
      : null;
  return { ...r, movement_type: type, adjustment_direction: dir };
}

const MOVEMENT_LABEL: Record<MovementType, string> = {
  entrada: "Entrada",
  salida: "Salida",
  ajuste: "Ajuste",
};

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(n || 0);

const formatQty = (n: number) =>
  new Intl.NumberFormat("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(n || 0);

const todayISO = () => new Date().toISOString().slice(0, 10);

function errorMessage(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "Ocurrió un error inesperado.";
}

// ---------- Item dialog ----------

interface ItemFormState {
  warehouse_id: string;
  sku: string;
  name: string;
  unit_of_measure: string;
  suggested_price: string;
  category: string;
}

function ItemDialog({
  enterpriseId, item, warehouses, onClose,
}: {
  enterpriseId: number;
  item: InventoryItem | null;
  warehouses: InventoryWarehouse[];
  onClose: (saved: boolean) => void;
}) {
  const activeWarehouses = warehouses.filter((w) => w.is_active || w.id === item?.warehouse_id);
  const noWarehouses = activeWarehouses.length === 0;
  const [form, setForm] = useState<ItemFormState>({
    warehouse_id: item ? String(item.warehouse_id) : "",
    sku: item?.sku ?? "",
    name: item?.name ?? "",
    unit_of_measure: item?.unit_of_measure ?? "unidad",
    suggested_price: item ? String(item.suggested_price) : "0",
    category: item?.category ?? "",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.sku.trim() || !form.name.trim()) {
      toast({ title: "Datos incompletos", description: "El código y el nombre son obligatorios.", variant: "destructive" });
      return;
    }
    const warehouseId = Number(form.warehouse_id);
    if (!warehouseId) {
      toast({ title: "Bodega requerida", description: "Selecciona la bodega a la que pertenece el producto.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      enterprise_id: enterpriseId,
      warehouse_id: warehouseId,
      sku: form.sku.trim(),
      name: form.name.trim(),
      unit_of_measure: form.unit_of_measure.trim() || "unidad",
      suggested_price: Number(form.suggested_price) || 0,
      category: form.category.trim() || null,
    };
    const { error } = item
      ? await supabase.from("tab_inventory_items").update(payload).eq("id", item.id)
      : await supabase.from("tab_inventory_items").insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: "No se pudo guardar", description: errorMessage(error), variant: "destructive" });
      return;
    }
toast({ title: item ? "Producto actualizado" : "Producto creado" });
    onClose(true);
  };

  useFormShortcuts({
    isEnabled: true,
    onSave: save,
    onCancel: () => onClose(false),
    isDirty: false,
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? "Editar producto" : "Nuevo producto"}</DialogTitle>
          <DialogDescription>
            El costo promedio se calcula automáticamente con los movimientos del kardex.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {noWarehouses && (
            <Alert variant="destructive">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>No hay bodegas creadas</AlertTitle>
              <AlertDescription>
                Crea al menos una bodega en la pestaña “Bodegas” antes de registrar productos.
              </AlertDescription>
            </Alert>
          )}
          <div>
            <Label>Bodega</Label>
            <Select
              value={form.warehouse_id}
              onValueChange={(v) => setForm({ ...form, warehouse_id: v })}
              disabled={noWarehouses}
            >
              <SelectTrigger><SelectValue placeholder="Selecciona una bodega" /></SelectTrigger>
              <SelectContent>
                {activeWarehouses.map((w) => (
                  <SelectItem key={w.id} value={String(w.id)}>{w.code} — {w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Código (SKU)</Label>
              <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </div>
            <div>
              <Label>Unidad de medida</Label>
              <Input
                value={form.unit_of_measure}
                placeholder="unidad, libra, quintal, caja…"
                onChange={(e) => setForm({ ...form, unit_of_measure: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>Nombre</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Precio sugerido (Q)</Label>
              <Input
                type="number" step="0.01" min="0"
                value={form.suggested_price}
                onChange={(e) => setForm({ ...form, suggested_price: e.target.value })}
              />
            </div>
            <div>
              <Label>Categoría (opcional)</Label>
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
          </div>
          {item && (
            <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/40 p-3 text-sm">
              <div>
                <span className="text-muted-foreground">Costo promedio actual</span>
                <div className="font-medium">{formatCurrency(Number(item.unit_cost))}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Existencia actual</span>
                <div className="font-medium">{formatQty(Number(item.current_quantity))}</div>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving || noWarehouses}>{saving ? "Guardando…" : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Warehouse dialog ----------

function WarehouseDialog({
  enterpriseId, warehouse, onClose,
}: { enterpriseId: number; warehouse: InventoryWarehouse | null; onClose: (saved: boolean) => void }) {
  const [code, setCode] = useState(warehouse?.code ?? "");
  const [name, setName] = useState(warehouse?.name ?? "");
  const [address, setAddress] = useState(warehouse?.address ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!code.trim() || !name.trim()) {
      toast({ title: "Datos incompletos", description: "El código y el nombre son obligatorios.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      enterprise_id: enterpriseId,
      code: code.trim(),
      name: name.trim(),
      address: address.trim() || null,
    };
    const { error } = warehouse
      ? await supabase.from("tab_inventory_warehouses").update(payload).eq("id", warehouse.id)
      : await supabase.from("tab_inventory_warehouses").insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: "No se pudo guardar", description: errorMessage(error), variant: "destructive" });
      return;
    }
toast({ title: warehouse ? "Bodega actualizada" : "Bodega creada" });
    onClose(true);
  };

  useFormShortcuts({
    isEnabled: true,
    onSave: save,
    onCancel: () => onClose(false),
    isDirty: false,
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{warehouse ? "Editar bodega" : "Nueva bodega"}</DialogTitle>
          <DialogDescription>Cada producto pertenece a una sola bodega.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Código</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="BOD-01" />
            </div>
            <div>
              <Label>Nombre</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bodega central" />
            </div>
          </div>
          <div>
            <Label>Dirección (opcional)</Label>
            <Textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Movement dialog ----------

function MovementDialog({
  enterpriseId, items, onClose,
}: { enterpriseId: number; items: InventoryItem[]; onClose: (saved: boolean) => void }) {
  const [itemId, setItemId] = useState<string>("");
  const [type, setType] = useState<MovementType>("entrada");
  const [direction, setDirection] = useState<AdjustmentDirection>("positivo");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [date, setDate] = useState(todayISO());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const selected = items.find((i) => String(i.id) === itemId) || null;

  const save = async () => {
    if (!selected) {
      toast({ title: "Selecciona un producto", variant: "destructive" });
      return;
    }
    const qty = Number(quantity);
    if (!(qty > 0)) {
      toast({ title: "Cantidad inválida", description: "La cantidad debe ser mayor a cero.", variant: "destructive" });
      return;
    }
    const cost = type === "entrada" ? Number(unitCost) : 0;
    if (type === "entrada" && !(cost >= 0)) {
      toast({ title: "Costo inválido", description: "Ingresa el costo unitario de la entrada.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("tab_inventory_movements").insert({
      enterprise_id: enterpriseId,
      item_id: selected.id,
      movement_type: type,
      adjustment_direction: type === "ajuste" ? direction : null,
      quantity: qty,
      unit_cost: cost,
      movement_date: date,
      reference: reference.trim() || null,
      notes: notes.trim() || null,
      created_by: userData.user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      toast({ title: "No se pudo registrar el movimiento", description: errorMessage(error), variant: "destructive" });
      return;
    }
    toast({ title: "Movimiento registrado" });
    onClose(true);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar movimiento</DialogTitle>
          <DialogDescription>
            En salidas y ajustes el costo unitario se toma automáticamente del costo promedio vigente.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Producto</Label>
            <Select value={itemId} onValueChange={setItemId}>
              <SelectTrigger><SelectValue placeholder="Selecciona un producto" /></SelectTrigger>
              <SelectContent>
                {items.filter((i) => i.is_active).map((i) => (
                  <SelectItem key={i.id} value={String(i.id)}>
                    {i.sku} — {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected && (
              <p className="text-xs text-muted-foreground mt-1">
                Existencia: {formatQty(Number(selected.current_quantity))} {selected.unit_of_measure} ·
                {" "}Costo promedio: {formatCurrency(Number(selected.unit_cost))}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as MovementType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">Entrada</SelectItem>
                  <SelectItem value="salida">Salida</SelectItem>
                  <SelectItem value="ajuste">Ajuste</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {type === "ajuste" ? (
              <div>
                <Label>Dirección del ajuste</Label>
                <Select value={direction} onValueChange={(v) => setDirection(v as AdjustmentDirection)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="positivo">Positivo (suma)</SelectItem>
                    <SelectItem value="negativo">Negativo (resta)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <Label>Fecha</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Cantidad</Label>
              <Input type="number" step="0.0001" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            {type === "entrada" ? (
              <div>
                <Label>Costo unitario (Q)</Label>
                <Input type="number" step="0.0001" min="0" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
              </div>
            ) : (
              <div>
                <Label>Costo unitario (Q)</Label>
                <Input value={selected ? formatCurrency(Number(selected.unit_cost)) : "—"} readOnly disabled />
              </div>
            )}
          </div>
          {type === "ajuste" && (
            <div>
              <Label>Fecha</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          )}
          <div>
            <Label>Referencia (opcional)</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="No. de factura o documento" />
          </div>
          <div>
            <Label>Notas (opcional)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Guardando…" : "Registrar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Main page ----------

export default function InventoryPage() {
  const { selectedEnterprise } = useEnterprise();
  const { hasModule, isLoading: tenantLoading } = useTenant();
  const navigate = useNavigate();
  const pdfConfig = usePdfConfig();

  const moduleEnabled = hasModule("inventario");
  const [enterpriseModuleEnabled, setEnterpriseModuleEnabled] = useState<boolean | null>(null);

  const [warehouses, setWarehouses] = useState<InventoryWarehouse[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [showItemDialog, setShowItemDialog] = useState(false);
  const [showMovementDialog, setShowMovementDialog] = useState(false);
  const [showImportWizard, setShowImportWizard] = useState(false);
const [editWarehouse, setEditWarehouse] = useState<InventoryWarehouse | null>(null);

  const [showWarehouseDialog, setShowWarehouseDialog] = useState(false);

  const [activeTab, setActiveTab] = useState<"bodegas" | "catalogo" | "kardex" | "saldos" | "reportes">("bodegas");

  const [filterItemId, setFilterItemId] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Sticky header con histéresis de dos umbrales (60 comprimir / 20 expandir)
  const [isCompact, setIsCompact] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setIsCompact((prev) => (prev ? y > 20 : y > 60));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selectedEnterprise || !moduleEnabled) { setEnterpriseModuleEnabled(null); return; }
      const { data } = await supabase
        .from("tab_enterprise_modules")
        .select("is_enabled")
        .eq("enterprise_id", selectedEnterprise.id)
        .eq("module_key", "inventario")
        .maybeSingle();
      if (cancelled) return;
      setEnterpriseModuleEnabled(!!data?.is_enabled);
    })();
return () => { cancelled = true; };
  }, [selectedEnterprise, moduleEnabled]);

  // Alt+N shortcut — new warehouse or product according to the active tab
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.altKey && e.key.toLowerCase() === "n")) return;
      if (showWarehouseDialog || showItemDialog || showMovementDialog || showImportWizard) return;
      e.preventDefault();
      if (activeTab === "bodegas") {
        setEditWarehouse(null);
        setShowWarehouseDialog(true);
      } else if (activeTab === "catalogo") {
        setEditItem(null);
        setShowItemDialog(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab, showWarehouseDialog, showItemDialog, showMovementDialog, showImportWizard]);

  const load = useCallback(async () => {
    if (!selectedEnterprise || !moduleEnabled) {
      setItems([]); setMovements([]); setWarehouses([]);
      return;
    }
    setLoading(true);
    try {
      const enterpriseId = selectedEnterprise.id;
      const [warehouseRows, itemRows, movementRows] = await Promise.all([
        fetchAllRecords<InventoryWarehouse>(() =>
          supabase
            .from("tab_inventory_warehouses")
            .select("id,enterprise_id,code,name,address,is_active")
            .eq("enterprise_id", enterpriseId)
            .order("code", { ascending: true })
        ),
        fetchAllRecords<InventoryItem>(() =>
          supabase
            .from("tab_inventory_items")
            .select("id,enterprise_id,warehouse_id,sku,name,unit_of_measure,unit_cost,suggested_price,category,current_quantity,is_active")
            .eq("enterprise_id", enterpriseId)
            .order("sku", { ascending: true })
        ),
        fetchAllRecords<RawMovementRow>(() =>
          supabase
            .from("tab_inventory_movements")
            .select("id,item_id,movement_type,adjustment_direction,quantity,unit_cost,movement_date,reference,notes")
            .eq("enterprise_id", enterpriseId)
            .order("movement_date", { ascending: true })
            .order("id", { ascending: true })
        ),
      ]);
      setWarehouses(warehouseRows);
      setItems(itemRows);
      setMovements(movementRows.map(toMovement));
    } catch (err) {
      toast({ title: "Error al cargar inventario", description: errorMessage(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [selectedEnterprise, moduleEnabled]);

  useEffect(() => { load(); }, [load]);

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const warehousesById = useMemo(() => new Map(warehouses.map((w) => [w.id, w])), [warehouses]);
  const warehouseName = useCallback(
    (id: number) => warehousesById.get(id)?.name ?? "—",
    [warehousesById]
  );

  const itemCountByWarehouse = useMemo(() => {
    const m = new Map<number, number>();
    items.forEach((i) => m.set(i.warehouse_id, (m.get(i.warehouse_id) ?? 0) + 1));
    return m;
  }, [items]);

  const movementCountByItem = useMemo(() => {
    const m = new Map<number, number>();
    movements.forEach((mv) => m.set(mv.item_id, (m.get(mv.item_id) ?? 0) + 1));
    return m;
  }, [movements]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (!showInactive && !i.is_active) return false;
      if (!q) return true;
      return (
        i.sku.toLowerCase().includes(q) ||
        i.name.toLowerCase().includes(q) ||
        (i.category || "").toLowerCase().includes(q)
      );
    });
  }, [items, search, showInactive]);

  // Kardex: saldo acumulado por producto en orden cronológico
  const kardexRows = useMemo(() => {
    const running = new Map<number, number>();
    const rows = movements.map((mv) => {
      const isDecrease = mv.movement_type === "salida" || (mv.movement_type === "ajuste" && mv.adjustment_direction === "negativo");
      const prev = running.get(mv.item_id) ?? 0;
      const balance = isDecrease ? prev - Number(mv.quantity) : prev + Number(mv.quantity);
      running.set(mv.item_id, balance);
      return { ...mv, isDecrease, balance };
    });
    return rows
      .filter((r) => (filterItemId === "all" ? true : String(r.item_id) === filterItemId))
      .filter((r) => (dateFrom ? r.movement_date >= dateFrom : true))
      .filter((r) => (dateTo ? r.movement_date <= dateTo : true))
      .reverse();
  }, [movements, filterItemId, dateFrom, dateTo]);

  const balances = useMemo(() => {
    const list = items
      .filter((i) => i.is_active || Number(i.current_quantity) !== 0)
      .map((i) => ({
        item: i,
        value: Math.round(Number(i.current_quantity) * Number(i.unit_cost) * 100) / 100,
      }));
    const total = list.reduce((s, r) => s + r.value, 0);
    return { list, total: Math.round(total * 100) / 100 };
  }, [items]);

  const exportBalancesPdf = () => {
    exportToPDF({
      filename: `saldos_inventario_${todayISO()}`,
      title: "Saldos de Inventario",
      enterpriseName: selectedEnterprise?.business_name ?? "",
      headers: ["Código", "Producto", "Bodega", "Unidad", "Existencia", "Costo promedio", "Valorización"],
      data: balances.list.map((r) => [
        r.item.sku,
        r.item.name,
        warehouseName(r.item.warehouse_id),
        r.item.unit_of_measure,
        formatQty(Number(r.item.current_quantity)),
        formatCurrency(Number(r.item.unit_cost)),
        formatCurrency(r.value),
      ]),
      totals: [{ label: "Valorización total", value: formatCurrency(balances.total) }],
      pdfTypography: { fontFamily: pdfConfig.fontFamily, fontSize: pdfConfig.fontSize },
      monochrome: true,
      pageNumbers: true,
    });
  };

  const toggleActive = async (item: InventoryItem) => {
    const { error } = await supabase
      .from("tab_inventory_items")
      .update({ is_active: !item.is_active })
      .eq("id", item.id);
    if (error) {
      toast({ title: "No se pudo actualizar", description: errorMessage(error), variant: "destructive" });
      return;
    }
    toast({ title: item.is_active ? "Producto desactivado" : "Producto activado" });
    load();
  };

  const toggleWarehouseActive = async (w: InventoryWarehouse) => {
    const { error } = await supabase
      .from("tab_inventory_warehouses")
      .update({ is_active: !w.is_active })
      .eq("id", w.id);
    if (error) {
      toast({ title: "No se pudo actualizar", description: errorMessage(error), variant: "destructive" });
      return;
    }
    toast({ title: w.is_active ? "Bodega desactivada" : "Bodega activada" });
    load();
  };

  if (tenantLoading) return null;

  if (!moduleEnabled) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Módulo no habilitado</AlertTitle>
          <AlertDescription>
            El módulo de Inventario no está activo para esta oficina. Contacta a tu administrador.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div
        className={cn(
          "sticky top-0 z-20 -mx-6 px-6 bg-background/95 backdrop-blur border-b transition-all",
          isCompact ? "py-2" : "py-4"
        )}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className={cn("font-bold flex items-center gap-2 transition-all", isCompact ? "text-lg" : "text-2xl")}>
              <Package className={isCompact ? "h-4 w-4" : "h-5 w-5"} /> Inventario
            </h1>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size={isCompact ? "sm" : "default"}
              onClick={() => setShowMovementDialog(true)}
              disabled={items.length === 0}
            >
              <Plus className="h-4 w-4 mr-1" /> Movimiento
            </Button>
          </div>
        </div>
      </div>

      {enterpriseModuleEnabled === false && (
        <Alert className="border-amber-500/50 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Módulo desactivado para esta empresa</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span>
              El módulo de inventario está desactivado para esta empresa. Actívalo en
              Editar Empresa → Módulos para usarlo.
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate(`/empresas?edit=${selectedEnterprise?.id}&tab=modules`)}
            >
              Ir a Ajustes
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList>
          <TabsTrigger value="bodegas">Bodegas</TabsTrigger>
          <TabsTrigger value="catalogo">Catálogo de Productos</TabsTrigger>
          <TabsTrigger value="kardex">Movimientos (Kardex)</TabsTrigger>
          <TabsTrigger value="saldos">Saldos Actuales</TabsTrigger>
          <TabsTrigger value="reportes">Reportes</TabsTrigger>

        </TabsList>

        {/* --- Bodegas --- */}
        <TabsContent value="bodegas" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base flex items-center gap-2">
                <Warehouse className="h-4 w-4" /> Bodegas ({warehouses.length})
              </CardTitle>
<Button size="sm" onClick={() => { setEditWarehouse(null); setShowWarehouseDialog(true); }}>
                <Plus className="h-4 w-4 mr-1" /> Nuevo
                <kbd className="ml-1.5 px-1 py-0.5 text-[10px] bg-primary-foreground/20 rounded border border-primary-foreground/30 font-mono">
                  Alt+N
                </kbd>
              </Button>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Dirección</TableHead>
                      <TableHead className="text-right">Productos</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading && (
                      <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Cargando…</TableCell></TableRow>
                    )}
                    {!loading && warehouses.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Sin bodegas registradas.</TableCell></TableRow>
                    )}
                    {warehouses.map((w) => (
                      <TableRow key={w.id} className={w.is_active ? "" : "opacity-60"}>
                        <TableCell className="font-mono text-xs">{w.code}</TableCell>
                        <TableCell className="font-medium">
                          {w.name}
                          {!w.is_active && <Badge variant="secondary" className="ml-2">Inactiva</Badge>}
                        </TableCell>
                        <TableCell className="max-w-[280px] truncate">{w.address || "—"}</TableCell>
                        <TableCell className="text-right">{itemCountByWarehouse.get(w.id) ?? 0}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button variant="ghost" size="sm" onClick={() => { setEditWarehouse(w); setShowWarehouseDialog(true); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleWarehouseActive(w)}
                            title={
                              (itemCountByWarehouse.get(w.id) ?? 0) > 0
                                ? "Tiene productos asignados: solo puede desactivarse"
                                : w.is_active ? "Desactivar" : "Activar"
                            }
                          >
                            <Power className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Las bodegas no se eliminan: se desactivan para conservar la trazabilidad de los productos.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- Catálogo --- */}
        <TabsContent value="catalogo" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 flex-wrap">
              <CardTitle className="text-base">Productos ({filteredItems.length})</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8 w-[240px]"
                    placeholder="Buscar por código, nombre o categoría"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowInactive((v) => !v)}>
                  {showInactive ? "Ocultar inactivos" : "Ver inactivos"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowImportWizard(true)}>
                  <Upload className="h-4 w-4 mr-1" /> Importar desde Excel
                </Button>
<Button size="sm" onClick={() => { setEditItem(null); setShowItemDialog(true); }}>
                  <Plus className="h-4 w-4 mr-1" /> Nuevo
                  <kbd className="ml-1.5 px-1 py-0.5 text-[10px] bg-primary-foreground/20 rounded border border-primary-foreground/30 font-mono">
                    Alt+N
                  </kbd>
                </Button>
              </div>

            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Producto</TableHead>
                      <TableHead>Bodega</TableHead>
                      <TableHead>Unidad</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead className="text-right">Existencia</TableHead>
                      <TableHead className="text-right">Costo promedio</TableHead>
                      <TableHead className="text-right">Precio sugerido</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading && (
                      <TableRow><TableCell colSpan={9} className="text-center py-6 text-muted-foreground">Cargando…</TableCell></TableRow>
                    )}
                    {!loading && filteredItems.length === 0 && (
                      <TableRow><TableCell colSpan={9} className="text-center py-6 text-muted-foreground">Sin productos registrados.</TableCell></TableRow>
                    )}
                    {filteredItems.map((i) => (
                      <TableRow key={i.id} className={i.is_active ? "" : "opacity-60"}>
                        <TableCell className="font-mono text-xs">{i.sku}</TableCell>
                        <TableCell className="font-medium">
                          {i.name}
                          {!i.is_active && <Badge variant="secondary" className="ml-2">Inactivo</Badge>}
                        </TableCell>
                        <TableCell>{warehouseName(i.warehouse_id)}</TableCell>
                        <TableCell>{i.unit_of_measure}</TableCell>
                        <TableCell>{i.category || "—"}</TableCell>
                        <TableCell className="text-right">{formatQty(Number(i.current_quantity))}</TableCell>
                        <TableCell className="text-right">{formatCurrency(Number(i.unit_cost))}</TableCell>
                        <TableCell className="text-right">{formatCurrency(Number(i.suggested_price))}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button variant="ghost" size="sm" onClick={() => { setEditItem(i); setShowItemDialog(true); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleActive(i)}
                            title={
                              (movementCountByItem.get(i.id) ?? 0) > 0
                                ? "Tiene movimientos: solo puede desactivarse"
                                : i.is_active ? "Desactivar" : "Activar"
                            }
                          >
                            <Power className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Los productos no se eliminan: se desactivan para conservar la trazabilidad del kardex.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- Kardex --- */}
        <TabsContent value="kardex" className="mt-4">
          <Card>
            <CardHeader className="space-y-3">
              <CardTitle className="text-base">Kardex ({kardexRows.length} movimientos)</CardTitle>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <Label className="text-xs">Producto</Label>
                  <Select value={filterItemId} onValueChange={setFilterItemId}>
                    <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los productos</SelectItem>
                      {items.map((i) => (
                        <SelectItem key={i.id} value={String(i.id)}>{i.sku} — {i.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Desde</Label>
                  <Input type="date" className="w-[160px]" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Hasta</Label>
                  <Input type="date" className="w-[160px]" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
                <Button variant="outline" size="sm" onClick={() => { setFilterItemId("all"); setDateFrom(""); setDateTo(""); }}>
                  Limpiar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Producto</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead className="text-right">Costo unitario</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                      <TableHead>Referencia</TableHead>
                      <TableHead>Notas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {kardexRows.length === 0 && (
                      <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Sin movimientos.</TableCell></TableRow>
                    )}
                    {kardexRows.map((r) => {
                      const item = itemsById.get(r.item_id);
                      return (
                        <TableRow key={r.id}>
                          <TableCell>{new Date(r.movement_date + "T00:00:00").toLocaleDateString("es-GT")}</TableCell>
                          <TableCell className="max-w-[240px] truncate">{item ? `${item.sku} — ${item.name}` : "—"}</TableCell>
                          <TableCell>
                            <Badge variant={r.isDecrease ? "destructive" : "secondary"}>
                              {MOVEMENT_LABEL[r.movement_type]}
                              {r.adjustment_direction ? ` (${r.adjustment_direction})` : ""}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{r.isDecrease ? "-" : "+"}{formatQty(Number(r.quantity))}</TableCell>
                          <TableCell className="text-right">{formatCurrency(Number(r.unit_cost))}</TableCell>
                          <TableCell className="text-right font-medium">{formatQty(r.balance)}</TableCell>
                          <TableCell>{r.reference || "—"}</TableCell>
                          <TableCell className="max-w-[220px] truncate">{r.notes || "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- Saldos --- */}
        <TabsContent value="saldos" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">
                Saldos actuales ({balances.list.length}) · Valorización {formatCurrency(balances.total)}
              </CardTitle>
              <Button variant="outline" size="sm" onClick={exportBalancesPdf} disabled={balances.list.length === 0}>
                <FileDown className="h-4 w-4 mr-1" /> Exportar PDF
              </Button>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Producto</TableHead>
                      <TableHead>Bodega</TableHead>
                      <TableHead>Unidad</TableHead>
                      <TableHead className="text-right">Existencia</TableHead>
                      <TableHead className="text-right">Costo promedio</TableHead>
                      <TableHead className="text-right">Valorización</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {balances.list.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Sin existencias.</TableCell></TableRow>
                    )}
                    {balances.list.map((r) => (
                      <TableRow key={r.item.id}>
                        <TableCell className="font-mono text-xs">{r.item.sku}</TableCell>
                        <TableCell className="font-medium">{r.item.name}</TableCell>
                        <TableCell>{warehouseName(r.item.warehouse_id)}</TableCell>
                        <TableCell>{r.item.unit_of_measure}</TableCell>
                        <TableCell className="text-right">{formatQty(Number(r.item.current_quantity))}</TableCell>
                        <TableCell className="text-right">{formatCurrency(Number(r.item.unit_cost))}</TableCell>
                        <TableCell className="text-right">{formatCurrency(r.value)}</TableCell>
                      </TableRow>
                    ))}
                    {balances.list.length > 0 && (
                      <TableRow className="bg-muted/50 font-semibold">
                        <TableCell colSpan={6}>TOTAL</TableCell>
                        <TableCell className="text-right">{formatCurrency(balances.total)}</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- Reportes --- */}
        <TabsContent value="reportes" className="mt-4">
          {selectedEnterprise && (
            <InventoryReportsTab
              enterpriseId={selectedEnterprise.id}
              enterpriseName={selectedEnterprise.business_name ?? ""}
              items={items}
              movements={movements}
              warehouses={warehouses}
              pdfTypography={{ fontFamily: pdfConfig.fontFamily, fontSize: pdfConfig.fontSize }}
            />
          )}
        </TabsContent>
      </Tabs>


      {showWarehouseDialog && selectedEnterprise && (
        <WarehouseDialog
          enterpriseId={selectedEnterprise.id}
          warehouse={editWarehouse}
          onClose={(saved) => { setShowWarehouseDialog(false); setEditWarehouse(null); if (saved) load(); }}
        />
      )}
      {showItemDialog && selectedEnterprise && (
        <ItemDialog
          enterpriseId={selectedEnterprise.id}
          item={editItem}
          warehouses={warehouses}
          onClose={(saved) => { setShowItemDialog(false); setEditItem(null); if (saved) load(); }}
        />
      )}
      {showImportWizard && selectedEnterprise && (
        <ImportItemsWizard
          enterpriseId={selectedEnterprise.id}
          warehouses={warehouses}
          onClose={(imported) => { setShowImportWizard(false); if (imported) load(); }}
        />
      )}

      {showMovementDialog && selectedEnterprise && (
        <MovementDialog
          enterpriseId={selectedEnterprise.id}
          items={items}
          onClose={(saved) => { setShowMovementDialog(false); if (saved) load(); }}
        />
      )}
    </div>
  );
}
