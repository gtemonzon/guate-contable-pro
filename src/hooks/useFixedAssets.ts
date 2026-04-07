/**
 * Hooks for Fixed Assets module — data fetching and mutations.
 * Uses `as any` casts since new tables are not yet in auto-generated types.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generateDepreciationSchedule } from "@/domain/fixedAssets/calculations";

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
  supplier_id: number | null;
  cost_center: string | null;
  acquisition_date: string;
  in_service_date: string | null;
  acquisition_cost: number;
  residual_value: number;
  useful_life_months: number;
  currency: string;
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
  supplier?: { name: string } | null;
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

export interface FixedAssetSupplier {
  id: number;
  enterprise_id: number;
  name: string;
  tax_id: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
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

// ─── Suppliers ───────────────────────────────────────────────────────────────

export function useAssetSuppliers(enterpriseId: number | null) {
  return useQuery<FixedAssetSupplier[]>({
    queryKey: ["fixed_asset_suppliers", enterpriseId],
    enabled: !!enterpriseId,
    queryFn: async () => {
      const { data, error } = await db("fixed_asset_suppliers")
        .select("*").eq("enterprise_id", enterpriseId!).order("name");
      if (error) throw error;
      return (data ?? []) as FixedAssetSupplier[];
    },
  });
}

export function useUpsertAssetSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: Partial<FixedAssetSupplier> & { enterprise_id: number }) => {
      const { id, ...payload } = s;
      const { error } = id
        ? await db("fixed_asset_suppliers").update(payload).eq("id", id)
        : await db("fixed_asset_suppliers").insert(payload);
      if (error) throw error;
    },
    onSuccess: (_, s) => {
      qc.invalidateQueries({ queryKey: ["fixed_asset_suppliers", s.enterprise_id] });
      toast.success("Proveedor guardado");
    },
    onError: onErr,
  });
}

export function useDeleteAssetSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, enterprise_id }: { id: number; enterprise_id: number }) => {
      const { error } = await db("fixed_asset_suppliers").delete().eq("id", id);
      if (error) throw error;
      return enterprise_id;
    },
    onSuccess: (eid) => { qc.invalidateQueries({ queryKey: ["fixed_asset_suppliers", eid] }); toast.success("Proveedor eliminado"); },
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
          custodian:fixed_asset_custodians(name),
          supplier:fixed_asset_suppliers(name)
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
      const { id, category, location, custodian, supplier, ...payload } = asset as FixedAsset & { [key: string]: unknown };
      void category; void location; void custodian; void supplier;
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
