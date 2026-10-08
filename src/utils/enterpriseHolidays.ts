import { supabase } from "@/integrations/supabase/client";
import { parseHolidaysForYears, type Holiday } from "@/utils/dueDateCalculations";

/**
 * Feriados de la empresa como fechas, para el año anterior, el de `today` y el
 * siguiente (los recurrentes se repiten en cada uno). Compartido por la tarjeta de
 * Próximos Vencimientos y el ISR trimestral del Dashboard.
 */
export async function fetchEnterpriseHolidayDates(enterpriseId: number, today: Date = new Date()): Promise<Date[]> {
  const { data } = await supabase
    .from("tab_holidays")
    .select("holiday_date, description, is_recurring")
    .eq("enterprise_id", enterpriseId);
  return parseHolidaysForYears((data || []) as Holiday[], today.getFullYear());
}
