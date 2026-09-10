/**
 * Hooks for Fixed Assets module — data fetching and mutations.
 * Uses `as any` casts since new tables are not yet in auto-generated types.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generateDepreciationSchedule } from "@/domain/fixedAssets/calculations";
import { fetchAllRecords } from "@/utils/supabaseHelpers";

// ─── Types ─────────────────────────────────────────────────────────────────

export type AssetStatus = "DRAFT" | "ACTIVE" | "DISPOSED" | "SOLD";

export interface FixedAsset {
  id: number;
  enterprise_id: number;
  tenant_id: number;
  asset_code: string;
  asset_name: string;
  category_id: number;
  location_id: number | null;
  custodian_id: number | null;
  supplier_nit: string | null;
  supplier_name: string | null;
  cost_center: string | null;
  serial_number: string | null;
  model: string | null;
  manufacture_year: number | null;
  acquisition_date: string;
  in_service_date: string | null;
  acquisition_cost: number;
  residual_value: number;
  useful_life_months: number;
  currency: string;
  /** Tipo de cambio al momento de la adquisición (1 si moneda funcional). */
  exchange_rate_at_acquisition?: number | null;
  /** Costo de adquisición en moneda original (== acquisition_cost si funcional). */
  original_acquisition_cost?: number | null;
  /** Valor residual en moneda original (== residual_value si funcional). */
  original_residual_value?: number | null;
  purchase_reference_id: number | null;
  status: AssetStatus;
  activated_at: string | null;
  disposed_at: string | null;
  disposal_reason_id: number | null;
  disposal_proceeds: number | null;
  disposal_je_id: number | null;
  notes: string | null;
  created_at: string;
  // Joined fields
  category?: { name: string; code: string };
  location?: { name: string } | null;
  custodian?: { name: string } | null;
}

export interface FixedAssetCategory {
  id: number;
  enterprise_id: number;
  code: string;
  name: string;
  default_useful_life_months: number;
  default_residual_value: number;
  asset_account_id: number | null;
  accumulated_depreciation_account_id: number | null;
  depreciation_expense_account_id: number | null;
  gain_loss_on_disposal_account_id: number | null;
  is_active: boolean;
}

export interface FixedAssetLocation {
  id: number;
  enterprise_id: number;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

export interface FixedAssetCustodian {
  id: number;
  enterprise_id: number;
  name: string;
  identifier: string | null;
  contact: string | null;
  notes: string | null;
  is_active: boolean;
}

export interface FixedAssetPolicy {
  id?: number;
  enterprise_id: number;
  accounting_standard_mode: "FISCAL" | "IFRS_POLICY";
  depreciation_method: "STRAIGHT_LINE";
  depreciation_start_rule: "IN_SERVICE_DATE" | "ACQUISITION_DATE";
  posting_frequency: "MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "ANNUAL";
  rounding_decimals: number;
  allow_mid_month_disposal_proration: boolean;
}

export interface DepreciationScheduleRow {
  id: number;
  asset_id: number;
  year: number;
  month: number;
  planned_depreciation_amount: number;
  posted_depreciation_amount: number | null;
  accumulated_depreciation: number;
  net_book_value: number;
  status: "PLANNED" | "POSTED" | "SKIPPED";
  journal_entry_id: number | null;
  posting_run_id: string | null;
  posted_at: string | null;
}

// ─── Helper ─────────────────────────────────────────────────────────────────

function onErr(e: unknown) {
  toast.error(e instanceof Error ? e.message : String(e));
}

// Typed wrapper so TS stops complaining about new tables not in generated types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (table: string) => (supabase as any).from(table);

// ─── Policy ─────────────────────────────────────────────────────────────────

export function useAssetPolicy(enterpriseId: number | null) {
  return useQuery<FixedAssetPolicy | null>({
    queryKey: ["fixed_asset_policy", enterpriseId],
    enabled: !!enterpriseId,
    queryFn: async () => {
      const { data, error } = await db("fixed_asset_policy")
        .select("*")
        .eq("enterprise_id", enterpriseId!)
        .maybeSingle();
      if (error) throw error;
      return data as FixedAssetPolicy | null;
    },
  });
}

export function useUpsertAssetPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (policy: FixedAssetPolicy) => {
      const { error } = await db("fixed_asset_policy").upsert(policy, { onConflict: "enterprise_id" });
      if (error) throw error;
    },
    onSuccess: (_, policy) => {
      qc.invalidateQueries({ queryKey: ["fixed_asset_policy", policy.enterprise_id] });
      toast.success("Política de depreciación guardada");
    },
    onError: onErr,
  });
}

