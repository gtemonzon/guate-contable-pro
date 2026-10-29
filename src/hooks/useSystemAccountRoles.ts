import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { collectSystemAccountRoles } from "@/utils/systemAccountRoles";

const EMPTY = new Map<number, string[]>();

/** Mapa cuenta -> roles con que el sistema la usa en la empresa. */
export function useSystemAccountRoles(enterpriseId: number | null): Map<number, string[]> {
  const { data } = useQuery({
    queryKey: ["system-account-roles", enterpriseId],
    enabled: enterpriseId != null,
    staleTime: 60_000,
    queryFn: async () => {
      const id = enterpriseId as number;
      try {
        const [config, assets, banks] = await Promise.all([
          supabase.from("tab_enterprise_config").select("*").eq("enterprise_id", id).maybeSingle(),
          supabase
            .from("fixed_asset_categories")
            .select("name, asset_account_id, accumulated_depreciation_account_id, depreciation_expense_account_id, gain_loss_on_disposal_account_id")
            .eq("enterprise_id", id),
          supabase.from("tab_bank_accounts").select("account_id, bank_name, account_number").eq("enterprise_id", id),
        ]);
        for (const r of [config, assets, banks]) if (r.error) console.error("Error al cargar cuentas usadas por el sistema:", r.error);
        return collectSystemAccountRoles({
          config: (config.data as Record<string, unknown> | null) ?? null,
          assetCategories: (assets.data ?? []) as Array<Record<string, unknown>>,
          bankAccounts: banks.data ?? [],
        });
      } catch (err) {
        console.error("Error al cargar cuentas usadas por el sistema:", err);
        return EMPTY;
      }
    },
  });
  return data ?? EMPTY;
}
