import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface FxOpenBalance {
  id: number;
  enterprise_id: number;
  invoice_type: "purchase" | "sales";
  invoice_id: number;
  invoice_date: string;
  currency_code: string;
  registered_rate: number;
  original_total: number;
  original_paid: number;
  original_open: number;
  fully_settled: boolean;
  // Enriquecidos en cliente
  invoice_number?: string;
  counterpart_name?: string;
}

export interface FxSettlementCalc {
  open_balance_id: number;
  invoice_type: string;
  invoice_id: number;
  currency_code: string;
  registered_rate: number;
  payment_rate: number;
  paid_original: number;
  fx_difference: number;
  is_gain: boolean;
  remaining_open: number;
  fully_settled: boolean;
}

export interface SettlementSelection {
  open_balance: FxOpenBalance;
  paid_original: number; // monto en ME que esta partida liquida
  payment_rate: number;  // tasa usada en la partida de pago
}

/**
 * Hook para el flujo de Diferencial Cambiario REALIZADO.
 * - Lista facturas en moneda extranjera con saldo abierto
 * - Sugiere liquidaciones a partir de una partida de pago/cobro
 * - Calcula el delta y registra la liquidación + partida DIFC-R
 */
export function useFxSettlement() {
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);

  /**
   * Lista facturas con saldo abierto en moneda extranjera para una empresa.
   * Filtra por contraparte (NIT) si se provee, para sugerir liquidaciones.
   */
  const listOpenBalances = useCallback(async (params: {
    enterpriseId: number;
    counterpartNit?: string | null;
    currencyCode?: string;
  }): Promise<FxOpenBalance[]> => {
    setLoading(true);
    try {
      let q = supabase
        .from("tab_fx_open_balances")
        .select("*")
        .eq("enterprise_id", params.enterpriseId)
        .eq("fully_settled", false)
        .order("invoice_date", { ascending: true });

      if (params.currencyCode) q = q.eq("currency_code", params.currencyCode);

      const { data, error } = await q;
      if (error) throw error;
      const rows = (data || []) as FxOpenBalance[];

      // Enriquecer con número de factura y contraparte
      const purchaseIds = rows.filter(r => r.invoice_type === "purchase").map(r => r.invoice_id);
      const salesIds = rows.filter(r => r.invoice_type === "sales").map(r => r.invoice_id);

      const [purchasesRes, salesRes] = await Promise.all([
        purchaseIds.length
          ? supabase.from("tab_purchase_ledger")
              .select("id, invoice_number, supplier_nit, supplier_name")
              .in("id", purchaseIds)
          : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
        salesIds.length
          ? supabase.from("tab_sales_ledger")
              .select("id, invoice_series, invoice_number, customer_nit, customer_name")
              .in("id", salesIds)
          : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
      ]);

      type PurchaseRow = { id: number; invoice_number?: string; supplier_nit?: string; supplier_name?: string };
      type SalesRow = { id: number; invoice_series?: string; invoice_number?: string; customer_nit?: string; customer_name?: string };
      const purchaseMap = new Map(((purchasesRes.data || []) as PurchaseRow[]).map((p) => [p.id, p]));
      const salesMap = new Map(((salesRes.data || []) as SalesRow[]).map((s) => [s.id, s]));

      const enriched = rows.map(r => {
        if (r.invoice_type === "purchase") {
          const p = purchaseMap.get(r.invoice_id);
          return {
            ...r,
            invoice_number: p?.invoice_number,
            counterpart_name: p?.supplier_name,
            counterpart_nit: p?.supplier_nit,
          } as FxOpenBalance & { counterpart_nit?: string };
        }
        const s = salesMap.get(r.invoice_id);
        return {
          ...r,
          invoice_number: [s?.invoice_series, s?.invoice_number].filter(Boolean).join("-"),
          counterpart_name: s?.customer_name,
          counterpart_nit: s?.customer_nit,
        } as FxOpenBalance & { counterpart_nit?: string };
      });

      // Filtro por contraparte (si llega)
      const filtered = params.counterpartNit
        ? enriched.filter((r) => r.counterpart_nit === params.counterpartNit)
        : enriched;

      return filtered;
    } catch (e: unknown) {
      toast.error("Error cargando facturas con saldo abierto: " + (e instanceof Error ? e.message : String(e)));
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  /** Vista previa del cálculo (no muta nada). */
  const previewSettlement = useCallback(async (params: {
    openBalanceId: number;
    paidOriginal: number;
    paymentRate: number;
    paymentDate: string;
  }): Promise<FxSettlementCalc | null> => {
    try {
      const { data, error } = await supabase.rpc("calculate_fx_settlement", {
        p_open_balance_id: params.openBalanceId,
        p_paid_original: params.paidOriginal,
        p_payment_rate: params.paymentRate,
        p_payment_date: params.paymentDate,
      });
      if (error) throw error;
      const row = (data || [])[0];
      if (!row) return null;
      return {
        open_balance_id: Number(row.open_balance_id),
        invoice_type: row.invoice_type,
        invoice_id: Number(row.invoice_id),
        currency_code: row.currency_code,
        registered_rate: Number(row.registered_rate),
        payment_rate: Number(row.payment_rate),
        paid_original: Number(row.paid_original),
        fx_difference: Number(row.fx_difference),
        is_gain: Boolean(row.is_gain),
        remaining_open: Number(row.remaining_open),
        fully_settled: Boolean(row.fully_settled),
      };
    } catch (e: unknown) {
      toast.error("Error calculando diferencial: " + (e instanceof Error ? e.message : String(e)));
      return null;
    }
  }, []);

  /**
   * Genera la partida DIFC-R con el efecto neto y registra los settlements.
   * - paymentJournalId: la partida original que disparó el pago/cobro.
   * - selections: una o más facturas a liquidar (parcial o total).
   */
  const postRealizedDifferential = useCallback(async (params: {
    enterpriseId: number;
    paymentJournalId: number;
    paymentDate: string;
    baseCurrency: string;
    selections: Array<{
      openBalanceId: number;
      calc: FxSettlementCalc;
      counterpartLabel?: string;
    }>;
  }): Promise<number | null> => {
    if (!params.selections.length) {
      toast.info("Selecciona al menos una factura para liquidar.");
      return null;
    }

    setPosting(true);
    try {
      // Configuración de cuentas FX REALIZADAS
      const { data: cfg, error: cfgErr } = await supabase
        .from("tab_enterprise_config")
        .select("realized_fx_gain_account_id, realized_fx_loss_account_id")
        .eq("enterprise_id", params.enterpriseId)
        .maybeSingle();
      if (cfgErr) throw cfgErr;
      if (!cfg?.realized_fx_gain_account_id || !cfg?.realized_fx_loss_account_id) {
        toast.error("Configura las cuentas de diferencial cambiario REALIZADO en Configuración → Cuentas Especiales.");
        return null;
      }

      // Contraparte (clientes/proveedores) por tipo de factura
      const { data: cfg2 } = await supabase
        .from("tab_enterprise_config")
        .select("customers_account_id, suppliers_account_id")
        .eq("enterprise_id", params.enterpriseId)
        .maybeSingle();

      // Suma neta del diferencial
      let totalGain = 0;
      let totalLoss = 0;
      for (const s of params.selections) {
        if (s.calc.is_gain) totalGain += s.calc.fx_difference;
        else totalLoss += s.calc.fx_difference;
      }
      const net = totalGain - totalLoss;
      if (Math.abs(net) < 0.005) {
        toast.info("Las liquidaciones no producen diferencial cambiario (delta = 0).");
        // Igual registramos los settlements para consumir saldo abierto
      }

      // Período contable
      const { data: period } = await supabase
        .from("tab_accounting_periods")
        .select("id, status")
        .eq("enterprise_id", params.enterpriseId)
        .lte("start_date", params.paymentDate)
        .gte("end_date", params.paymentDate)
        .maybeSingle();
      if (!period) {
        toast.error("No hay un período contable que contenga la fecha de pago.");
        return null;
      }
      if (period.status === "cerrado") {
        toast.error("El período está cerrado. Reabre el período para registrar el diferencial.");
        return null;
      }

      const d = new Date(params.paymentDate);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;

      let difcEntryId: number | null = null;

      // Crear partida DIFC-R solo si hay diferencial real
      if (Math.abs(net) >= 0.005) {
        const prefix = "DIFC-R";
        const { data: counter } = await supabase
          .from("journal_entry_counters")
          .select("last_number")
          .eq("enterprise_id", params.enterpriseId)
          .eq("year", year).eq("month", month).eq("prefix", prefix)
          .maybeSingle();
        const nextNumber = (counter?.last_number || 0) + 1;
        const entryNumber = `${prefix}-${year}-${String(month).padStart(2, "0")}-${String(nextNumber).padStart(4, "0")}`;

        const { data: entry, error: entryErr } = await supabase
          .from("tab_journal_entries")
          .insert([{
            enterprise_id: params.enterpriseId,
            accounting_period_id: period.id,
            entry_number: entryNumber,
            entry_date: params.paymentDate,
            entry_type: "ajuste",
            description: `Diferencial cambiario realizado por liquidación de facturas ME`,
            status: "borrador",
            currency_code: params.baseCurrency,
            exchange_rate: 1,
            total_debit: 0,
            total_credit: 0,
          }])
          .select("id")
          .single();
        if (entryErr) throw entryErr;
        difcEntryId = entry.id as number;

        const lines: Array<{ journal_entry_id: number; line_number: number; account_id: number; debit_amount: number; credit_amount: number; description: string }> = [];
        let lineNo = 0;

        // Una línea por factura tocando la cuenta de contraparte (clientes o proveedores)
        for (const s of params.selections) {
          const isPurchase = s.calc.invoice_type === "purchase";
          const counterpartAcc = isPurchase
            ? cfg2?.suppliers_account_id
            : cfg2?.customers_account_id;
          if (!counterpartAcc) {
            toast.error(`Configura la cuenta de ${isPurchase ? "proveedores" : "clientes"} en Configuración → Cuentas Especiales.`);
            // rollback partida creada
            await supabase.from("tab_journal_entries").delete().eq("id", difcEntryId!);
            return null;
          }

          const amt = s.calc.fx_difference;
          const isGain = s.calc.is_gain;
          // En compras (proveedor): si es ganancia (la deuda en MN bajó), DB Proveedores / CR Ganancia FX
          // En ventas (cliente):    si es ganancia (la cuenta x cobrar en MN subió), DB Clientes / CR Ganancia FX
          // Para pérdida se invierte.
          if (isGain) {
            lines.push({
              journal_entry_id: difcEntryId,
              line_number: ++lineNo,
              account_id: counterpartAcc,
              debit_amount: isPurchase ? amt : amt,
              credit_amount: 0,
              description: `Dif. cambiario realizado - ${s.counterpartLabel ?? ""}`,
            });
            lines.push({
              journal_entry_id: difcEntryId,
              line_number: ++lineNo,
              account_id: cfg.realized_fx_gain_account_id,
              debit_amount: 0,
              credit_amount: amt,
              description: `Ganancia cambiaria realizada`,
            });
          } else {
            lines.push({
              journal_entry_id: difcEntryId,
              line_number: ++lineNo,
              account_id: cfg.realized_fx_loss_account_id,
              debit_amount: amt,
              credit_amount: 0,
              description: `Pérdida cambiaria realizada - ${s.counterpartLabel ?? ""}`,
            });
            lines.push({
              journal_entry_id: difcEntryId,
              line_number: ++lineNo,
              account_id: counterpartAcc,
              debit_amount: 0,
              credit_amount: amt,
              description: `Dif. cambiario realizado`,
            });
          }
        }

        const { error: linesErr } = await supabase.from("tab_journal_entry_details").insert(lines);
        if (linesErr) throw linesErr;

        const totals = lines.reduce(
          (acc, l) => ({ d: acc.d + (l.debit_amount || 0), c: acc.c + (l.credit_amount || 0) }),
          { d: 0, c: 0 },
        );

        const { error: postErr } = await supabase
          .from("tab_journal_entries")
          .update({
            status: "contabilizada",
            is_posted: true,
            posted_at: new Date().toISOString(),
            total_debit: totals.d,
            total_credit: totals.c,
          })
          .eq("id", difcEntryId);
        if (postErr) throw postErr;

        await supabase.from("journal_entry_counters").upsert({
          enterprise_id: params.enterpriseId,
          year, month, prefix,
          last_number: nextNumber,
        }, { onConflict: "enterprise_id,year,month,prefix" });
      }

      // Registrar cada settlement (consume saldo abierto)
      for (const s of params.selections) {
        const { error: regErr } = await supabase.rpc("register_fx_settlement", {
          p_open_balance_id: s.openBalanceId,
          p_payment_journal_id: params.paymentJournalId,
          p_paid_original: s.calc.paid_original,
          p_payment_rate: s.calc.payment_rate,
          p_payment_date: params.paymentDate,
          p_fx_difference: s.calc.is_gain ? s.calc.fx_difference : -s.calc.fx_difference,
          p_difc_journal_id: difcEntryId,
          p_notes: null,
        });
        if (regErr) throw regErr;
      }

      if (difcEntryId) {
        toast.success(`Diferencial cambiario realizado contabilizado. Neto: ${net >= 0 ? "+" : ""}${net.toFixed(2)} ${params.baseCurrency}`);
      } else {
        toast.success(`Liquidaciones registradas (sin diferencial cambiario).`);
      }
      return difcEntryId;
    } catch (e: unknown) {
      toast.error("Error registrando diferencial realizado: " + (e instanceof Error ? e.message : String(e)));
      return null;
    } finally {
      setPosting(false);
    }
  }, []);

  return {
    loading,
    posting,
    listOpenBalances,
    previewSettlement,
    postRealizedDifferential,
  };
}