// ─── Categories ──────────────────────────────────────────────────────────────

export function useAssetCategories(enterpriseId: number | null) {
  return useQuery<FixedAssetCategory[]>({
    queryKey: ["fixed_asset_categories", enterpriseId],
    enabled: !!enterpriseId,
    queryFn: async () => {
      const { data, error } = await db("fixed_asset_categories")
        .select("*").eq("enterprise_id", enterpriseId!).order("code");
      if (error) throw error;
      return (data ?? []) as FixedAssetCategory[];
    },
  });
}

export function useUpsertAssetCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cat: Partial<FixedAssetCategory> & { enterprise_id: number }) => {
      const { id, ...payload } = cat;
      const { error } = id
        ? await db("fixed_asset_categories").update(payload).eq("id", id)
        : await db("fixed_asset_categories").insert(payload);
      if (error) throw error;
    },
    onSuccess: (_, cat) => {
      qc.invalidateQueries({ queryKey: ["fixed_asset_categories", cat.enterprise_id] });
      toast.success("Categoría guardada");
    },
    onError: onErr,
  });
}

export function useDeleteAssetCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, enterprise_id }: { id: number; enterprise_id: number }) => {
      const { error } = await db("fixed_asset_categories").delete().eq("id", id);
      if (error) throw error;
      return enterprise_id;
    },
    onSuccess: (eid) => { qc.invalidateQueries({ queryKey: ["fixed_asset_categories", eid] }); toast.success("Categoría eliminada"); },
    onError: onErr,
  });
}

// ─── Locations ───────────────────────────────────────────────────────────────

export function useAssetLocations(enterpriseId: number | null) {
  return useQuery<FixedAssetLocation[]>({
    queryKey: ["fixed_asset_locations", enterpriseId],
    enabled: !!enterpriseId,
    queryFn: async () => {
      const { data, error } = await db("fixed_asset_locations")
        .select("*").eq("enterprise_id", enterpriseId!).order("code");
      if (error) throw error;
      return (data ?? []) as FixedAssetLocation[];
    },
  });
}

export function useUpsertAssetLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (loc: Partial<FixedAssetLocation> & { enterprise_id: number }) => {
      const { id, ...payload } = loc;
      const { error } = id
        ? await db("fixed_asset_locations").update(payload).eq("id", id)
        : await db("fixed_asset_locations").insert(payload);
      if (error) throw error;
    },
    onSuccess: (_, loc) => {
      qc.invalidateQueries({ queryKey: ["fixed_asset_locations", loc.enterprise_id] });
      toast.success("Ubicación guardada");
    },
    onError: onErr,
  });
}

export function useDeleteAssetLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, enterprise_id }: { id: number; enterprise_id: number }) => {
      const { error } = await db("fixed_asset_locations").delete().eq("id", id);
      if (error) throw error;
      return enterprise_id;
    },
    onSuccess: (eid) => { qc.invalidateQueries({ queryKey: ["fixed_asset_locations", eid] }); toast.success("Ubicación eliminada"); },
    onError: onErr,
  });
}

// ─── Custodians ──────────────────────────────────────────────────────────────

export function useAssetCustodians(enterpriseId: number | null) {
  return useQuery<FixedAssetCustodian[]>({
    queryKey: ["fixed_asset_custodians", enterpriseId],
    enabled: !!enterpriseId,
    queryFn: async () => {
      const { data, error } = await db("fixed_asset_custodians")
        .select("*").eq("enterprise_id", enterpriseId!).order("name");
      if (error) throw error;
      return (data ?? []) as FixedAssetCustodian[];
    },
  });
}

export function useUpsertAssetCustodian() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: Partial<FixedAssetCustodian> & { enterprise_id: number }) => {
      const { id, ...payload } = c;
      const { error } = id
        ? await db("fixed_asset_custodians").update(payload).eq("id", id)
        : await db("fixed_asset_custodians").insert(payload);
      if (error) throw error;
    },
    onSuccess: (_, c) => {
      qc.invalidateQueries({ queryKey: ["fixed_asset_custodians", c.enterprise_id] });
      toast.success("Custodio guardado");
    },
    onError: onErr,
  });
}

export function useDeleteAssetCustodian() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, enterprise_id }: { id: number; enterprise_id: number }) => {
      const { error } = await db("fixed_asset_custodians").delete().eq("id", id);
      if (error) throw error;
      return enterprise_id;
    },
    onSuccess: (eid) => { qc.invalidateQueries({ queryKey: ["fixed_asset_custodians", eid] }); toast.success("Custodio eliminado"); },
    onError: onErr,
  });
}

