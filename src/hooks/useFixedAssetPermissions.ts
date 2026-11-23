import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Permisos del módulo de activos fijos para el usuario actual en una empresa.
 *
 * La fuente es la base de datos (funciones can_write_fixed_assets y
 * can_manage_fixed_asset_valuation), la misma que aplica las restricciones. La
 * interfaz solo usa esto para deshabilitar acciones y explicar por qué; quien manda es
 * la base de datos.
 */
export interface FixedAssetPermissions {
  /** Operar: crear y activar borradores, datos no críticos, ubicaciones, custodios, adjuntos. */
  canWrite: boolean;
  /** Valoración y contabilidad: costo, vida útil, bajas, depreciación, categorías y política. */
  canManageValuation: boolean;
  isLoading: boolean;
}

/** Mientras carga, o si una consulta no devolvió true, el permiso es false. */
export function resolveFixedAssetPermissions({
  writeData,
  valuationData,
  loading,
}: {
  writeData: boolean | null | undefined;
  valuationData: boolean | null | undefined;
  loading: boolean;
}): FixedAssetPermissions {
  if (loading) return { canWrite: false, canManageValuation: false, isLoading: true };
  return { canWrite: writeData === true, canManageValuation: valuationData === true, isLoading: false };
}

// types.ts aún no incluye las dos funciones: envoltorio tipado de supabase.rpc.
type RpcBoolean = (
  fn: string,
  args: { _enterprise_id: number },
) => PromiseLike<{ data: boolean | null; error: { message: string } | null }>;
const callRpc = supabase.rpc.bind(supabase) as unknown as RpcBoolean;

async function checkPermission(fn: string, enterpriseId: number): Promise<boolean> {
  const { data, error } = await callRpc(fn, { _enterprise_id: enterpriseId });
  if (error) {
    console.error(`Error consultando ${fn}:`, error.message);
    return false;
  }
  return data === true;
}

export function useFixedAssetPermissions(enterpriseId: number | null): FixedAssetPermissions {
  const { data, isLoading } = useQuery({
    queryKey: ["fixed-asset-permissions", enterpriseId],
    enabled: enterpriseId != null,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const id = enterpriseId as number;
      try {
        const [write, valuation] = await Promise.all([
          checkPermission("can_write_fixed_assets", id),
          checkPermission("can_manage_fixed_asset_valuation", id),
        ]);
        return { write, valuation };
      } catch (err) {
        // Error de red: sin permisos en la interfaz, sin romper la pantalla.
        console.error("Error consultando permisos de activos fijos:", err);
        return { write: false, valuation: false };
      }
    },
  });

  return resolveFixedAssetPermissions({
    writeData: data?.write,
    valuationData: data?.valuation,
    loading: enterpriseId != null && isLoading,
  });
}
