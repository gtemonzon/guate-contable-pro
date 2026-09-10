import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  useAssetCategories,
  useAssetCustodians,
  useAssetLocations,
  useAssetPolicy,
  useDepreciationSchedule,
  useAssetEventLog,
  useCustodianAssignments,
  useAssignCustodian,
  useReturnCustodian,
  type FixedAsset,
} from "@/hooks/useFixedAssets";
import { generateDepreciationSchedule } from "@/domain/fixedAssets/calculations";
import { useToast } from "@/hooks/use-toast";
import { useNitLookup } from "@/hooks/useNitLookup";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NitAutocomplete } from "@/components/ui/nit-autocomplete";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Calendar, History, Paperclip, Save, Plus, UserMinus } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
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
  supplier_nit: string;
  supplier_name: string;
  cost_center: string;
  notes: string;
  acquisition_date: string;
  in_service_date: string;
  acquisition_cost: number;
  residual_value: number;
  useful_life_months: number;
  serial_number: string;
  model: string;
  manufacture_year: number | null;
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
    supplier_nit: asset.supplier_nit ?? "",
    supplier_name: asset.supplier_name ?? "",
    cost_center: asset.cost_center ?? "",
    notes: asset.notes ?? "",
    acquisition_date: asset.acquisition_date,
    in_service_date: asset.in_service_date ?? "",
    acquisition_cost: asset.acquisition_cost,
    residual_value: asset.residual_value,
    useful_life_months: asset.useful_life_months,
    serial_number: asset.serial_number ?? "",
    model: asset.model ?? "",
    manufacture_year: asset.manufacture_year,
  };
}