// ─── Fixed Assets ────────────────────────────────────────────────────────────

export function useFixedAssets(enterpriseId: number | null) {
  return useQuery<FixedAsset[]>({
    queryKey: ["fixed_assets", enterpriseId],
    enabled: !!enterpriseId,
    queryFn: async () => {
      const { data, error } = await db("fixed_assets")
        .select(`
          *,
          category:fixed_asset_categories(name, code),
          location:fixed_asset_locations(name),
          custodian:fixed_asset_custodians(name)
        `)
        .eq("enterprise_id", enterpriseId!)
        .order("asset_code");
      if (error) throw error;
      return (data ?? []) as FixedAsset[];
    },
  });
}

export function useUpsertFixedAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (asset: Partial<FixedAsset> & { enterprise_id: number; tenant_id: number }) => {
      const { id, category, location, custodian, ...payload } = asset as FixedAsset & { [key: string]: unknown };
      void category; void location; void custodian;
      if (id) {
        const { data, error } = await db("fixed_assets")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", id).select().single();
        if (error) throw error;
        return data as FixedAsset;
      } else {
        const { data, error } = await db("fixed_assets").insert(payload).select().single();
        if (error) throw error;
        return data as FixedAsset;
      }
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["fixed_assets", data.enterprise_id] });
      toast.success("Activo guardado");
    },
    onError: onErr,
  });
}

export function useActivateAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      asset,
      depreciation_start_rule,
    }: {
      asset: FixedAsset;
      depreciation_start_rule: "IN_SERVICE_DATE" | "ACQUISITION_DATE";
    }) => {
      const schedule = generateDepreciationSchedule({
        acquisition_cost: asset.acquisition_cost,
        residual_value: asset.residual_value,
        useful_life_months: asset.useful_life_months,
        acquisition_date: asset.acquisition_date,
        in_service_date: asset.in_service_date,
        depreciation_start_rule,
      });

      if (schedule.length > 0) {
        const rows = schedule.map((r) => ({
          asset_id: asset.id,
          enterprise_id: asset.enterprise_id,
          year: r.year,
          month: r.month,
          planned_depreciation_amount: r.planned_depreciation_amount,
          accumulated_depreciation: r.accumulated_depreciation,
          net_book_value: r.net_book_value,
          status: "PLANNED",
        }));
        const { error } = await db("fixed_asset_depreciation_schedule").insert(rows);
        if (error) throw error;
      }

      const { error } = await db("fixed_assets")
        .update({ status: "ACTIVE", activated_at: new Date().toISOString() })
        .eq("id", asset.id);
      if (error) throw error;

      await db("fixed_asset_event_log").insert({
        asset_id: asset.id,
        enterprise_id: asset.enterprise_id,
        event_type: "ACTIVATE",
        metadata_json: { useful_life_months: asset.useful_life_months, schedule_rows: schedule.length },
      });
    },
    onSuccess: (_, { asset }) => {
      qc.invalidateQueries({ queryKey: ["fixed_assets", asset.enterprise_id] });
      qc.invalidateQueries({ queryKey: ["depreciation_schedule", asset.id] });
      toast.success("Activo activado y calendario de depreciación generado");
    },
    onError: onErr,
  });
}

/**
 * Crea un activo y lo activa (genera calendario de depreciación) en un solo
 * paso, para que el flujo normal de "Nuevo activo" no deje activos en DRAFT.
 * Si el insert falla, la mutación falla completa (nada se crea). Si el
 * insert funciona pero la activación falla, NO se revierte el insert — el
 * activo queda en DRAFT (estado válido y recuperable) y se reporta el error
 * claramente para que el usuario use el botón "Activar" existente.
 */
