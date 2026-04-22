import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { getPreviousCompletedMonth, QUARTER_MONTH_RANGES } from "@/constants/dashboardCards";
import { fetchAllRecords } from "@/utils/supabaseHelpers";

export interface TaxConfig {
  id: number;
  tax_form_type: string;
  tax_rate: number;
  is_active: boolean;
}

export interface IVAData {
  regime: 'general' | 'pequeno' | null;
  salesVat: number;
  purchasesVat: number;
  ivaBalance: number;
  totalIngresos: number;
  impuestoPequeno: number;
  salesCount: number;
  purchasesCount: number;
}

export interface ISRMensualData {
  ingresosBrutos: number;
  primerTramo: number;
  segundoTramo: number;
  isrCalculado: number;
  salesCount: number;
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

      // Fetch sales & purchases for previous month
      const [salesRes, purchasesRes] = await Promise.all([
        supabase
          .from("tab_sales_ledger")
          .select("vat_amount, net_amount, total_amount")
          .eq("enterprise_id", enterpriseId)
          .eq("is_annulled", false)
          .is("deleted_at", null)
          .gte("invoice_date", startDate)
          .lte("invoice_date", endDate),
        supabase
          .from("tab_purchase_ledger")
          .select("vat_amount, net_amount, total_amount")
          .eq("enterprise_id", enterpriseId)
          .is("deleted_at", null)
          .gte("invoice_date", startDate)
          .lte("invoice_date", endDate),
      ]);

      const salesData = salesRes.data || [];
      const purchasesData = purchasesRes.data || [];

      const salesVat = salesData.reduce((s, r) => s + Number(r.vat_amount || 0), 0);
      const purchasesVat = purchasesData.reduce((s, r) => s + Number(r.vat_amount || 0), 0);
      const totalIngresos = salesData.reduce((s, r) => s + Number(r.total_amount || 0), 0);
      const ingresosBrutosNet = salesData.reduce((s, r) => s + Number(r.net_amount || 0), 0);

      // IVA Data
      let ivaData: IVAData | null = null;
      if (hasIvaGeneral) {
        ivaData = {
          regime: 'general',
          salesVat, purchasesVat,
          ivaBalance: salesVat - purchasesVat,
          totalIngresos, impuestoPequeno: 0,
          salesCount: salesData.length,
          purchasesCount: purchasesData.length,
        };
      } else if (hasIvaPequeno) {
        const rate = taxConfigs.find(c => c.tax_form_type === 'IVA_PEQUENO')?.tax_rate ?? 5;
        ivaData = {
          regime: 'pequeno',
          salesVat: 0, purchasesVat: 0, ivaBalance: 0,
          totalIngresos,
          impuestoPequeno: totalIngresos * (rate / 100),
          salesCount: salesData.length,
          purchasesCount: 0,
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
        isrMensualData = {
          ingresosBrutos: ingresosBrutosNet,
          primerTramo, segundoTramo, isrCalculado,
          salesCount: salesData.length,
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
