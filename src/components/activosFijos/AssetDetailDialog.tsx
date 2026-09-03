import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  useAssetCategories,
  useAssetCustodians,
  useAssetLocations,
  useAssetSuppliers,
  useDepreciationSchedule,
  useAssetEventLog,
  type FixedAsset,
} from "@/hooks/useFixedAssets";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Calendar, History, Paperclip, Save } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import DisposalWizard from "./DisposalWizard";
import AssetAttachmentsTab from "./AssetAttachmentsTab";

interface Props {
  asset: FixedAsset;
  open: boolean;
  onClose: () => void;
}

interface AssetForm {
  asset_name: string;
  category_id: number;
  location_id: number | null;
  custodian_id: number | null;
  supplier_id: number | null;
  cost_center: string;
  notes: string;
  acquisition_date: string;
  in_service_date: string;
  acquisition_cost: number;
  residual_value: number;
  useful_life_months: number;
}

const fmt = (n: number) => n.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTH_NAMES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
type BadgeVariant = "default" | "secondary" | "destructive" | "outline";
const STATUS_BADGE: Record<string, BadgeVariant> = { PLANNED: "secondary", POSTED: "default", SKIPPED: "outline" };
const STATUS_LABEL: Record<string, string> = { PLANNED: "Planificado", POSTED: "Contabilizado", SKIPPED: "Omitido" };

function formFromAsset(asset: FixedAsset): AssetForm {
  return {
    asset_name: asset.asset_name,
    category_id: asset.category_id,
    location_id: asset.location_id,
    custodian_id: asset.custodian_id,
    supplier_id: asset.supplier_id,
    cost_center: asset.cost_center ?? "",
    notes: asset.notes ?? "",
    acquisition_date: asset.acquisition_date,
    in_service_date: asset.in_service_date ?? "",
    acquisition_cost: asset.acquisition_cost,
    residual_value: asset.residual_value,
    useful_life_months: asset.useful_life_months,
  };
}

function periodKey(year: number, month: number) {
  return year * 12 + month - 1;
}

function formatDateInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function AssetDetailDialog({ asset, open, onClose }: Props) {
  const { toast } = useToast();
  const { data: schedule = [], isLoading: schedLoading } = useDepreciationSchedule(asset.id);
  const { data: events = [], isLoading: eventsLoading } = useAssetEventLog(asset.id);
  const { data: categories = [] } = useAssetCategories(asset.enterprise_id);
  const { data: locations = [] } = useAssetLocations(asset.enterprise_id);
  const { data: custodians = [] } = useAssetCustodians(asset.enterprise_id);
  const { data: suppliers = [] } = useAssetSuppliers(asset.enterprise_id);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AssetForm>(() => formFromAsset(asset));
  const [saving, setSaving] = useState(false);
  const [skipDialogOpen, setSkipDialogOpen] = useState(false);
  const [skipCutoff, setSkipCutoff] = useState(() => {
    const now = new Date();
    return formatDateInput(new Date(now.getFullYear(), now.getMonth(), 0));
  });
  const [skipping, setSkipping] = useState(false);

  useEffect(() => {
    setForm(formFromAsset(asset));
  }, [asset]);

  const updateForm = <K extends keyof AssetForm>(key: K, value: AssetForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const isDirty = JSON.stringify(form) !== JSON.stringify(formFromAsset(asset));
  const now = new Date();
  const currentPeriodKey = periodKey(now.getFullYear(), now.getMonth() + 1);
  const historicalPlannedRows = schedule.filter(
    (row) => row.status === "PLANNED" && periodKey(row.year, row.month) < currentPeriodKey,
  );

  const saveChanges = async () => {
    if (!form.asset_name.trim()) {
      toast({ title: "Nombre requerido", description: "Ingresa un nombre para el activo.", variant: "destructive" });
      return;
    }

    try {
      setSaving(true);
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) throw new Error("Usuario no autenticado");
      const update: Database["public"]["Tables"]["fixed_assets"]["Update"] = {
        asset_name: form.asset_name.trim(),
        category_id: form.category_id,
        location_id: form.location_id,
        custodian_id: form.custodian_id,
        supplier_id: form.supplier_id,
        cost_center: form.cost_center.trim() || null,
        notes: form.notes.trim() || null,
        acquisition_date: form.acquisition_date,
        in_service_date: form.in_service_date || null,
        updated_at: new Date().toISOString(),
      };
      if (schedule.length === 0) {
        update.acquisition_cost = form.acquisition_cost;
        update.residual_value = form.residual_value;
        update.useful_life_months = form.useful_life_months;
      }

      const { error } = await supabase.from("fixed_assets").update(update).eq("id", asset.id);
      if (error) throw error;
      const { error: eventError } = await supabase.from("fixed_asset_event_log").insert({
        asset_id: asset.id,
        enterprise_id: asset.enterprise_id,
        actor_user_id: authData.user.id,
        event_type: "UPDATE",
        metadata_json: { updated_fields: Object.keys(update).filter((key) => key !== "updated_at") },
      });
      if (eventError) throw eventError;
      await queryClient.invalidateQueries({ queryKey: ["fixed_assets", asset.enterprise_id] });

      toast({ title: "Datos del activo actualizados" });
      onClose();
    } catch (error) {
      toast({ title: "No se pudieron guardar los cambios", description: error instanceof Error ? error.message : "Intenta nuevamente.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const skipHistoricalDepreciation = async () => {
    const [cutoffYear, cutoffMonth] = skipCutoff.split("-").map(Number);
    if (!cutoffYear || !cutoffMonth) {
      toast({ title: "Fecha de corte requerida", description: "Selecciona una fecha de corte válida.", variant: "destructive" });
      return;
    }
    if (periodKey(cutoffYear, cutoffMonth) >= currentPeriodKey) {
      toast({ title: "Fecha de corte inválida", description: "La fecha de corte debe corresponder a un mes anterior al actual.", variant: "destructive" });
      return;
    }

    const rowsToSkip = schedule.filter(
      (row) => row.status === "PLANNED" && periodKey(row.year, row.month) <= periodKey(cutoffYear, cutoffMonth),
    );
    if (rowsToSkip.length === 0) {
      toast({ title: "Sin depreciaciones para omitir", description: "No hay meses planificados hasta la fecha de corte seleccionada.", variant: "destructive" });
      return;
    }

    try {
      setSkipping(true);
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) throw new Error("Usuario no autenticado");
      const rowIds = rowsToSkip.map((row) => row.id);
      const { data: updatedRows, error: updateError } = await supabase
        .from("fixed_asset_depreciation_schedule")
        .update({ status: "SKIPPED", journal_entry_id: null, posted_depreciation_amount: null })
        .eq("asset_id", asset.id)
        .eq("enterprise_id", asset.enterprise_id)
        .eq("status", "PLANNED")
        .in("id", rowIds)
        .select("id");
      if (updateError) throw updateError;
      if (!updatedRows || updatedRows.length !== rowIds.length) {
        throw new Error("El calendario cambió mientras se procesaba; no se omitieron todos los meses seleccionados");
      }

      const { error: eventError } = await supabase.from("fixed_asset_event_log").insert({
        asset_id: asset.id,
        enterprise_id: asset.enterprise_id,
        actor_user_id: authData.user.id,
        event_type: "SKIP_HISTORICAL_DEPRECIATION",
        metadata_json: { months_skipped: rowsToSkip.length, cutoff_date: skipCutoff },
      });
      if (eventError) throw eventError;

      await queryClient.invalidateQueries({ queryKey: ["depreciation_schedule", asset.id] });
      await queryClient.invalidateQueries({ queryKey: ["asset_event_log", asset.id] });
      setSkipDialogOpen(false);
      toast({ title: "Depreciación histórica actualizada", description: `${rowsToSkip.length} mes(es) marcado(s) como aplicado(s) sin partida contable.` });
    } catch (error) {
      toast({ title: "No se pudo actualizar el calendario", description: error instanceof Error ? error.message : "Intenta nuevamente.", variant: "destructive" });
    } finally {
      setSkipping(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        onEscapeKeyDown={(event) => {
          if (isDirty) {
            event.preventDefault();
            toast({ title: "Cambios sin guardar", description: "Tienes cambios sin guardar en Datos — guarda o descarta antes de cerrar" });
          }
        }}
        onPointerDownOutside={(event) => {
          if (isDirty) {
            event.preventDefault();
            toast({ title: "Cambios sin guardar", description: "Tienes cambios sin guardar en Datos — guarda o descarta antes de cerrar" });
          }
        }}
      >
        <div className="flex-shrink-0 space-y-4">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-muted-foreground">{asset.asset_code}</span>
              {asset.asset_name}
              <Badge variant={asset.status === "ACTIVE" ? "default" : "secondary"}>
                {{ DRAFT: "Borrador", ACTIVE: "Activo", DISPOSED: "Baja", SOLD: "Vendido" }[asset.status]}
              </Badge>
            </DialogTitle>
          </DialogHeader>
        </div>

        <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="flex h-auto flex-shrink-0 flex-wrap gap-1">
            <TabsTrigger value="overview">Resumen</TabsTrigger>
            <TabsTrigger value="data">Datos</TabsTrigger>
            <TabsTrigger value="attachments"><Paperclip className="mr-1 h-4 w-4" />Adjuntos</TabsTrigger>
            <TabsTrigger value="schedule"><Calendar className="mr-1 h-4 w-4" />Calendario</TabsTrigger>
            {asset.status === "ACTIVE" && <TabsTrigger value="disposal">Baja / Venta</TabsTrigger>}
            <TabsTrigger value="history"><History className="mr-1 h-4 w-4" />Historial</TabsTrigger>
          </TabsList>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <TabsContent value="overview" className="mt-4">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                {[
                  { label: "Costo de adquisición", value: `Q ${fmt(asset.acquisition_cost)}` },
                  { label: "Valor residual", value: `Q ${fmt(asset.residual_value)}` },
                  { label: "Monto depreciable", value: `Q ${fmt(asset.acquisition_cost - asset.residual_value)}` },
                  { label: "Vida útil", value: `${asset.useful_life_months} meses` },
                  { label: "Fecha adquisición", value: asset.acquisition_date },
                  { label: "Fecha servicio", value: asset.in_service_date ?? "No definida" },
                  { label: "Moneda", value: asset.currency },
                  { label: "Centro de costo", value: asset.cost_center ?? "—" },
                ].map(({ label, value }) => <Card key={label} className="bg-muted/30"><CardContent className="p-4"><p className="mb-1 text-xs text-muted-foreground">{label}</p><p className="font-semibold">{value}</p></CardContent></Card>)}
              </div>
              {asset.notes && <Card className="mt-4 bg-muted/20"><CardContent className="p-4"><p className="mb-1 text-xs text-muted-foreground">Notas</p><p className="text-sm">{asset.notes}</p></CardContent></Card>}
            </TabsContent>

            <TabsContent value="data" className="mt-4 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2"><Label>Nombre *</Label><Input value={form.asset_name} onChange={(event) => updateForm("asset_name", event.target.value)} /></div>
                <div><Label>Categoría</Label><Select value={String(form.category_id)} onValueChange={(value) => updateForm("category_id", Number(value))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{categories.map((category) => <SelectItem key={category.id} value={String(category.id)}>{category.code} — {category.name}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>Ubicación</Label><Select value={form.location_id ? String(form.location_id) : "none"} onValueChange={(value) => updateForm("location_id", value === "none" ? null : Number(value))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Ninguna</SelectItem>{locations.map((location) => <SelectItem key={location.id} value={String(location.id)}>{location.name}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>Custodio</Label><Select value={form.custodian_id ? String(form.custodian_id) : "none"} onValueChange={(value) => updateForm("custodian_id", value === "none" ? null : Number(value))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Ninguno</SelectItem>{custodians.map((custodian) => <SelectItem key={custodian.id} value={String(custodian.id)}>{custodian.name}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>Proveedor</Label><Select value={form.supplier_id ? String(form.supplier_id) : "none"} onValueChange={(value) => updateForm("supplier_id", value === "none" ? null : Number(value))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Ninguno</SelectItem>{suppliers.map((supplier) => <SelectItem key={supplier.id} value={String(supplier.id)}>{supplier.name}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>Centro de costo</Label><Input value={form.cost_center} onChange={(event) => updateForm("cost_center", event.target.value)} /></div>
                <div><Label>Fecha de adquisición</Label><Input type="date" value={form.acquisition_date} onChange={(event) => updateForm("acquisition_date", event.target.value)} /></div>
                <div><Label>Fecha de puesta en servicio</Label><Input type="date" value={form.in_service_date} onChange={(event) => updateForm("in_service_date", event.target.value)} /></div>
                <div><Label>Costo de adquisición</Label><Input type="number" min="0" step="0.01" value={form.acquisition_cost} disabled={schedule.length > 0} onChange={(event) => updateForm("acquisition_cost", Number(event.target.value))} /><p className="mt-1 text-xs text-muted-foreground">{schedule.length > 0 ? "Solo lectura: ya existe un calendario de depreciación." : "Editable mientras no exista calendario."}</p></div>
                <div><Label>Valor residual</Label><Input type="number" min="0" step="0.01" value={form.residual_value} disabled={schedule.length > 0} onChange={(event) => updateForm("residual_value", Number(event.target.value))} /></div>
                <div><Label>Vida útil (meses)</Label><Input type="number" min="1" value={form.useful_life_months} disabled={schedule.length > 0} onChange={(event) => updateForm("useful_life_months", Number(event.target.value))} /></div>
                <div className="md:col-span-2"><Label>Notas</Label><Textarea value={form.notes} onChange={(event) => updateForm("notes", event.target.value)} /></div>
              </div>
              <div className="flex justify-end"><Button onClick={() => void saveChanges()} disabled={saving} className="gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Guardar cambios</Button></div>
            </TabsContent>

            <TabsContent value="attachments" className="mt-4"><AssetAttachmentsTab assetId={asset.id} enterpriseId={asset.enterprise_id} /></TabsContent>

            <TabsContent value="schedule" className="mt-4 space-y-4">
              {schedLoading ? <div className="flex items-center gap-2 p-4 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando calendario...</div> : schedule.length === 0 ? <div className="rounded-lg border border-dashed py-10 text-center text-muted-foreground">{asset.status === "DRAFT" ? "Activa el activo para generar el calendario de depreciación." : "Sin calendario de depreciación."}</div> : <div className="overflow-hidden rounded-lg border"><Table><TableHeader><TableRow><TableHead>Período</TableHead><TableHead className="text-right">Depreciación</TableHead><TableHead className="text-right">Acumulada</TableHead><TableHead className="text-right">Valor neto</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader><TableBody>{schedule.map((row) => <TableRow key={row.id} className={row.status === "POSTED" ? "bg-green-50/50 dark:bg-green-950/20" : ""}><TableCell className="font-mono text-sm">{MONTH_NAMES[row.month]} {row.year}</TableCell><TableCell className="text-right font-mono">{fmt(row.planned_depreciation_amount)}</TableCell><TableCell className="text-right font-mono">{fmt(row.accumulated_depreciation)}</TableCell><TableCell className="text-right font-mono">{fmt(row.net_book_value)}</TableCell><TableCell><Badge variant={STATUS_BADGE[row.status]} className="text-xs">{STATUS_LABEL[row.status]}</Badge></TableCell></TableRow>)}</TableBody></Table></div>}
              {historicalPlannedRows.length > 0 && <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">Depreciación histórica pendiente</p><p className="text-sm text-muted-foreground">Puedes marcar meses ya transcurridos como aplicados sin generar una partida contable.</p></div><Button variant="outline" onClick={() => setSkipDialogOpen(true)}>Marcar depreciación histórica como aplicada (sin partida)</Button></div>}
            </TabsContent>

            {asset.status === "ACTIVE" && <TabsContent value="disposal" className="mt-4"><DisposalWizard asset={asset} onDone={onClose} /></TabsContent>}

            <TabsContent value="history" className="mt-4">
              {eventsLoading ? <div className="flex items-center gap-2 p-4 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando historial...</div> : events.length === 0 ? <div className="py-10 text-center text-muted-foreground">Sin eventos registrados.</div> : <ol className="relative ml-4 space-y-6 border-l border-border">{events.map((event) => <li key={event.id} className="ml-6"><span className="absolute -left-2 flex h-4 w-4 items-center justify-center rounded-full border border-primary bg-primary/20 ring-2 ring-background" /><div className="mb-1 flex items-center gap-2"><Badge variant="outline" className="text-xs">{event.event_type}</Badge><span className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString("es-GT")}</span></div>{event.metadata_json && <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">{JSON.stringify(event.metadata_json, null, 2)}</pre>}</li>)}</ol>}
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>

      <AlertDialog open={skipDialogOpen} onOpenChange={setSkipDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Marcar depreciación histórica como aplicada?</AlertDialogTitle>
            <AlertDialogDescription>
              Esto marcará como aplicadas las depreciaciones de meses ya transcurridos SIN generar ninguna partida contable — útil para activos históricos cuya depreciación de años anteriores ya fue registrada por otro medio. El calendario y el valor en libros se actualizarán, pero no se creará ningún asiento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="historical-cutoff">Fecha de corte</Label>
            <Input id="historical-cutoff" type="date" value={skipCutoff} onChange={(event) => setSkipCutoff(event.target.value)} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={skipping}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={skipping} onClick={(event) => { event.preventDefault(); void skipHistoricalDepreciation(); }}>{skipping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