export function useCreateAndActivateAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      asset,
      depreciation_start_rule,
    }: {
      asset: Partial<FixedAsset> & { enterprise_id: number; tenant_id: number };
      depreciation_start_rule: "IN_SERVICE_DATE" | "ACQUISITION_DATE";
    }) => {
      const { id, category, location, custodian, ...payload } = asset as FixedAsset & { [key: string]: unknown };
      void id; void category; void location; void custodian;

      const { data: created, error: insertError } = await db("fixed_assets").insert(payload).select().single();
      if (insertError) throw insertError;
      const createdAsset = created as FixedAsset;

      const schedule = generateDepreciationSchedule({
        acquisition_cost: createdAsset.acquisition_cost,
        residual_value: createdAsset.residual_value,
        useful_life_months: createdAsset.useful_life_months,
        acquisition_date: createdAsset.acquisition_date,
        in_service_date: createdAsset.in_service_date,
        depreciation_start_rule,
      });

      try {
        if (schedule.length > 0) {
          const rows = schedule.map((r) => ({
            asset_id: createdAsset.id,
            enterprise_id: createdAsset.enterprise_id,
            year: r.year,
            month: r.month,
            planned_depreciation_amount: r.planned_depreciation_amount,
            accumulated_depreciation: r.accumulated_depreciation,
            net_book_value: r.net_book_value,
            status: "PLANNED",
          }));
          const { error } = await db("fixed_asset_depreciation_schedule").insert(rows);
          if (error) throw error;
        }

        const { error: activateError } = await db("fixed_assets")
          .update({ status: "ACTIVE", activated_at: new Date().toISOString() })
          .eq("id", createdAsset.id);
        if (activateError) throw activateError;

        await db("fixed_asset_event_log").insert({
          asset_id: createdAsset.id,
          enterprise_id: createdAsset.enterprise_id,
          event_type: "ACTIVATE",
          metadata_json: { useful_life_months: createdAsset.useful_life_months, schedule_rows: schedule.length },
        });

        return { asset: { ...createdAsset, status: "ACTIVE" as AssetStatus }, activated: true, activationError: null as unknown };
      } catch (activationError) {
        return { asset: createdAsset, activated: false, activationError };
      }
    },
    onSuccess: ({ asset, activated, activationError }) => {
      qc.invalidateQueries({ queryKey: ["fixed_assets", asset.enterprise_id] });
      qc.invalidateQueries({ queryKey: ["depreciation_schedule", asset.id] });
      if (activated) {
        toast.success("Activo creado y activado — calendario de depreciación generado");
      } else {
        const message = activationError instanceof Error ? activationError.message : String(activationError);
        toast.error(`El activo ${asset.asset_code} se creó pero no se pudo activar automáticamente (${message}). Usa el botón "Activar" para reintentar.`);
      }
    },
    onError: onErr,
  });
}

export function useDepreciationSchedule(assetId: number | null) {
  return useQuery<DepreciationScheduleRow[]>({
    queryKey: ["depreciation_schedule", assetId],
    enabled: !!assetId,
    queryFn: async () => {
      const { data, error } = await db("fixed_asset_depreciation_schedule")
        .select("*").eq("asset_id", assetId!).order("year").order("month");
      if (error) throw error;
      return (data ?? []) as DepreciationScheduleRow[];
    },
  });
}

// ─── Historical depreciation detection ───────────────────────────────────────
// fixed_assets / fixed_asset_depreciation_schedule are now in the generated
// Database types, so this hook queries the real typed client instead of the
// `db()` any-cast helper above (kept only for tables still not generated).

export interface HistoricalPendingAsset {
  asset_id: number;
  asset_name: string;
  asset_code: string;
  months_count: number;
  earliest: { year: number; month: number };
}

export function useHistoricalPendingDepreciation(enterpriseId: number | null) {
  return useQuery<HistoricalPendingAsset[]>({
    queryKey: ["historical_pending_depreciation", enterpriseId],
    enabled: !!enterpriseId,
    queryFn: async () => {
      const now = new Date();
      const currentPeriodKey = now.getFullYear() * 12 + (now.getMonth() + 1);

      const { data: activeAssets, error: assetsError } = await supabase
        .from("fixed_assets")
        .select("id, asset_name, asset_code")
        .eq("enterprise_id", enterpriseId!)
        .eq("status", "ACTIVE");
      if (assetsError) throw assetsError;
      if (!activeAssets || activeAssets.length === 0) return [];

      const assetIds = activeAssets.map((a) => a.id);
      const { data: plannedRows, error: scheduleError } = await supabase
        .from("fixed_asset_depreciation_schedule")
        .select("asset_id, year, month")
        .eq("enterprise_id", enterpriseId!)
        .eq("status", "PLANNED")
        .in("asset_id", assetIds);
      if (scheduleError) throw scheduleError;

      const assetById = new Map(activeAssets.map((a) => [a.id, a]));
      const grouped = new Map<number, HistoricalPendingAsset>();
      for (const row of plannedRows ?? []) {
        const rowPeriodKey = row.year * 12 + row.month;
        if (rowPeriodKey >= currentPeriodKey) continue;
        const asset = assetById.get(row.asset_id);
        if (!asset) continue;

        const existing = grouped.get(row.asset_id);
        if (existing) {
          existing.months_count += 1;
          if (rowPeriodKey < existing.earliest.year * 12 + existing.earliest.month) {
            existing.earliest = { year: row.year, month: row.month };
          }
        } else {
          grouped.set(row.asset_id, {
            asset_id: row.asset_id,
            asset_name: asset.asset_name,
            asset_code: asset.asset_code,
            months_count: 1,
            earliest: { year: row.year, month: row.month },
          });
        }
      }
      return Array.from(grouped.values()).sort((a, b) => a.asset_name.localeCompare(b.asset_name));
    },
  });
}

