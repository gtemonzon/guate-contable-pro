import { useState } from "react";
import {
  useFixedAssets, useAssetPolicy, useActivateAsset, useUpsertFixedAsset,
  useAssetCategories, useAssetLocations, useAssetCustodians, useAssetSuppliers,
  type FixedAsset,
} from "@/hooks/useFixedAssets";
import { useEnterprise } from "@/contexts/EnterpriseContext";
import { useTenant } from "@/contexts/TenantContext";
import { useEnterpriseBaseCurrency } from "@/hooks/useEnterpriseBaseCurrency";
import { useEnterpriseCurrencies } from "@/hooks/useEnterpriseCurrencies";
import { CurrencyAmountInput } from "@/components/shared/CurrencyAmountInput";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Search, Eye, Zap } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import AssetDetailDialog from "./AssetDetailDialog";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";
const STATUS_COLORS: Record<string, BadgeVariant> = {
  DRAFT: "secondary",
  ACTIVE: "default",
  DISPOSED: "outline",
  SOLD: "outline",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador", ACTIVE: "Activo", DISPOSED: "Baja", SOLD: "Vendido",
};

const fmt = (n: number) => n.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const EMPTY_ASSET: Partial<FixedAsset> = {
  asset_code: "", asset_name: "", acquisition_cost: 0, residual_value: 0,
  useful_life_months: 60, currency: "GTQ", acquisition_date: "", status: "DRAFT",
  exchange_rate_at_acquisition: 1, original_acquisition_cost: 0, original_residual_value: 0,
};

