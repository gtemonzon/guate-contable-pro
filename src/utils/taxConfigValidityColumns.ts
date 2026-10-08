import { supabase } from "@/integrations/supabase/client";

/**
 * ¿La tabla ya tiene las columnas de vigencia (effective_from / effective_to)? Mientras
 * no se aplique la migración 20261008160000_vigencia_formularios, leerlas o escribirlas
 * falla: las pantallas ocultan las fechas y no las envían, para no romper el guardado.
 */
export async function hasValidityColumns(
  table: "tab_enterprise_tax_config" | "tab_tax_due_date_config",
): Promise<boolean> {
  // Conversión explícita: los tipos generados aún no incluyen estas columnas.
  const { error } = await supabase
    .from(table)
    .select("effective_from, effective_to" as "*")
    .limit(1);
  return !error;
}
