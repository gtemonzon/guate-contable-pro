import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { getPreviousCompletedMonth, QUARTER_MONTH_RANGES } from "@/constants/dashboardCards";
import { fetchAllRecords } from "@/utils/supabaseHelpers";
import { fetchSuggestedVatCredit } from "@/utils/vatCreditCarryover";
import { parseIvaGeneralResult, parseIvaPequenoResult, parseIsrMensualResult } from "@/utils/declarationCalculations";
import { buildIsrMensualSummary } from "@/utils/dashboardIsrMensualSummary";
import { buildIvaGeneralSummary, buildIvaPequenoSummary } from "@/utils/dashboardIvaSummary";

export interface TaxConfig {
  id: number;
  tax_form_type: string;
  tax_rate: number;
  is_active: boolean;
}

export interface IVAData {
  regime: 'general' | 'pequeno' | null;
  /** IVA débito/crédito del mes según libros (en vivo). */
  salesVat: number;
  purchasesVat: number;
  /** General: impuesto por pagar (> 0) o crédito para el mes siguiente (< 0). */
  ivaBalance: number;
  /** Ingresos del mes según libros (en vivo). */
  totalIngresos: number;
  impuestoPequeno: number;
  salesCount: number;
  purchasesCount: number;
  /** 'saved' = último cálculo guardado del Generador; 'estimate' = libros + remanente contable. */
  source: 'saved' | 'estimate';
  /** Débito, crédito e ingresos que se muestran (del cálculo guardado o de libros). */
  debit: number;
  credit: number;
  ingresos: number;
  carryoverIn: number;
  exemption: number;
  ivaToPay: number;
  carryoverOut: number;
  savedAt: string | null;
  savedCalcId: number | null;
  /** Los libros cambiaron desde el cálculo guardado. */
  stale: boolean;
  /** Pequeño contribuyente: tasa y retención. */
  rate: number;
  retention: number;
}

export interface ISRMensualData {
  /** Ingresos netos (del cálculo guardado o de libros sin documentos exentos). */
  ingresosBrutos: number;
  /** IMPUESTO del primer tramo (5% hasta Q30,000), no la base. */
  primerTramo: number;
  /** IMPUESTO del segundo tramo (7% del excedente), no la base. */
  segundoTramo: number;
  /** ISR A PAGAR: del cálculo guardado (ya con retención) o, sin cálculo, el estimado con libros. */
  isrCalculado: number;
  salesCount: number;
  /** 'saved' = último cálculo guardado del Generador; 'estimate' = libros. */
  source: 'saved' | 'estimate';
  /** ISR antes de retenciones. */
  isrBruto: number;
  /** Retención ISR realizada (solo con cálculo guardado). */
  retention: number;
  savedAt: string | null;
  savedCalcId: number | null;
  /** Los libros cambiaron desde el cálculo guardado. */
  stale: boolean;
}

export interface ISRTrimestralData {
  currentQuarter: number;
  quarterLabel: string;
  completedMonths: number;
  actualSales: number;
  actualCosts: number;
  projectedSales: number;
  projectedCosts: number;
  projectedProfit: number;
  isrEstimado: number;
  usesCoefficient: boolean;
}

export interface TaxSummaryItem {
  label: string;
  amount: number;
  period: string;
}