function todayDateInput() {
  return formatDateInput(new Date());
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
  const { data: policy } = useAssetPolicy(asset.enterprise_id);
  const { data: assignments = [], isLoading: assignmentsLoading } = useCustodianAssignments(asset.id);
  const assignCustodian = useAssignCustodian();
  const returnCustodian = useReturnCustodian();
  const { lookupNit } = useNitLookup();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AssetForm>(() => formFromAsset(asset));
  const [saving, setSaving] = useState(false);
  const [skipDialogOpen, setSkipDialogOpen] = useState(false);
  const [skipCutoff, setSkipCutoff] = useState(() => {
    const now = new Date();
    return formatDateInput(new Date(now.getFullYear(), now.getMonth(), 0));
  });
  const [skipping, setSkipping] = useState(false);
  const [financialConfirmOpen, setFinancialConfirmOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({ custodian_id: null as number | null, assigned_date: todayDateInput(), notes: "" });
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returningAssignment, setReturningAssignment] = useState<null | { id: number; custodian_id: number; assigned_date: string }>(null);
  const [returnForm, setReturnForm] = useState({ returned_date: todayDateInput(), notes: "" });
  const [custodianPage, setCustodianPage] = useState(1);

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
  const hasPostedRows = schedule.some((row) => row.status === "POSTED");
  const financialFieldsChanged =
    form.acquisition_cost !== asset.acquisition_cost ||
    form.residual_value !== asset.residual_value ||
    form.useful_life_months !== asset.useful_life_months;
  const openAssignment = assignments.find((a) => !a.returned_date) ?? null;
  const CUSTODIAN_PAGE_SIZE = 10;
  const custodianTotalPages = Math.max(1, Math.ceil(assignments.length / CUSTODIAN_PAGE_SIZE));
  const custodianCurrentPage = Math.min(custodianPage, custodianTotalPages);
  const custodianStartIndex = (custodianCurrentPage - 1) * CUSTODIAN_PAGE_SIZE;
  const pagedAssignments = assignments.slice(custodianStartIndex, custodianStartIndex + CUSTODIAN_PAGE_SIZE);

  const saveChanges = async () => {
    if (!form.asset_name.trim()) {
      toast({ title: "Nombre requerido", description: "Ingresa un nombre para el activo.", variant: "destructive" });
      return;
    }

    const willRegenerateSchedule = !hasPostedRows && financialFieldsChanged;

    try {
      setSaving(true);
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) throw new Error("Usuario no autenticado");
      const update: Database["public"]["Tables"]["fixed_assets"]["Update"] = {
        asset_name: form.asset_name.trim(),
        category_id: form.category_id,
        location_id: form.location_id,
        supplier_nit: form.supplier_nit.trim() || null,
        supplier_name: form.supplier_name.trim() || null,
        cost_center: form.cost_center.trim() || null,
        notes: form.notes.trim() || null,
        acquisition_date: form.acquisition_date,
        in_service_date: form.in_service_date || null,
        serial_number: form.serial_number.trim() || null,
        model: form.model.trim() || null,
        manufacture_year: form.manufacture_year,
        updated_at: new Date().toISOString(),
      };
      if (!hasPostedRows) {
        update.acquisition_cost = form.acquisition_cost;
        update.residual_value = form.residual_value;
        update.useful_life_months = form.useful_life_months;
      }

      const { error } = await supabase.from("fixed_assets").update(update).eq("id", asset.id);
      if (error) throw error;

      let regeneratedRowCount = 0;
      if (willRegenerateSchedule) {
        const { error: deleteError } = await supabase.from("fixed_asset_depreciation_schedule").delete().eq("asset_id", asset.id);
        if (deleteError) throw deleteError;

        const newSchedule = generateDepreciationSchedule({
          acquisition_cost: form.acquisition_cost,
          residual_value: form.residual_value,
          useful_life_months: form.useful_life_months,
          acquisition_date: form.acquisition_date,
          in_service_date: form.in_service_date || null,
          depreciation_start_rule: policy?.depreciation_start_rule ?? "ACQUISITION_DATE",
        });
        regeneratedRowCount = newSchedule.length;
        if (newSchedule.length > 0) {
          const rows = newSchedule.map((r) => ({
            asset_id: asset.id,
            enterprise_id: asset.enterprise_id,
            year: r.year,
            month: r.month,
            planned_depreciation_amount: r.planned_depreciation_amount,
            accumulated_depreciation: r.accumulated_depreciation,
            net_book_value: r.net_book_value,
            status: "PLANNED" as const,
          }));
          const { error: insertError } = await supabase.from("fixed_asset_depreciation_schedule").insert(rows);
          if (insertError) throw insertError;
        }
      }

      const { error: eventError } = await supabase.from("fixed_asset_event_log").insert({
        asset_id: asset.id,
        enterprise_id: asset.enterprise_id,
        actor_user_id: authData.user.id,
        event_type: willRegenerateSchedule ? "SCHEDULE_REGENERATED" : "UPDATE",
        metadata_json: willRegenerateSchedule
          ? {
              old_values: { acquisition_cost: asset.acquisition_cost, residual_value: asset.residual_value, useful_life_months: asset.useful_life_months },
              new_values: { acquisition_cost: form.acquisition_cost, residual_value: form.residual_value, useful_life_months: form.useful_life_months },
              schedule_rows: regeneratedRowCount,
            }
          : { updated_fields: Object.keys(update).filter((key) => key !== "updated_at") },
      });
      if (eventError) throw eventError;

      await queryClient.invalidateQueries({ queryKey: ["fixed_assets", asset.enterprise_id] });
      if (willRegenerateSchedule) {
        await queryClient.invalidateQueries({ queryKey: ["depreciation_schedule", asset.id] });
      }

      toast({ title: "Datos del activo actualizados" });
      setFinancialConfirmOpen(false);
      onClose();
    } catch (error) {
      toast({ title: "No se pudieron guardar los cambios", description: error instanceof Error ? error.message : "Intenta nuevamente.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveClick = () => {
    if (!hasPostedRows && financialFieldsChanged) {
      setFinancialConfirmOpen(true);
    } else {
      void saveChanges();
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
            <TabsTrigger value="custodians">Custodios</TabsTrigger>
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
                  { label: "Serie", value: asset.serial_number ?? "—" },
                  { label: "Modelo", value: asset.model ?? "—" },
                ].map(({ label, value }) => <Card key={label} className="bg-muted/30"><CardContent className="p-4"><p className="mb-1 text-xs text-muted-foreground">{label}</p><p className="font-semibold">{value}</p></CardContent></Card>)}
              </div>
              {asset.notes && <Card className="mt-4 bg-muted/20"><CardContent className="p-4"><p className="mb-1 text-xs text-muted-foreground">Notas</p><p className="text-sm">{asset.notes}</p></CardContent></Card>}
            </TabsContent>

            <TabsContent value="data" className="mt-4 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2"><Label>Nombre *</Label><Input value={form.asset_name} onChange={(event) => updateForm("asset_name", event.target.value)} /></div>
                <div><Label>Categoría</Label><Select value={String(form.category_id)} onValueChange={(value) => updateForm("category_id", Number(value))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{categories.map((category) => <SelectItem key={category.id} value={String(category.id)}>{category.code} — {category.name}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>Ubicación</Label><Select value={form.location_id ? String(form.location_id) : "none"} onValueChange={(value) => updateForm("location_id", value === "none" ? null : Number(value))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Ninguna</SelectItem>{locations.map((location) => <SelectItem key={location.id} value={String(location.id)}>{location.name}</SelectItem>)}</SelectContent></Select></div>
                <div>
                  <Label>NIT del proveedor</Label>
                  <NitAutocomplete
                    value={form.supplier_nit}
                    onChange={(event) => updateForm("supplier_nit", event.target.value.replace(/-/g, ""))}
                    onBlur={async (event) => {
                      const nit = event.target.value.trim();
                      if (!nit || form.supplier_name.trim()) return;
                      const result = await lookupNit(nit);
                      if (result?.found && result.name) {
                        updateForm("supplier_name", result.name);
                      }
                    }}
                    onSelectTaxpayer={(nit, name) => {
                      updateForm("supplier_nit", nit);
                      updateForm("supplier_name", name);
                    }}
                    placeholder="NIT del proveedor"
                  />
                </div>
                <div>
                  <Label>Nombre del proveedor</Label>
                  <Input
                    value={form.supplier_name}
                    onChange={(event) => updateForm("supplier_name", event.target.value)}
                    placeholder="Nombre del proveedor"
                  />
                </div>
                <div><Label>Centro de costo</Label><Input value={form.cost_center} onChange={(event) => updateForm("cost_center", event.target.value)} /></div>
                <div><Label>Serie</Label><Input value={form.serial_number} onChange={(event) => updateForm("serial_number", event.target.value)} /></div>
                <div><Label>Modelo</Label><Input value={form.model} onChange={(event) => updateForm("model", event.target.value)} /></div>
                <div><Label>Año</Label><Input type="number" min="1900" value={form.manufacture_year ?? ""} onChange={(event) => updateForm("manufacture_year", event.target.value ? Number(event.target.value) : null)} /></div>
                <div><Label>Fecha de adquisición</Label><Input type="date" value={form.acquisition_date} onChange={(event) => updateForm("acquisition_date", event.target.value)} /></div>
                <div><Label>Fecha de puesta en servicio</Label><Input type="date" value={form.in_service_date} onChange={(event) => updateForm("in_service_date", event.target.value)} /></div>
                <div><Label>Costo de adquisición</Label><Input type="number" min="0" step="0.01" value={form.acquisition_cost} disabled={hasPostedRows} onChange={(event) => updateForm("acquisition_cost", Number(event.target.value))} /><p className="mt-1 text-xs text-muted-foreground">{hasPostedRows ? "No editable: ya existe depreciación contabilizada." : "Editable mientras no exista depreciación contabilizada."}</p></div>
                <div><Label>Valor residual</Label><Input type="number" min="0" step="0.01" value={form.residual_value} disabled={hasPostedRows} onChange={(event) => updateForm("residual_value", Number(event.target.value))} /></div>
                <div><Label>Vida útil (meses)</Label><Input type="number" min="1" value={form.useful_life_months} disabled={hasPostedRows} onChange={(event) => updateForm("useful_life_months", Number(event.target.value))} /></div>
                <div className="md:col-span-2"><Label>Notas</Label><Textarea value={form.notes} onChange={(event) => updateForm("notes", event.target.value)} /></div>
              </div>
              <div className="flex justify-end"><Button onClick={handleSaveClick} disabled={saving} className="gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Guardar cambios</Button></div>
            </TabsContent>

            <TabsContent value="attachments" className="mt-4"><AssetAttachmentsTab assetId={asset.id} enterpriseId={asset.enterprise_id} /></TabsContent>

            <TabsContent value="schedule" className="mt-4 space-y-4">
              {schedLoading ? <div className="flex items-center gap-2 p-4 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando calendario...</div> : schedule.length === 0 ? <div className="rounded-lg border border-dashed py-10 text-center text-muted-foreground">{asset.status === "DRAFT" ? "Activa el activo para generar el calendario de depreciación." : "Sin calendario de depreciación."}</div> : <div className="overflow-hidden rounded-lg border"><Table><TableHeader><TableRow><TableHead>Período</TableHead><TableHead className="text-right">Depreciación</TableHead><TableHead className="text-right">Acumulada</TableHead><TableHead className="text-right">Valor neto</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader><TableBody>{schedule.map((row) => <TableRow key={row.id} className={row.status === "POSTED" ? "bg-green-50/50 dark:bg-green-950/20" : ""}><TableCell className="font-mono text-sm">{MONTH_NAMES[row.month]} {row.year}</TableCell><TableCell className="text-right font-mono">{fmt(row.planned_depreciation_amount)}</TableCell><TableCell className="text-right font-mono">{fmt(row.accumulated_depreciation)}</TableCell><TableCell className="text-right font-mono">{fmt(row.net_book_value)}</TableCell><TableCell><Badge variant={STATUS_BADGE[row.status]} className="text-xs">{STATUS_LABEL[row.status]}</Badge></TableCell></TableRow>)}</TableBody></Table></div>}
              {historicalPlannedRows.length > 0 && <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">Depreciación histórica pendiente</p><p className="text-sm text-muted-foreground">Puedes marcar meses ya transcurridos como aplicados sin generar una partida contable.</p></div><Button variant="outline" onClick={() => setSkipDialogOpen(true)}>Marcar depreciación histórica como aplicada (sin partida)</Button></div>}
            </TabsContent>

            <TabsContent value="custodians" className="mt-4 space-y-4">
              {assignmentsLoading ? (
                <div className="flex items-center gap-2 p-4 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando custodios...</div>
              ) : (
                <>
                  <div className="flex justify-end">
                    {!openAssignment && (
                      <Button size="sm" onClick={() => { setAssignForm({ custodian_id: null, assigned_date: todayDateInput(), notes: "" }); setAssignDialogOpen(true); }}>
                        <Plus className="mr-1 h-4 w-4" /> Asignar custodio
                      </Button>
                    )}
                  </div>
                  {assignments.length === 0 ? (
                    <div className="rounded-lg border border-dashed py-10 text-center text-muted-foreground">Sin custodios asignados.</div>
                  ) : (
                    <div className="overflow-hidden rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Custodio</TableHead>
                            <TableHead>Fecha de asignación</TableHead>
                            <TableHead>Fecha de entrega</TableHead>
                            <TableHead>Observación</TableHead>
                            <TableHead className="w-12" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pagedAssignments.map((a) => (
                            <TableRow key={a.id}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {a.custodian?.name ?? "—"}
                                  {!a.returned_date && <Badge className="text-xs">Actual</Badge>}
                                </div>
                              </TableCell>
                              <TableCell>{a.assigned_date}</TableCell>
                              <TableCell>{a.returned_date ?? "—"}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{a.notes || "—"}</TableCell>
                              <TableCell>
                                {!a.returned_date && (
                                  <Button
                                    variant="ghost" size="icon" className="text-destructive hover:text-destructive"
                                    title="Registrar entrega"
                                    onClick={() => { setReturningAssignment({ id: a.id, custodian_id: a.custodian_id, assigned_date: a.assigned_date }); setReturnForm({ returned_date: todayDateInput(), notes: "" }); setReturnDialogOpen(true); }}
                                  >
                                    <UserMinus className="h-4 w-4" />
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  {assignments.length > 0 && custodianTotalPages > 1 && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-muted-foreground">
                        Mostrando {custodianStartIndex + 1}–{Math.min(custodianStartIndex + CUSTODIAN_PAGE_SIZE, assignments.length)} de {assignments.length}
                      </span>
                      <Pagination className="mx-0 w-auto">
                        <PaginationContent>
                          <PaginationItem>
                            <PaginationPrevious
                              onClick={() => setCustodianPage((p) => Math.max(1, p - 1))}
                              className={custodianCurrentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                            />
                          </PaginationItem>
                          <PaginationItem>
                            <span className="px-3 text-sm text-muted-foreground">
                              Página {custodianCurrentPage} de {custodianTotalPages}
                            </span>
                          </PaginationItem>
                          <PaginationItem>
                            <PaginationNext
                              onClick={() => setCustodianPage((p) => Math.min(custodianTotalPages, p + 1))}
                              className={custodianCurrentPage === custodianTotalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                            />
                          </PaginationItem>
                        </PaginationContent>
                      </Pagination>
                    </div>
                  )}
                </>
              )}
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

      <AlertDialog open={financialConfirmOpen} onOpenChange={setFinancialConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Regenerar calendario de depreciación?</AlertDialogTitle>
            <AlertDialogDescription>
              Cambiar el costo, valor residual o vida útil regenerará el calendario de depreciación. ¿Continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={(event) => { event.preventDefault(); void saveChanges(); }}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Continuar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Asignar custodio</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Custodio *</Label>
              <Select value={assignForm.custodian_id ? String(assignForm.custodian_id) : ""} onValueChange={(value) => setAssignForm((f) => ({ ...f, custodian_id: Number(value) }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {custodians.filter((c) => c.is_active).map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fecha de asignación *</Label>
              <Input type="date" value={assignForm.assigned_date} onChange={(event) => setAssignForm((f) => ({ ...f, assigned_date: event.target.value }))} />
            </div>
            <div>
              <Label>Observación</Label>
              <Textarea value={assignForm.notes} onChange={(event) => setAssignForm((f) => ({ ...f, notes: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>Cancelar</Button>
            <Button
              disabled={!assignForm.custodian_id || !assignForm.assigned_date || assignCustodian.isPending}
              onClick={() => {
                if (!assignForm.custodian_id) return;
                assignCustodian.mutate(
                  { asset_id: asset.id, enterprise_id: asset.enterprise_id, custodian_id: assignForm.custodian_id, assigned_date: assignForm.assigned_date, notes: assignForm.notes },
                  { onSuccess: () => setAssignDialogOpen(false) },
                );
              }}
            >
              {assignCustodian.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={returnDialogOpen} onOpenChange={(isOpen) => { setReturnDialogOpen(isOpen); if (!isOpen) setReturningAssignment(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar entrega de custodio</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Fecha de entrega *</Label>
              <Input type="date" value={returnForm.returned_date} onChange={(event) => setReturnForm((f) => ({ ...f, returned_date: event.target.value }))} />
              {returningAssignment && returnForm.returned_date < returningAssignment.assigned_date && (
                <p className="mt-1 text-xs text-destructive">La fecha de entrega no puede ser anterior a la fecha de asignación ({returningAssignment.assigned_date}).</p>
              )}
            </div>
            <div>
              <Label>Observación</Label>
              <Textarea value={returnForm.notes} onChange={(event) => setReturnForm((f) => ({ ...f, notes: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnDialogOpen(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={!returningAssignment || !returnForm.returned_date || returnForm.returned_date < returningAssignment.assigned_date || returnCustodian.isPending}
              onClick={() => {
                if (!returningAssignment) return;
                returnCustodian.mutate(
                  { assignment_id: returningAssignment.id, asset_id: asset.id, enterprise_id: asset.enterprise_id, custodian_id: returningAssignment.custodian_id, returned_date: returnForm.returned_date, notes: returnForm.notes },
                  { onSuccess: () => { setReturnDialogOpen(false); setReturningAssignment(null); } },
                );
              }}
            >
              {returnCustodian.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar entrega
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
