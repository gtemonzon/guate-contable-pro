import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { getPreviousCompletedMonth, QUARTER_MONTH_RANGES } from "@/constants/dashboardCards";
import { fetchAllRecords } from "@/utils/supabaseHelpers";
import { fetchSuggestedVatCredit } from "@/utils/vatCreditCarryover";
import {
  parseIvaGeneralResult, parseIvaPequenoResult, parseIsrMensualResult, parseIsrTrimestralResult,
} from "@/utils/declarationCalculations";
import {
  lastCompletedQuarter, findPresentedIsrTrimestralForm, buildIsrTrimestralSummary,
  type IsrTrimestralSummary,
} from "@/utils/dashboardIsrTrimestral";
import { calculateDueDate, type TaxDueDateConfig } from "@/utils/dueDateCalculations";
import { fetchEnterpriseHolidayDates } from "@/utils/enterpriseHolidays";
import { buildIsrMensualSummary, estimateIsrMensual, isrMensualIngresos } from "@/utils/dashboardIsrMensualSummary";
import { resolveTaxRegimeAsOf, ivaFormTypeForRegime, regimeAsOfDateForMonth } from "@/utils/taxRegime";
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
  /** Ingresos netos (del cálculo guardado o de libros: todas las ventas, como el generador). */
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

/**
 * ISR Trimestral pendiente: el último trimestre terminado, con el cálculo guardado del
 * Generador (acumulado enero → fin del trimestre, menos el ISR ya pagado) o el
 * formulario ya presentado. No es una proyección.
 */
export interface ISRTrimestralData extends IsrTrimestralSummary {
  /** Trimestre (1 a 4) y año del trimestre pendiente. */
  quarter: number;
  year: number;
  /** "Jul - Sep" (QUARTER_MONTH_RANGES). */
  quarterLabel: string;
  /** Mes de inicio del trimestre (1, 4, 7, 10). */
  quarterStartMonth: number;
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

      // El régimen vigente en el mes de referencia (historial de régimen) decide el tipo de
      // IVA: una empresa puede tener activos IVA_GENERAL e IVA_PEQUENO en la configuración
      // y haber cambiado de régimen a mitad de año. Sin régimen conocido (o exenta_ong),
      // se decide como antes con la configuración y los vencimientos.
      const { regime: regimeAsOfMonth } = await resolveTaxRegimeAsOf(
        enterpriseId,
        regimeAsOfDateForMonth(refYear, refMonth),
      );
      const regimeIvaType = ivaFormTypeForRegime(regimeAsOfMonth);
      if (regimeIvaType) {
        hasIvaGeneral = regimeIvaType === 'IVA_GENERAL';
        hasIvaPequeno = regimeIvaType === 'IVA_PEQUENO';
      } else if (!hasIvaGeneral && !hasIvaPequeno) {
        // Fallback: inferir el régimen IVA si no hay config explícita
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
        // Ingresos con la definición del generador: TODAS las ventas (incluidos los
        // documentos exentos de IVA, como FPEQ), con el signo de cada documento. Sirven
        // para la estimación y para saber si el cálculo guardado sigue vigente.
        const liveComparable = isrMensualIngresos(salesData, getSign);
        const savedRow = await fetchSavedCalc('ISR_MENSUAL');
        const saved = savedRow
          ? { id: savedRow.id, createdAt: savedRow.created_at, ...parseIsrMensualResult(savedRow.result) }
          : null;
        const summary = buildIsrMensualSummary({
          estimate: estimateIsrMensual(liveComparable),
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

      // ISR Trimestral: el trimestre pendiente de declarar (último terminado), con el
      // cálculo guardado del generador o el formulario ya presentado.
      let isrTrimestralData: ISRTrimestralData | null = null;
      if (hasIsrTrimestral) {
        const today = new Date();
        const q = lastCompletedQuarter(today);

        const [savedRes, formsRes, dueCfgRes] = await Promise.all([
          supabase
            .from("tab_declaration_calculations")
            .select("id, created_at, result")
            .eq("enterprise_id", enterpriseId)
            .eq("form_type", "ISR_TRIMESTRAL")
            .eq("period_year", q.year)
            // period_month guarda el mes ELEGIDO dentro del trimestre.
            .gte("period_month", q.startMonth)
            .lte("period_month", q.endMonth)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("tab_tax_forms")
            .select("tax_type, period_type, period_month, period_year, form_number, amount_paid, payment_date, is_active")
            .eq("enterprise_id", enterpriseId)
            .eq("period_year", q.year)
            .eq("is_active", true),
          supabase
            .from("tab_tax_due_date_config")
            .select("*")
            .eq("enterprise_id", enterpriseId)
            .eq("tax_type", "isr_trimestral")
            .eq("is_active", true)
            .limit(1)
            .maybeSingle(),
        ]);
        if (savedRes.error) console.error("Error cargando cálculo guardado (ISR_TRIMESTRAL):", savedRes.error);

        const saved = savedRes.data
          ? { id: savedRes.data.id, createdAt: savedRes.data.created_at, ...parseIsrTrimestralResult(savedRes.data.result) }
          : null;
        const presentedForm = findPresentedIsrTrimestralForm(formsRes.data || [], q.year, q.startMonth);

        // Vencimiento: solo con configuración activa de 'isr_trimestral'.
        let dueDate: Date | null = null;
        const cfg = dueCfgRes.data;
        if (cfg) {
          const dueConfig: TaxDueDateConfig = {
            tax_type: cfg.tax_type,
            tax_label: cfg.tax_label,
            calculation_type: cfg.calculation_type as TaxDueDateConfig["calculation_type"],
            days_value: cfg.days_value || 0,
            reference_period: cfg.reference_period as TaxDueDateConfig["reference_period"],
            consider_holidays: cfg.consider_holidays ?? true,
            is_active: true,
          };
          const holidays = await fetchEnterpriseHolidayDates(enterpriseId, today);
          dueDate = calculateDueDate(new Date(q.year, q.startMonth - 1, 1), dueConfig, holidays);
        }

        const rate = taxConfigs.find(c => c.tax_form_type === 'ISR_TRIMESTRAL')?.tax_rate ?? 25;
        const summary = buildIsrTrimestralSummary({ quarter: q, saved, presentedForm, dueDate, today, rate });
        isrTrimestralData = {
          ...summary,
          quarter: q.quarter,
          year: q.year,
          quarterLabel: QUARTER_MONTH_RANGES[q.quarter],
          quarterStartMonth: q.startMonth,
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

      // ISR trimestral: solo el trimestre pendiente con cálculo guardado (no proyecciones).
      if (isrTrimestralData && isrTrimestralData.state === 'pending' && isrTrimestralData.hasSaved) {
        taxSummary.push({
          label: `ISR T${isrTrimestralData.quarter} ${isrTrimestralData.year}`,
          amount: isrTrimestralData.isrAPagar,
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