export function useDashboardTaxData(enterpriseId: number | null) {
  const { month: refMonth, year: refYear, monthName } = getPreviousCompletedMonth();

  const query = useQuery({
    queryKey: ["dashboard-tax-data", enterpriseId],
    queryFn: async () => {
      if (!enterpriseId) return null;

      // Fetch tax configs from multiple sources to detect IVA regime reliably:
      // 1) tab_enterprise_tax_config (legacy explicit config)
      // 2) tab_tax_due_date_config (vencimientos configurados desde la empresa)
      // 3) tab_enterprises.tax_regime (régimen general / pequeño contribuyente)
      const [taxConfigsRes, dueDateConfigsRes, enterpriseRes] = await Promise.all([
        supabase
          .from("tab_enterprise_tax_config")
          .select("id, tax_form_type, tax_rate, is_active")
          .eq("enterprise_id", enterpriseId)
          .eq("is_active", true),
        supabase
          .from("tab_tax_due_date_config")
          .select("tax_type, is_active")
          .eq("enterprise_id", enterpriseId)
          .eq("is_active", true),
        supabase
          .from("tab_enterprises")
          .select("tax_regime")
          .eq("id", enterpriseId)
          .maybeSingle(),
      ]);

      const taxConfigs = (taxConfigsRes.data || []) as TaxConfig[];
      const dueDateConfigs = (dueDateConfigsRes.data || []) as Array<{ tax_type: string }>;
      const enterpriseRegime = (enterpriseRes.data?.tax_regime || '').toLowerCase();

      let hasIvaGeneral = taxConfigs.some(c => c.tax_form_type === 'IVA_GENERAL');
      let hasIvaPequeno = taxConfigs.some(c => c.tax_form_type === 'IVA_PEQUENO');
      const hasIsrMensual = taxConfigs.some(c => c.tax_form_type === 'ISR_MENSUAL');
      const hasIsrTrimestral = taxConfigs.some(c => c.tax_form_type === 'ISR_TRIMESTRAL');

      // Fallback: inferir el régimen IVA si no hay config explícita
      if (!hasIvaGeneral && !hasIvaPequeno) {
        const hasIvaDueDate = dueDateConfigs.some(c =>
          c.tax_type === 'iva_mensual' || c.tax_type === 'iva'
        );
        if (hasIvaDueDate) {
          if (enterpriseRegime.includes('pequeñ') || enterpriseRegime.includes('pequen')) {
            hasIvaPequeno = true;
          } else {
            hasIvaGeneral = true;
          }
        }
      }

      // Previous month date range
      const startDate = `${refYear}-${String(refMonth).padStart(2, '0')}-01`;
      const endDate = new Date(refYear, refMonth, 0).toISOString().split('T')[0];

      // Fetch sales, purchases AND FEL document types (for sign multipliers like NCRE = -1)
      const [salesRes, purchasesRes, felTypesRes] = await Promise.all([
        supabase
          .from("tab_sales_ledger")
          .select("vat_amount, net_amount, total_amount, fel_document_type")
          .eq("enterprise_id", enterpriseId)
          .eq("is_annulled", false)
          .is("deleted_at", null)
          .gte("invoice_date", startDate)
          .lte("invoice_date", endDate),
        supabase
          .from("tab_purchase_ledger")
          .select("vat_amount, net_amount, total_amount, fel_document_type")
          .eq("enterprise_id", enterpriseId)
          .is("deleted_at", null)
          .gte("invoice_date", startDate)
          .lte("invoice_date", endDate),
        supabase
          .from("tab_fel_document_types")
          .select("code, affects_total")
          .eq("is_active", true),
      ]);

      const salesData = salesRes.data || [];
      const purchasesData = purchasesRes.data || [];
      const felTypes = (felTypesRes.data || []) as Array<{ code: string; affects_total: number }>;
      const getSign = (code: string | null | undefined): number => {
        const found = felTypes.find((t) => t.code === code);
        return found?.affects_total ?? 1;
      };
      // Tipos exentos de IVA (alineado con generador de declaración)
      const EXEMPT_DOC_TYPES = new Set(['FPEQ', 'FESP', 'NABN', 'RDON', 'RECI']);

      // Apply document sign multipliers (e.g. NCRE = -1) so dashboard matches declaration
      const salesVat = salesData.reduce((s, r) => {
        if (EXEMPT_DOC_TYPES.has(r.fel_document_type)) return s;
        return s + Number(r.vat_amount || 0) * getSign(r.fel_document_type);
      }, 0);
      const purchasesVat = purchasesData.reduce((s, r) => {
        if (EXEMPT_DOC_TYPES.has(r.fel_document_type)) return s;
        return s + Number(r.vat_amount || 0) * getSign(r.fel_document_type);
      }, 0);
      const totalIngresos = salesData.reduce(
        (s, r) => s + Number(r.total_amount || 0) * getSign(r.fel_document_type),
        0,
      );
      const ingresosBrutosNet = salesData.reduce((s, r) => {
        if (EXEMPT_DOC_TYPES.has(r.fel_document_type)) return s;
        return s + Number(r.net_amount || 0) * getSign(r.fel_document_type);
      }, 0);


      // Último cálculo guardado del Generador de Declaraciones para el mes de referencia:
      // si existe, manda (incluye remanente y ajustes manuales).
      const fetchSavedCalc = async (formType: 'IVA_GENERAL' | 'IVA_PEQUENO' | 'ISR_MENSUAL') => {
        const { data, error } = await supabase
          .from("tab_declaration_calculations")
          .select("id, created_at, result")
          .eq("enterprise_id", enterpriseId)
          .eq("form_type", formType)
          .eq("period_year", refYear)
          .eq("period_month", refMonth)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) console.error(`Error cargando cálculo guardado (${formType}):`, error);
        return data ?? null;
      };

      // IVA Data
      let ivaData: IVAData | null = null;
      if (hasIvaGeneral) {
        const savedRow = await fetchSavedCalc('IVA_GENERAL');
        const saved = savedRow
          ? { id: savedRow.id, createdAt: savedRow.created_at, ...parseIvaGeneralResult(savedRow.result) }
          : null;
        // Sin cálculo guardado: remanente contable sugerido (saldo de IVA por cobrar al cierre del mes anterior).
        const suggestedCarryover = saved ? 0 : await fetchSuggestedVatCredit(enterpriseId, refYear, refMonth);
        const summary = buildIvaGeneralSummary({ salesVat, purchasesVat, saved, suggestedCarryover });
        ivaData = {
          regime: 'general',
          salesVat, purchasesVat,
          ivaBalance: summary.ivaBalance,
          totalIngresos, impuestoPequeno: 0,
          salesCount: salesData.length,
          purchasesCount: purchasesData.length,
          source: summary.source,
          debit: summary.debit,
          credit: summary.credit,
          ingresos: totalIngresos,
          carryoverIn: summary.carryoverIn,
          exemption: summary.exemption,
          ivaToPay: summary.ivaToPay,
          carryoverOut: summary.carryoverOut,
          savedAt: summary.savedAt,
          savedCalcId: summary.savedCalcId,
          stale: summary.stale,
          rate: 0,
          retention: 0,
        };
      } else if (hasIvaPequeno) {
        const rate = taxConfigs.find(c => c.tax_form_type === 'IVA_PEQUENO')?.tax_rate ?? 5;
        const savedRow = await fetchSavedCalc('IVA_PEQUENO');
        const saved = savedRow
          ? { id: savedRow.id, createdAt: savedRow.created_at, ...parseIvaPequenoResult(savedRow.result) }
          : null;
        const summary = buildIvaPequenoSummary({ liveIngresos: totalIngresos, rate, saved });
        ivaData = {
          regime: 'pequeno',
          salesVat: 0, purchasesVat: 0, ivaBalance: 0,
          totalIngresos,
          impuestoPequeno: summary.tax,
          salesCount: salesData.length,
          purchasesCount: 0,
          source: summary.source,
          debit: 0,
          credit: 0,
          ingresos: summary.ingresos,
          carryoverIn: 0,
          exemption: 0,
          ivaToPay: summary.tax,
          carryoverOut: 0,
          savedAt: summary.savedAt,
          savedCalcId: summary.savedCalcId,
          stale: summary.stale,
          rate: summary.rate,
          retention: summary.retention,
        };
      }

      // ISR Mensual Data
      let isrMensualData: ISRMensualData | null = null;
      if (hasIsrMensual) {
        const UMBRAL = 30000;
        let primerTramo = 0, segundoTramo = 0, isrCalculado = 0;
        if (ingresosBrutosNet <= UMBRAL) {
          primerTramo = ingresosBrutosNet * 0.05;
          isrCalculado = primerTramo;
        } else {
          primerTramo = 1500; // 30000 * 0.05
          segundoTramo = (ingresosBrutosNet - UMBRAL) * 0.07;
          isrCalculado = primerTramo + segundoTramo;
        }
        // Ingresos con la definición del generador (todas las ventas, con el signo de
        // cada documento) para saber si el cálculo guardado sigue vigente.
        const liveComparable = salesData.reduce(
          (s, r) => s + Number(r.net_amount || 0) * getSign(r.fel_document_type),
          0,
        );
        const savedRow = await fetchSavedCalc('ISR_MENSUAL');
        const saved = savedRow
          ? { id: savedRow.id, createdAt: savedRow.created_at, ...parseIsrMensualResult(savedRow.result) }
          : null;
        const summary = buildIsrMensualSummary({
          estimate: { ingresosBrutos: ingresosBrutosNet, primerTramo, segundoTramo, isrCalculado },
          liveComparable,
          saved,
        });
        isrMensualData = {
          ingresosBrutos: summary.ingresos,
          primerTramo: summary.tax1,
          segundoTramo: summary.tax2,
          isrCalculado: summary.isrToPay,
          salesCount: salesData.length,
          source: summary.source,
          isrBruto: summary.isrBruto,
          retention: summary.retention,
          savedAt: summary.savedAt,
          savedCalcId: summary.savedCalcId,
          stale: summary.stale,
        };
      }

      // ISR Trimestral Projection
      let isrTrimestralData: ISRTrimestralData | null = null;
      if (hasIsrTrimestral) {
        const now = new Date();
        const currentMonthIdx = now.getMonth(); // 0-indexed
        const currentQuarter = Math.floor(currentMonthIdx / 3) + 1;
        const quarterStartMonthIdx = (currentQuarter - 1) * 3;
        const quarterLabel = QUARTER_MONTH_RANGES[currentQuarter];

        // Completed months in current quarter (months before current month)
        const completedMonths = currentMonthIdx - quarterStartMonthIdx;

        let actualSales = 0, actualCosts = 0;

        // Fetch data for each completed month in the quarter
        for (let i = 0; i < completedMonths; i++) {
          const mIdx = quarterStartMonthIdx + i;
          const mYear = now.getFullYear();
          const mStart = `${mYear}-${String(mIdx + 1).padStart(2, '0')}-01`;
          const mEnd = new Date(mYear, mIdx + 1, 0).toISOString().split('T')[0];

          const [sRes, pRes] = await Promise.all([
            supabase.from("tab_sales_ledger")
              .select("net_amount")
              .eq("enterprise_id", enterpriseId)
              .eq("is_annulled", false)
              .is("deleted_at", null)
              .gte("invoice_date", mStart).lte("invoice_date", mEnd),
            supabase.from("tab_purchase_ledger")
              .select("net_amount")
              .eq("enterprise_id", enterpriseId)
              .is("deleted_at", null)
              .gte("invoice_date", mStart).lte("invoice_date", mEnd),
          ]);

          actualSales += (sRes.data || []).reduce((s, r) => s + Number(r.net_amount || 0), 0);
          actualCosts += (pRes.data || []).reduce((s, r) => s + Number(r.net_amount || 0), 0);
        }

        const remainingMonths = 3 - completedMonths;
        let projectedSales = actualSales;
        let projectedCosts = actualCosts;

        if (completedMonths > 0) {
          const avgSales = actualSales / completedMonths;
          const avgCosts = actualCosts / completedMonths;
          projectedSales += avgSales * remainingMonths;
          projectedCosts += avgCosts * remainingMonths;
        }

        // Check for coefficient-based cost of sales
        let usesCoefficient = false;
        const { data: configData } = await supabase
          .from("tab_enterprise_config")
          .select("cost_of_sales_method")
          .eq("enterprise_id", enterpriseId)
          .maybeSingle();

        if (configData?.cost_of_sales_method === 'coeficiente') {
          const { data: closingData } = await supabase
            .from("tab_period_inventory_closing")
            .select("cost_of_sales_amount")
            .eq("enterprise_id", enterpriseId)
            .eq("status", "contabilizado")
            .order("calculated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (closingData?.cost_of_sales_amount && projectedSales > 0) {
            // Use ratio from last posted period
            const ratio = Number(closingData.cost_of_sales_amount) / projectedSales;
            projectedCosts = projectedSales * Math.min(ratio, 1);
            usesCoefficient = true;
          }
        }

        const projectedProfit = Math.max(0, projectedSales - projectedCosts);
        const isrRate = taxConfigs.find(c => c.tax_form_type === 'ISR_TRIMESTRAL')?.tax_rate ?? 25;
        const isrEstimado = projectedProfit * (isrRate / 100);

        isrTrimestralData = {
          currentQuarter, quarterLabel, completedMonths,
          actualSales, actualCosts,
          projectedSales, projectedCosts,
          projectedProfit, isrEstimado, usesCoefficient,
        };
      }

      // Build tax summary
      const taxSummary: TaxSummaryItem[] = [];
      const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

      if (ivaData) {
        if (ivaData.regime === 'general') {
          taxSummary.push({
            label: `IVA ${capitalize(monthName)} ${refYear}`,
            amount: ivaData.ivaBalance,
            period: `${monthName} ${refYear}`,
          });
        } else {
          taxSummary.push({
            label: `IVA Peq. Contrib. ${capitalize(monthName)} ${refYear}`,
            amount: ivaData.impuestoPequeno,
            period: `${monthName} ${refYear}`,
          });
        }
      }

      if (isrMensualData) {
        taxSummary.push({
          label: `ISR ${capitalize(monthName)} ${refYear}`,
          amount: isrMensualData.isrCalculado,
          period: `${monthName} ${refYear}`,
        });
      }

      if (isrTrimestralData) {
        taxSummary.push({
          label: `ISR Q${isrTrimestralData.currentQuarter} ${now.getFullYear()} (est.)`,
          amount: isrTrimestralData.isrEstimado,
          period: isrTrimestralData.quarterLabel,
        });
      }

      const totalTaxEstimate = taxSummary.reduce((s, t) => s + Math.max(0, t.amount), 0);

      return {
        taxConfigs,
        ivaData,
        isrMensualData,
        isrTrimestralData,
        taxSummary,
        totalTaxEstimate,
      };
    },
    enabled: !!enterpriseId,
    refetchInterval: 5 * 60 * 1000,
  });

  const now = new Date();

  return {
    loading: query.isLoading,
    taxConfigs: query.data?.taxConfigs || [],
    referenceMonth: refMonth,
    referenceYear: refYear,
    monthName,
    ivaData: query.data?.ivaData || null,
    isrMensualData: query.data?.isrMensualData || null,
    isrTrimestralData: query.data?.isrTrimestralData || null,
    taxSummary: query.data?.taxSummary || [],
    totalTaxEstimate: query.data?.totalTaxEstimate || 0,
  };
}