// ─── Reports: full depreciation schedule for an enterprise ───────────────────

export interface DepreciationScheduleForReports {
  asset_id: number;
  year: number;
  month: number;
  planned_depreciation_amount: number;
  posted_depreciation_amount: number | null;
  status: string;
}

/**
 * Trae TODAS las filas de fixed_asset_depreciation_schedule de la empresa
 * (todos los activos), usada por los reportes de Activos Fijos que necesitan
 * agregar depreciación por categoría/período en vez de por un solo activo.
 * Un activo con vida útil larga puede generar cientos de filas y una empresa
 * con muchos activos puede superar el límite de 1000 filas de Supabase, así
 * que se pagina con fetchAllRecords en vez de un select directo.
 */
export function useAllDepreciationSchedule(enterpriseId: number | null) {
  return useQuery<DepreciationScheduleForReports[]>({
    queryKey: ["all_depreciation_schedule", enterpriseId],
    enabled: !!enterpriseId,
    queryFn: async () => {
      const query = supabase
        .from("fixed_asset_depreciation_schedule")
        .select("asset_id, year, month, planned_depreciation_amount, posted_depreciation_amount, status")
        .eq("enterprise_id", enterpriseId!);
      return fetchAllRecords<DepreciationScheduleForReports>(query);
    },
  });
}

export function useDisposalReasons() {
  return useQuery<Array<{ id: number; code: string; name: string }>>({
    queryKey: ["fixed_asset_disposal_reasons"],
    queryFn: async () => {
      const { data, error } = await db("fixed_asset_disposal_reasons").select("*").order("id");
      if (error) throw error;
      return (data ?? []) as Array<{ id: number; code: string; name: string }>;
    },
  });
}

export function useAssetEventLog(assetId: number | null) {
  return useQuery<Array<{ id: number; event_type: string; actor_user_id: string | null; metadata_json: Record<string, unknown> | null; created_at: string }>>({
    queryKey: ["asset_event_log", assetId],
    enabled: !!assetId,
    queryFn: async () => {
      const { data, error } = await db("fixed_asset_event_log")
        .select("*").eq("asset_id", assetId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{ id: number; event_type: string; actor_user_id: string | null; metadata_json: Record<string, unknown> | null; created_at: string }>;
    },
  });
}

// ─── Custodian assignment history ────────────────────────────────────────────
// fixed_assets.custodian_id sigue siendo el "custodio actual" (usado en la
// lista y en el join de useFixedAssets) — se sincroniza aquí, pero el
// historial real de quién tuvo el activo y cuándo vive en esta tabla.

export interface CustodianAssignment {
  id: number;
  asset_id: number;
  enterprise_id: number;
  custodian_id: number;
  assigned_date: string;
  returned_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  custodian?: { name: string } | null;
}

export function useCustodianAssignments(assetId: number | null) {
  return useQuery<CustodianAssignment[]>({
    queryKey: ["custodian_assignments", assetId],
    enabled: !!assetId,
    queryFn: async () => {
      const { data, error } = await db("fixed_asset_custodian_assignments")
        .select("*, custodian:fixed_asset_custodians(name)")
        .eq("asset_id", assetId!);
      if (error) throw error;
      const rows = (data ?? []) as CustodianAssignment[];
      // La asignación abierta (sin returned_date) siempre primero; el resto
      // de la más reciente a la más antigua por fecha de asignación.
      return rows.sort((a, b) => {
        if (!a.returned_date && b.returned_date) return -1;
        if (a.returned_date && !b.returned_date) return 1;
        return b.assigned_date.localeCompare(a.assigned_date);
      });
    },
  });
}

export function useAssignCustodian() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      asset_id,
      enterprise_id,
      custodian_id,
      assigned_date,
      notes,
    }: {
      asset_id: number;
      enterprise_id: number;
      custodian_id: number;
      assigned_date: string;
      notes?: string;
    }) => {
      const { data: authData } = await supabase.auth.getUser();
      const { error: insertError } = await db("fixed_asset_custodian_assignments").insert({
        asset_id,
        enterprise_id,
        custodian_id,
        assigned_date,
        notes: notes?.trim() || null,
        created_by: authData.user?.id ?? null,
      });
      if (insertError) throw insertError;

      const { error: updateError } = await db("fixed_assets").update({ custodian_id }).eq("id", asset_id);
      if (updateError) throw updateError;

      await db("fixed_asset_event_log").insert({
        asset_id,
        enterprise_id,
        actor_user_id: authData.user?.id ?? null,
        event_type: "CUSTODIAN_ASSIGNED",
        metadata_json: { custodian_id, assigned_date },
      });
    },
    onSuccess: (_, { asset_id, enterprise_id }) => {
      qc.invalidateQueries({ queryKey: ["custodian_assignments", asset_id] });
      qc.invalidateQueries({ queryKey: ["fixed_assets", enterprise_id] });
      qc.invalidateQueries({ queryKey: ["asset_event_log", asset_id] });
      toast.success("Custodio asignado");
    },
    onError: onErr,
  });
}

