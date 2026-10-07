import { supabase } from "@/integrations/supabase/client";
import { getFiscalFloorDate, applyFiscalFloor } from "@/utils/fiscalFloor";

/**
 * Crédito remanente sugerido para el mes (year, month) = saldo final de la cuenta IVA
 * Crédito al cierre del mes inmediato anterior. Usa el piso fiscal (última 'apertura'
 * vigente) como cota inferior: una partida de apertura YA restablece el saldo acumulado
 * de años anteriores, así que sumar todo el historial desde el inicio de los tiempos la
 * contaría dos veces. Devuelve 0 sin configuración o ante error.
 *
 * Compartida por el Generador de Declaraciones y el Dashboard.
 */
export async function fetchSuggestedVatCredit(enterpriseId: number, year: number, month: number): Promise<number> {
  try {
    const { data: configData } = await supabase
      .from("tab_enterprise_config")
      .select("vat_credit_account_id")
      .eq("enterprise_id", enterpriseId)
      .maybeSingle();

    if (!configData?.vat_credit_account_id) return 0;

    const vatCreditAccountId = configData.vat_credit_account_id;

    // End of previous month (inclusive)
    const prevMonthEnd = new Date(year, month - 1, 0); // last day of prev month
    const prevEnd = prevMonthEnd.toISOString().split('T')[0];

    const fiscalFloor = await getFiscalFloorDate(enterpriseId, prevEnd);

    let query = supabase
      .from("tab_journal_entry_details")
      .select(`
        debit_amount,
        credit_amount,
        tab_journal_entries!inner (
          enterprise_id,
          entry_date,
          is_posted
        )
      `)
      .eq("account_id", vatCreditAccountId)
      .eq("tab_journal_entries.enterprise_id", enterpriseId)
      .eq("tab_journal_entries.is_posted", true)
      .lte("tab_journal_entries.entry_date", prevEnd);

    query = applyFiscalFloor(query, "tab_journal_entries.entry_date", fiscalFloor);

    const { data: journalDetails } = await query;

    if (!journalDetails || journalDetails.length === 0) return 0;

    let totalDebit = 0;
    let totalCredit = 0;

    journalDetails.forEach((detail) => {
      totalDebit += Number(detail.debit_amount) || 0;
      totalCredit += Number(detail.credit_amount) || 0;
    });

    const saldoFinalPrevio = totalDebit - totalCredit;

    // Only positive balance is a credit (remanente); negative would mean tax payable
    return Math.max(0, saldoFinalPrevio);
  } catch (err) {
    console.error("Error calculating suggested crédito remanente:", err);
    return 0;
  }
}
