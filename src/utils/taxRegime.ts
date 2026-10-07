import { supabase } from "@/integrations/supabase/client";

/**
 * Fecha con que se resuelve el régimen vigente de un mes: el ÚLTIMO día del mes
 * (misma convención que regimeAsOfDate en LibrosFiscales).
 */
export function regimeAsOfDateForMonth(year: number, month: number): string {
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

/**
 * Régimen de IVA vigente en `asOfDate` (YYYY-MM-DD) según
 * tab_enterprise_tax_regime_history (effective_from <= asOfDate, el más reciente).
 * Sin fecha o sin fila en el historial, usa el régimen actual de tab_enterprises
 * (effectiveFrom null).
 */
export async function resolveTaxRegimeAsOf(
  enterpriseId: number,
  asOfDate?: string | null,
): Promise<{ regime: string | null; effectiveFrom: string | null }> {
  if (asOfDate) {
    const { data: historyRows } = await supabase
      .from("tab_enterprise_tax_regime_history")
      .select("tax_regime, effective_from")
      .eq("enterprise_id", enterpriseId)
      .lte("effective_from", asOfDate)
      .order("effective_from", { ascending: false })
      .limit(1);

    if (historyRows && historyRows.length > 0) {
      return { regime: historyRows[0].tax_regime, effectiveFrom: historyRows[0].effective_from };
    }
  }

  const { data } = await supabase
    .from("tab_enterprises")
    .select("tax_regime")
    .eq("id", enterpriseId)
    .maybeSingle();

  return { regime: data?.tax_regime ?? null, effectiveFrom: null };
}

/**
 * Formulario de IVA que corresponde a un régimen: pequeño contribuyente → IVA_PEQUENO;
 * régimen general → IVA_GENERAL; otro (exenta_ong, desconocido, null) → null.
 */
export function ivaFormTypeForRegime(regime: string | null | undefined): "IVA_GENERAL" | "IVA_PEQUENO" | null {
  if (!regime) return null;
  const r = regime.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (r.includes("pequen")) return "IVA_PEQUENO";
  if (r.includes("general")) return "IVA_GENERAL";
  return null;
}