export default function AssetList() {
  const { selectedEnterpriseId: enterpriseId } = useEnterprise();
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id ?? null;
  const baseCurrency = useEnterpriseBaseCurrency(enterpriseId);
  const { items: enabledCurrencies } = useEnterpriseCurrencies(enterpriseId);
  const isMultiCurrency = enabledCurrencies.length > 0;

  const { data: assets = [], isLoading } = useFixedAssets(enterpriseId);
  const { data: policy } = useAssetPolicy(enterpriseId);
  const { data: categories = [] } = useAssetCategories(enterpriseId);
  const { data: locations = [] } = useAssetLocations(enterpriseId);
  const { data: custodians = [] } = useAssetCustodians(enterpriseId);
  const { data: suppliers = [] } = useAssetSuppliers(enterpriseId);
  const upsert = useUpsertFixedAsset();
  const activate = useActivateAsset();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [formOpen, setFormOpen] = useState(false);
  const [detailAsset, setDetailAsset] = useState<FixedAsset | null>(null);
  const [form, setForm] = useState<Partial<FixedAsset>>(EMPTY_ASSET);

  const filtered = assets.filter((a) => {
    const matchSearch = !search ||
      a.asset_code.toLowerCase().includes(search.toLowerCase()) ||
      a.asset_name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "ALL" || a.status === statusFilter;
    const matchCat = categoryFilter === "ALL" || String(a.category_id) === categoryFilter;
    return matchSearch && matchStatus && matchCat;
  });

  const openNew = () => {
    setForm({ ...EMPTY_ASSET, currency: baseCurrency, exchange_rate_at_acquisition: 1 });
    setFormOpen(true);
  };

  const save = () => {
    if (!enterpriseId || !tenantId) return;
    const rate = Number(form.exchange_rate_at_acquisition || 1);
    const origCost = Number(form.original_acquisition_cost ?? form.acquisition_cost ?? 0);
    const origResidual = Number(form.original_residual_value ?? form.residual_value ?? 0);
    const payload: Partial<FixedAsset> & { enterprise_id: number; tenant_id: number } = {
      ...form,
      enterprise_id: enterpriseId,
      tenant_id: tenantId,
      // Funcional = original × rate
      acquisition_cost: Math.round(origCost * rate * 100) / 100,
      residual_value: Math.round(origResidual * rate * 100) / 100,
      original_acquisition_cost: origCost,
      original_residual_value: origResidual,
      exchange_rate_at_acquisition: rate,
      currency: form.currency || baseCurrency,
    };
    upsert.mutate(payload as FixedAsset & { enterprise_id: number; tenant_id: number },
      { onSuccess: () => setFormOpen(false) }
    );
  };

  const handleActivate = (asset: FixedAsset) => {
    activate.mutate({
      asset,
      depreciation_start_rule: policy?.depreciation_start_rule ?? "ACQUISITION_DATE",
    });
  };

  if (!enterpriseId) {
    return (
      <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
        Selecciona una empresa para ver los activos.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-1 gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar activo..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              <SelectItem value="DRAFT">Borrador</SelectItem>
              <SelectItem value="ACTIVE">Activo</SelectItem>
              <SelectItem value="DISPOSED">Baja</SelectItem>
              <SelectItem value="SOLD">Vendido</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Categoría" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" /> Nuevo activo
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground p-6">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando activos...
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead className="text-right">Costo</TableHead>
                <TableHead className="text-right">Valor residual</TableHead>
                <TableHead>Vida útil</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                    {search || statusFilter !== "ALL" ? "Sin resultados para el filtro." : "No hay activos. Crea el primero."}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((asset) => (
                <TableRow key={asset.id} className="group">
                  <TableCell className="font-mono font-medium">{asset.asset_code}</TableCell>
                  <TableCell>{asset.asset_name}</TableCell>
                  <TableCell className="text-muted-foreground">{asset.category?.name ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(asset.acquisition_cost)}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(asset.residual_value)}</TableCell>
                  <TableCell>{asset.useful_life_months} m</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_COLORS[asset.status] as any}>
                      {STATUS_LABELS[asset.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" onClick={() => setDetailAsset(asset)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      {asset.status === "DRAFT" && (
                        <Button
                          variant="ghost" size="icon"
                          title="Activar activo"
                          onClick={() => handleActivate(asset)}
                          disabled={activate.isPending}
                        >
                          {activate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4 text-amber-500" />}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar activo" : "Nuevo activo fijo"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Código *</Label>
              <Input value={form.asset_code || ""} onChange={(e) => setForm((f) => ({ ...f, asset_code: e.target.value }))} />
            </div>
            <div>
              <Label>Nombre *</Label>
              <Input value={form.asset_name || ""} onChange={(e) => setForm((f) => ({ ...f, asset_name: e.target.value }))} />
            </div>
            <div>
              <Label>Categoría *</Label>
              <Select value={form.category_id ? String(form.category_id) : ""} onValueChange={(v) => {
                const cat = categories.find((c) => c.id === Number(v));
                setForm((f) => ({
                  ...f,
                  category_id: Number(v),
                  useful_life_months: cat?.default_useful_life_months ?? f.useful_life_months,
                  residual_value: cat?.default_residual_value ?? f.residual_value,
                }));
              }}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {categories.filter((c) => c.is_active).map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.code} — {c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className={isMultiCurrency ? "col-span-2" : ""}>
              <CurrencyAmountInput
                enterpriseId={enterpriseId!}
                baseCurrencyCode={baseCurrency}
                date={form.acquisition_date || new Date().toISOString().split("T")[0]}
                amount={Number(form.original_acquisition_cost ?? form.acquisition_cost ?? 0)}
                currencyCode={form.currency || baseCurrency}
                exchangeRate={Number(form.exchange_rate_at_acquisition ?? 1)}
                label="Costo de adquisición *"
                onChange={(next) => setForm((f) => ({
                  ...f,
                  original_acquisition_cost: next.amount,
                  currency: next.currencyCode,
                  exchange_rate_at_acquisition: next.exchangeRate,
                  // Mantener acquisition_cost en moneda funcional sincronizado
                  acquisition_cost: Math.round(next.amount * (next.exchangeRate || 1) * 100) / 100,
                }))}
              />
            </div>
            <div className={isMultiCurrency ? "col-span-2" : ""}>
              <CurrencyAmountInput
                enterpriseId={enterpriseId!}
                baseCurrencyCode={baseCurrency}
                date={form.acquisition_date || new Date().toISOString().split("T")[0]}
                amount={Number(form.original_residual_value ?? form.residual_value ?? 0)}
                currencyCode={form.currency || baseCurrency}
                exchangeRate={Number(form.exchange_rate_at_acquisition ?? 1)}
                label="Valor residual"
                onChange={(next) => setForm((f) => ({
                  ...f,
                  original_residual_value: next.amount,
                  // Hereda moneda y rate del costo de adquisición (un activo = una moneda)
                  currency: next.currencyCode,
                  exchange_rate_at_acquisition: next.exchangeRate,
                  residual_value: Math.round(next.amount * (next.exchangeRate || 1) * 100) / 100,
                }))}
              />
            </div>
            <div>
              <Label>Vida útil (meses) *</Label>
              <Input type="number" min={1} value={form.useful_life_months || 60}
                onChange={(e) => setForm((f) => ({ ...f, useful_life_months: parseInt(e.target.value) }))} />
            </div>
            <div>
              <Label>Fecha de adquisición *</Label>
              <Input type="date" value={form.acquisition_date || ""}
                onChange={(e) => setForm((f) => ({ ...f, acquisition_date: e.target.value }))} />
            </div>
            <div>
              <Label>Fecha de puesta en servicio</Label>
              <Input type="date" value={form.in_service_date || ""}
                onChange={(e) => setForm((f) => ({ ...f, in_service_date: e.target.value || null }))} />
            </div>
            <div>
              <Label>Ubicación</Label>
              <Select value={form.location_id ? String(form.location_id) : "none"} onValueChange={(v) => setForm((f) => ({ ...f, location_id: v === "none" ? null : Number(v) }))}>
                <SelectTrigger><SelectValue placeholder="Ninguna" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ninguna</SelectItem>
                  {locations.filter((l) => l.is_active).map((l) => (<SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Custodio</Label>
              <Select value={form.custodian_id ? String(form.custodian_id) : "none"} onValueChange={(v) => setForm((f) => ({ ...f, custodian_id: v === "none" ? null : Number(v) }))}>
                <SelectTrigger><SelectValue placeholder="Ninguno" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ninguno</SelectItem>
                  {custodians.filter((c) => c.is_active).map((c) => (<SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Proveedor</Label>
              <Select value={form.supplier_id ? String(form.supplier_id) : "none"} onValueChange={(v) => setForm((f) => ({ ...f, supplier_id: v === "none" ? null : Number(v) }))}>
                <SelectTrigger><SelectValue placeholder="Ninguno" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ninguno</SelectItem>
                  {suppliers.filter((s) => s.is_active).map((s) => (<SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            {/* Moneda integrada en CurrencyAmountInput de Costo y Valor residual */}
          </div>
          <div>
            <Label>Notas</Label>
            <Textarea value={form.notes || ""} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={!form.asset_code || !form.asset_name || !form.category_id || !form.acquisition_date || upsert.isPending}>
              {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Asset detail dialog */}
      {detailAsset && (
        <AssetDetailDialog
          asset={detailAsset}
          open={!!detailAsset}
          onClose={() => setDetailAsset(null)}
        />
      )}
    </div>
  );
}
