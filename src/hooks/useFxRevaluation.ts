import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface MonetaryAccountBalance {
  account_id: number;
  account_code: string;
  account_name: string;
  currency_code: string;
  /** Saldo en moneda extranjera al corte (suma original_*) */
  fx_balance: number;
  /** Tasa histórica promedio implícita = saldo funcional / saldo ME */
  current_rate: number;
  /** Tasa de cierre del mes (lookup en tab_exchange_rates) */
  cutoff_rate: number;
  /** Saldo equivalente actual en moneda funcional según libros */
  book_functional_balance: number;
  /** Saldo equivalente revaluado al cierre */
  revalued_functional_balance: number;
  /** Diferencia: positivo = ganancia, negativo = pérdida */
  delta: number;
}

export interface FxRevaluationPreview {
  enterprise_id: number;
  cutoff_date: string;
  year: number;
  month: number;
  base_currency: string;
  rows: MonetaryAccountBalance[];
  total_gain: number;
  total_loss: number;
  net_effect: number;
}

/**
 * Hook que calcula la previsualización del diferencial cambiario NO realizado.
 * Recorre cuentas marcadas is_monetary, calcula saldos en moneda extranjera y
 * compara contra la tasa de cierre del mes para producir el delta.
 */
export function useFxRevaluation() {
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);

  const buildPreview = useCallback(async (params: {
    enterpriseId: number;
    year: number;
    month: number;
  }): Promise<FxRevaluationPreview | null> => {
    setLoading(true);
    try {
      const { enterpriseId, year, month } = params;
      const cutoff = new Date(year, month, 0); // último día del mes
      const cutoffDate = cutoff.toISOString().slice(0, 10);

      // Moneda base
      const { data: enterprise } = await supabase
        .from("tab_enterprises")
        .select("base_currency_code")
        .eq("id", enterpriseId)
        .maybeSingle();
      const baseCurrency = enterprise?.base_currency_code || "GTQ";

      // Cuentas monetarias activas
      const { data: monetaryAccounts, error: accErr } = await supabase
        .from("tab_accounts")
        .select("id, account_code, account_name")
        .eq("enterprise_id", enterpriseId)
        .eq("is_monetary", true)
        .eq("is_active", true)
        .is("deleted_at", null);

      if (accErr) throw accErr;
      if (!monetaryAccounts?.length) {
        toast.info("No hay cuentas marcadas como monetarias en esta empresa.");
        return {
          enterprise_id: enterpriseId, cutoff_date: cutoffDate, year, month,
          base_currency: baseCurrency, rows: [], total_gain: 0, total_loss: 0, net_effect: 0,
        };
      }

      const accountIds = monetaryAccounts.map(a => a.id);

      // Traer todos los detalles de partidas contabilizadas para esas cuentas
      const { data: details, error: detErr } = await supabase
        .from("tab_journal_entry_details")
        .select(`
          account_id, debit_amount, credit_amount,
          original_debit, original_credit, currency_code, exchange_rate,
          tab_journal_entries!inner(entry_date, status, currency_code)
        `)
        .in("account_id", accountIds)
        .lte("tab_journal_entries.entry_date", cutoffDate)
        .eq("tab_journal_entries.status", "contabilizada");

      if (detErr) throw detErr;

      // Tasas del mes
      const { data: rates } = await supabase
        .from("tab_exchange_rates")
        .select("currency_code, rate")
        .eq("enterprise_id", enterpriseId)
        .eq("year", year)
        .eq("month", month);
      const rateMap = new Map<string, number>();
      (rates || []).forEach(r => rateMap.set(r.currency_code, Number(r.rate)));

      // Agrupar por (cuenta, moneda) — solo monedas distintas a base
      type Bucket = { fxBal: number; funcBal: number };
      const buckets = new Map<string, Bucket>();

      for (const d of (details || []) as any[]) {
        const headerCcy = d.tab_journal_entries?.currency_code || baseCurrency;
        const ccy = d.currency_code || headerCcy;
        if (!ccy || ccy === baseCurrency) continue;

        const key = `${d.account_id}|${ccy}`;
        const fxDebit = Number(d.original_debit ?? d.debit_amount ?? 0);
        const fxCredit = Number(d.original_credit ?? d.credit_amount ?? 0);
        const funcDebit = Number(d.debit_amount ?? 0);
        const funcCredit = Number(d.credit_amount ?? 0);

        const b = buckets.get(key) || { fxBal: 0, funcBal: 0 };
        b.fxBal += fxDebit - fxCredit;
        b.funcBal += funcDebit - funcCredit;
        buckets.set(key, b);
      }

      const rows: MonetaryAccountBalance[] = [];
      let totalGain = 0;
      let totalLoss = 0;

      for (const [key, b] of buckets.entries()) {
        const [accIdStr, ccy] = key.split("|");
        const accId = Number(accIdStr);
        const acc = monetaryAccounts.find(a => a.id === accId);
        if (!acc) continue;
        if (Math.abs(b.fxBal) < 0.005) continue; // saldo cero, no aplica

        const cutoffRate = rateMap.get(ccy) ?? 0;
        if (cutoffRate <= 0) continue; // sin tasa no se puede revaluar

        const currentRate = b.fxBal !== 0 ? b.funcBal / b.fxBal : 0;
        const revalued = b.fxBal * cutoffRate;
        const delta = revalued - b.funcBal;
        if (Math.abs(delta) < 0.005) continue;

        rows.push({
          account_id: accId,
          account_code: acc.account_code,
          account_name: acc.account_name,
          currency_code: ccy,
          fx_balance: round2(b.fxBal),
          current_rate: round4(currentRate),
          cutoff_rate: cutoffRate,
          book_functional_balance: round2(b.funcBal),
          revalued_functional_balance: round2(revalued),
          delta: round2(delta),
        });

        if (delta > 0) totalGain += delta; else totalLoss += Math.abs(delta);
      }

      rows.sort((a, b) => a.account_code.localeCompare(b.account_code));

      return {
        enterprise_id: enterpriseId,
        cutoff_date: cutoffDate,
        year, month,
        base_currency: baseCurrency,
        rows,
        total_gain: round2(totalGain),
        total_loss: round2(totalLoss),
        net_effect: round2(totalGain - totalLoss),
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Error calculando revaluación: " + msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Genera la partida DIFC-NR-YYYY-MM con el resultado de la previsualización.
   * Usa las cuentas unrealized_fx_gain/loss configuradas en tab_enterprise_config.
   */
  const postRevaluation = useCallback(async (preview: FxRevaluationPreview): Promise<number | null> => {
    if (!preview.rows.length) {
      toast.info("No hay diferenciales que registrar.");
      return null;
    }
    setPosting(true);
    try {
      // Obtener cuentas FX configuradas
      const { data: cfg, error: cfgErr } = await supabase
        .from("tab_enterprise_config")
        .select("unrealized_fx_gain_account_id, unrealized_fx_loss_account_id")
        .eq("enterprise_id", preview.enterprise_id)
        .maybeSingle();
      if (cfgErr) throw cfgErr;
      if (!cfg?.unrealized_fx_gain_account_id || !cfg?.unrealized_fx_loss_account_id) {
        toast.error("Configura las cuentas de diferencial cambiario NO realizado en Configuración → Cuentas Especiales.");
        return null;
      }

      // Generar número de partida
      const prefix = "DIFC";
      const { data: counter } = await supabase
        .from("journal_entry_counters")
        .select("last_number")
        .eq("enterprise_id", preview.enterprise_id)
        .eq("year", preview.year)
        .eq("month", preview.month)
        .eq("prefix", prefix)
        .maybeSingle();
      const nextNumber = (counter?.last_number || 0) + 1;
      const entryNumber = `${prefix}-${preview.year}-${String(preview.month).padStart(2, "0")}-${String(nextNumber).padStart(4, "0")}`;

      // Buscar período activo que contenga la fecha de corte
      const { data: period } = await supabase
        .from("tab_accounting_periods")
        .select("id, status")
        .eq("enterprise_id", preview.enterprise_id)
        .lte("start_date", preview.cutoff_date)
        .gte("end_date", preview.cutoff_date)
        .maybeSingle();
      if (!period) {
        toast.error("No hay un período contable que contenga la fecha de corte. Crea el período antes de revaluar.");
        return null;
      }
      if (period.status === "cerrado") {
        toast.error("El período está cerrado. Reabre el período para registrar la revaluación.");
        return null;
      }

      // Crear partida (sin contabilizar aún)
      const { data: entry, error: entryErr } = await supabase
        .from("tab_journal_entries")
        .insert([{
          enterprise_id: preview.enterprise_id,
          accounting_period_id: period.id,
          entry_number: entryNumber,
          entry_date: preview.cutoff_date,
          entry_type: "ajuste",
          description: `Revaluación cambiaria NO realizada - ${preview.year}/${String(preview.month).padStart(2, "0")}`,
          status: "borrador",
          currency_code: preview.base_currency,
          exchange_rate: 1,
          total_debit: 0,
          total_credit: 0,
        }])
        .select("id")
        .single();
      if (entryErr) throw entryErr;
      const entryId = entry.id as number;

      // Construir líneas (line_number es NOT NULL)
      const lines: any[] = [];
      let lineNo = 0;
      for (const r of preview.rows) {
        if (r.delta > 0) {
          // Ganancia: cargo a cuenta monetaria (sube), abono a unrealized_fx_gain
          lines.push({
            journal_entry_id: entryId,
            line_number: ++lineNo,
            account_id: r.account_id,
            debit_amount: r.delta, credit_amount: 0,
            description: `Revaluación ${r.currency_code} @ ${r.cutoff_rate}`,
          });
          lines.push({
            journal_entry_id: entryId,
            line_number: ++lineNo,
            account_id: cfg.unrealized_fx_gain_account_id,
            debit_amount: 0, credit_amount: r.delta,
            description: `Ganancia cambiaria NR - ${r.account_code}`,
          });
        } else {
          const amt = Math.abs(r.delta);
          lines.push({
            journal_entry_id: entryId,
            line_number: ++lineNo,
            account_id: cfg.unrealized_fx_loss_account_id,
            debit_amount: amt, credit_amount: 0,
            description: `Pérdida cambiaria NR - ${r.account_code}`,
          });
          lines.push({
            journal_entry_id: entryId,
            line_number: ++lineNo,
            account_id: r.account_id,
            debit_amount: 0, credit_amount: amt,
            description: `Revaluación ${r.currency_code} @ ${r.cutoff_rate}`,
          });
        }
      }

      const { error: linesErr } = await supabase.from("tab_journal_entry_details").insert(lines);
      if (linesErr) throw linesErr;

      // Calcular totales
      const totals = lines.reduce(
        (acc, l) => ({ d: acc.d + (l.debit_amount || 0), c: acc.c + (l.credit_amount || 0) }),
        { d: 0, c: 0 },
      );

      // Contabilizar
      const { error: postErr } = await supabase
        .from("tab_journal_entries")
        .update({
          status: "contabilizada",
          is_posted: true,
          posted_at: new Date().toISOString(),
          total_debit: totals.d,
          total_credit: totals.c,
        })
        .eq("id", entryId);
      if (postErr) throw postErr;

      // Avanzar contador
      await supabase.from("journal_entry_counters").upsert({
        enterprise_id: preview.enterprise_id,
        year: preview.year, month: preview.month, prefix,
        last_number: nextNumber,
      }, { onConflict: "enterprise_id,year,month,prefix" });

      // Registrar en tab_fx_revaluation_runs
      await supabase.from("tab_fx_revaluation_runs").insert([{
        enterprise_id: preview.enterprise_id,
        year: preview.year,
        month: preview.month,
        cutoff_date: preview.cutoff_date,
        revaluation_type: "UNREALIZED",
        journal_entry_id: entryId,
        total_gain: preview.total_gain,
        total_loss: preview.total_loss,
        details_json: { rows: preview.rows } as any,
        status: "POSTED",
      }]);

      toast.success(`Partida ${entryNumber} contabilizada (${preview.rows.length} cuentas revaluadas).`);
      return entryId;
    } catch (e: any) {
      toast.error("Error contabilizando revaluación: " + e.message);
      return null;
    } finally {
      setPosting(false);
    }
  }, []);

  /**
   * Lista las corridas de revaluación NO realizadas de la empresa, indicando si ya fueron reversadas.
   */
  const listRuns = useCallback(async (enterpriseId: number) => {
    const { data, error } = await supabase
      .from("tab_fx_revaluation_runs")
      .select(`
        id, year, month, cutoff_date, total_gain, total_loss, status,
        reversed_at, journal_entry_id, revaluation_type,
        tab_journal_entries:journal_entry_id (entry_number, reversed_by_entry_id)
      `)
      .eq("enterprise_id", enterpriseId)
      .eq("revaluation_type", "UNREALIZED")
      .order("cutoff_date", { ascending: false })
      .limit(24);
    if (error) {
      toast.error("Error cargando historial: " + error.message);
      return [];
    }
    return data || [];
  }, []);

  /**
   * Genera la partida espejo de reverso (DIFC-) el día 1 del mes siguiente al corte.
   * Invoca la función SQL reverse_fx_revaluation que valida período abierto y vincula bidireccional.
   */
  const reverseRun = useCallback(async (runId: number): Promise<number | null> => {
    setPosting(true);
    try {
      const { data, error } = await supabase.rpc("reverse_fx_revaluation", { p_run_id: runId });
      if (error) throw error;
      const newEntryId = Number(data);
      toast.success("Partida de reverso contabilizada exitosamente.");
      return newEntryId;
    } catch (e: any) {
      toast.error("Error generando reverso: " + (e.message || e));
      return null;
    } finally {
      setPosting(false);
    }
  }, []);

  return { loading, posting, buildPreview, postRevaluation, listRuns, reverseRun };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;