export function useReturnCustodian() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      assignment_id,
      asset_id,
      enterprise_id,
      custodian_id,
      returned_date,
      notes,
    }: {
      assignment_id: number;
      asset_id: number;
      enterprise_id: number;
      custodian_id: number;
      returned_date: string;
      notes?: string;
    }) => {
      const { data: authData } = await supabase.auth.getUser();
      const { error: updateError } = await db("fixed_asset_custodian_assignments")
        .update({ returned_date, notes: notes?.trim() || null })
        .eq("id", assignment_id);
      if (updateError) throw updateError;

      const { error: clearError } = await db("fixed_assets").update({ custodian_id: null }).eq("id", asset_id);
      if (clearError) throw clearError;

      await db("fixed_asset_event_log").insert({
        asset_id,
        enterprise_id,
        actor_user_id: authData.user?.id ?? null,
        event_type: "CUSTODIAN_RETURNED",
        metadata_json: { custodian_id, returned_date },
      });
    },
    onSuccess: (_, { asset_id, enterprise_id }) => {
      qc.invalidateQueries({ queryKey: ["custodian_assignments", asset_id] });
      qc.invalidateQueries({ queryKey: ["fixed_assets", enterprise_id] });
      qc.invalidateQueries({ queryKey: ["asset_event_log", asset_id] });
      toast.success("Entrega registrada");
    },
    onError: onErr,
  });
}

// ─── Reports: open custodian assignments across the enterprise ──────────────
// Usada por el reporte "Tarjeta de Responsabilidad" — necesita, para TODOS
// los custodios de la empresa (filtrados en el componente), sus asignaciones
// actualmente abiertas (returned_date IS NULL) con datos del activo.

export interface OpenCustodianAssignmentForReport {
  id: number;
  custodian_id: number;
  assigned_date: string;
  asset: {
    asset_code: string;
    asset_name: string;
    category: { name: string } | null;
  } | null;
}

export function useOpenCustodianAssignmentsByEnterprise(enterpriseId: number | null) {
  return useQuery<OpenCustodianAssignmentForReport[]>({
    queryKey: ["open_custodian_assignments", enterpriseId],
    enabled: !!enterpriseId,
    queryFn: async () => {
      const { data, error } = await db("fixed_asset_custodian_assignments")
        .select("id, custodian_id, assigned_date, asset:fixed_assets(asset_code, asset_name, category:fixed_asset_categories(name))")
        .eq("enterprise_id", enterpriseId!)
        .is("returned_date", null)
        .order("assigned_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as OpenCustodianAssignmentForReport[];
    },
  });
}

// ─── Accounts for dropdowns (used in AssetCategoriesManager) ─────────────────

export function useEnterpriseAccounts(enterpriseId: number | null) {
  return useQuery<Array<{ id: number; account_code: string; account_name: string }>>({
    queryKey: ["enterprise_accounts_for_assets", enterpriseId],
    enabled: !!enterpriseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tab_accounts")
        .select("id, account_code, account_name")
        .eq("enterprise_id", enterpriseId!)
        .eq("is_active", true)
        .order("account_code");
      if (error) throw error;
      return (data ?? []) as Array<{ id: number; account_code: string; account_name: string }>;
    },
  });
}
