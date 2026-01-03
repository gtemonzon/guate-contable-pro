import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRecords } from "@/utils/supabaseHelpers";

export type TaxFormType = 'IVA_PEQUENO' | 'IVA_GENERAL' | 'ISR_MENSUAL' | 'ISR_TRIMESTRAL';

export interface TaxConfig {
  id: number;
  tax_form_type: TaxFormType;
  tax_rate: number;
  is_active: boolean;
}

export interface SaleRecord {
  id: number;
  invoice_date: string;
  net_amount: number;
  vat_amount: number;
  total_amount: number;
  fel_document_type: string;
  operation_type_id: number | null;
  is_annulled: boolean;
}

export interface PurchaseRecord {
  id: number;
  invoice_date: string;
  net_amount: number;
  vat_amount: number;
  total_amount: number;
  base_amount: number;
  fel_document_type: string;
  operation_type_id: number | null;
  supplier_nit: string;
  supplier_name: string;
  invoice_series: string | null;
  invoice_number: string;
}

export interface FelDocType {
  code: string;
  name: string;
  applies_vat: boolean;
  affects_total: number;
}

export interface IVAGeneralCalculo {
  ventasGravadasLocales: number; // Casilla 14
  exportaciones: number; // Casilla 15
  ventasExentas: number; // Casilla 17
  totalVentas: number; // Casilla 19
  debitoFiscal: number; // Casilla 26
  comprasGravadas: number; // Casilla 30
  creditoFiscal: number; // Casilla 34
  creditoRemanente: number; // Casilla 38 (del mes anterior, user input)
  diferencia: number; // Casilla 40 (débito - crédito)
  ivaAPagar: number; // Casilla 42
}

export interface IVAPequenoCalculo {
  totalIngresos: number; // Casilla 21
  tasaImpuesto: number; // Casilla 23 (ej: 5%)
  impuestoAPagar: number; // Casilla 24
}

export interface ISRMensualCalculo {
  ingresosBrutos: number;
  tasaISR: number;
  isrAPagar: number;
}

export function useDeclaracionCalculo(
  enterpriseId: number | null, 
  month: number, 
  year: number,
  creditoRemanenteInput: number = 0
) {
  const [loading, setLoading] = useState(false);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [felDocTypes, setFelDocTypes] = useState<FelDocType[]>([]);
  const [taxConfigs, setTaxConfigs] = useState<TaxConfig[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creditoRemanenteSugerido, setCreditoRemanenteSugerido] = useState<number>(0);

  // Fetch FEL document types
  useEffect(() => {
    const fetchDocTypes = async () => {
      const { data } = await supabase
        .from("tab_fel_document_types")
        .select("code, name, applies_vat, affects_total")
        .eq("is_active", true);
      if (data) setFelDocTypes(data);
    };
    fetchDocTypes();
  }, []);

  // Fetch tax configs for enterprise
  useEffect(() => {
    if (!enterpriseId) return;
    const fetchConfigs = async () => {
      const { data } = await supabase
        .from("tab_enterprise_tax_config")
        .select("*")
        .eq("enterprise_id", enterpriseId)
        .eq("is_active", true);
      if (data) setTaxConfigs(data as TaxConfig[]);
    };
    fetchConfigs();
  }, [enterpriseId]);

  // Fetch sales and purchases for the month
  const fetchData = async () => {
    if (!enterpriseId || !month || !year) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];

      // Fetch sales
      const salesQuery = supabase
        .from("tab_sales_ledger")
        .select("id, invoice_date, net_amount, vat_amount, total_amount, fel_document_type, operation_type_id, is_annulled")
        .eq("enterprise_id", enterpriseId)
        .gte("invoice_date", startDate)
        .lte("invoice_date", endDate)
        .eq("is_annulled", false);
      
      const salesData = await fetchAllRecords<SaleRecord>(salesQuery);
      setSales(salesData);

      // Fetch purchases
      const purchasesQuery = supabase
        .from("tab_purchase_ledger")
        .select("id, invoice_date, net_amount, vat_amount, total_amount, base_amount, fel_document_type, operation_type_id, supplier_nit, supplier_name, invoice_series, invoice_number")
        .eq("enterprise_id", enterpriseId)
        .gte("invoice_date", startDate)
        .lte("invoice_date", endDate);
      
      const purchasesData = await fetchAllRecords<PurchaseRecord>(purchasesQuery);
      setPurchases(purchasesData);

      // Calculate suggested crédito remanente from previous month
      await calcularCreditoRemanenteSugerido();

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Calculate suggested crédito remanente based on previous month's data
  const calcularCreditoRemanenteSugerido = async () => {
    if (!enterpriseId) return;

    // Calculate previous month
    let prevMonth = month - 1;
    let prevYear = year;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear = year - 1;
    }

    const prevStartDate = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
    const prevEndDate = new Date(prevYear, prevMonth, 0).toISOString().split('T')[0];

    try {
      // Fetch previous month sales
      const prevSalesQuery = supabase
        .from("tab_sales_ledger")
        .select("vat_amount, fel_document_type, is_annulled")
        .eq("enterprise_id", enterpriseId)
        .gte("invoice_date", prevStartDate)
        .lte("invoice_date", prevEndDate)
        .eq("is_annulled", false);
      
      const prevSalesData = await fetchAllRecords<{ vat_amount: number; fel_document_type: string; is_annulled: boolean }>(prevSalesQuery);

      // Fetch previous month purchases
      const prevPurchasesQuery = supabase
        .from("tab_purchase_ledger")
        .select("vat_amount, fel_document_type")
        .eq("enterprise_id", enterpriseId)
        .gte("invoice_date", prevStartDate)
        .lte("invoice_date", prevEndDate);
      
      const prevPurchasesData = await fetchAllRecords<{ vat_amount: number; fel_document_type: string }>(prevPurchasesQuery);

      const exentosTypes = ['FPEQ', 'FESP', 'NABN', 'RDON', 'RECI'];

      // Calculate previous month's débito fiscal
      let prevDebitoFiscal = 0;
      prevSalesData.forEach(sale => {
        const docType = felDocTypes.find(d => d.code === sale.fel_document_type);
        const multiplier = docType?.affects_total ?? 1;
        if (!exentosTypes.includes(sale.fel_document_type)) {
          prevDebitoFiscal += sale.vat_amount * multiplier;
        }
      });

      // Calculate previous month's crédito fiscal
      let prevCreditoFiscal = 0;
      prevPurchasesData.forEach(purchase => {
        const docType = felDocTypes.find(d => d.code === (purchase.fel_document_type || 'FACT'));
        const multiplier = docType?.affects_total ?? 1;
        if (!exentosTypes.includes(purchase.fel_document_type || '')) {
          prevCreditoFiscal += purchase.vat_amount * multiplier;
        }
      });

      // If crédito > débito in previous month, the difference is the suggested remanente
      const diferenciaPrev = prevDebitoFiscal - prevCreditoFiscal;
      if (diferenciaPrev < 0) {
        setCreditoRemanenteSugerido(Math.abs(diferenciaPrev));
      } else {
        setCreditoRemanenteSugerido(0);
      }

    } catch (err) {
      console.error("Error calculating suggested crédito remanente:", err);
      setCreditoRemanenteSugerido(0);
    }
  };

  // Get affects_total multiplier for a document type
  const getMultiplier = (docType: string): number => {
    const found = felDocTypes.find(d => d.code === docType);
    return found?.affects_total ?? 1;
  };

  // Calculate IVA General (SAT-2237)
  const ivaGeneralCalculo = useMemo((): IVAGeneralCalculo => {
    // Tipos exentos de IVA
    const exentosTypes = ['FPEQ', 'FESP', 'NABN', 'RDON', 'RECI'];
    
    let ventasGravadasLocales = 0;
    let exportaciones = 0;
    let ventasExentas = 0;
    let debitoFiscal = 0;

    sales.forEach(sale => {
      const multiplier = getMultiplier(sale.fel_document_type);
      const netWithSign = sale.net_amount * multiplier;
      const vatWithSign = sale.vat_amount * multiplier;

      if (exentosTypes.includes(sale.fel_document_type)) {
        ventasExentas += sale.total_amount * multiplier;
      } else {
        // TODO: Detect exportaciones by operation_type when available
        ventasGravadasLocales += netWithSign;
        debitoFiscal += vatWithSign;
      }
    });

    let comprasGravadas = 0;
    let creditoFiscal = 0;

    purchases.forEach(purchase => {
      const multiplier = getMultiplier(purchase.fel_document_type || 'FACT');
      if (!exentosTypes.includes(purchase.fel_document_type || '')) {
        comprasGravadas += (purchase.base_amount || purchase.net_amount) * multiplier;
        creditoFiscal += purchase.vat_amount * multiplier;
      }
    });

    const totalVentas = ventasGravadasLocales + exportaciones + ventasExentas;
    const diferencia = debitoFiscal - creditoFiscal;
    // IVA a pagar considers the crédito remanente from previous month
    const ivaAPagar = Math.max(0, diferencia - creditoRemanenteInput);

    return {
      ventasGravadasLocales,
      exportaciones,
      ventasExentas,
      totalVentas,
      debitoFiscal,
      comprasGravadas,
      creditoFiscal,
      creditoRemanente: creditoRemanenteInput,
      diferencia,
      ivaAPagar,
    };
  }, [sales, purchases, felDocTypes, creditoRemanenteInput]);

  // Calculate IVA Pequeño Contribuyente (SAT-2046)
  const ivaPequenoCalculo = useMemo((): IVAPequenoCalculo => {
    const config = taxConfigs.find(c => c.tax_form_type === 'IVA_PEQUENO');
    const tasaImpuesto = config?.tax_rate ?? 5; // Default 5%

    let totalIngresos = 0;
    sales.forEach(sale => {
      const multiplier = getMultiplier(sale.fel_document_type);
      totalIngresos += sale.total_amount * multiplier;
    });

    const impuestoAPagar = totalIngresos * (tasaImpuesto / 100);

    return {
      totalIngresos,
      tasaImpuesto,
      impuestoAPagar,
    };
  }, [sales, taxConfigs, felDocTypes]);

  // Calculate ISR Mensual
  const isrMensualCalculo = useMemo((): ISRMensualCalculo => {
    const config = taxConfigs.find(c => c.tax_form_type === 'ISR_MENSUAL');
    const tasaISR = config?.tax_rate ?? 5; // Default 5%

    let ingresosBrutos = 0;
    sales.forEach(sale => {
      const multiplier = getMultiplier(sale.fel_document_type);
      ingresosBrutos += sale.total_amount * multiplier;
    });

    const isrAPagar = ingresosBrutos * (tasaISR / 100);

    return {
      ingresosBrutos,
      tasaISR,
      isrAPagar,
    };
  }, [sales, taxConfigs, felDocTypes]);

  return {
    loading,
    error,
    sales,
    purchases,
    taxConfigs,
    ivaGeneralCalculo,
    ivaPequenoCalculo,
    isrMensualCalculo,
    creditoRemanenteSugerido,
    fetchData,
  };
}
