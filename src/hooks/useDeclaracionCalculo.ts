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
  // Ventas
  ventasGravadasLocales: number; // Casilla 14
  exportaciones: number; // Casilla 15
  ventasExentas: number; // Casilla 17
  totalVentas: number; // Casilla 19
  debitoFiscal: number; // Casilla 26
  // Compras desglosadas por tipo de operación
  comprasBienes: number; // Casilla 27 - Otras compras / Bienes
  comprasServicios: number; // Casilla 28 - Servicios
  importaciones: number; // Casilla 29 - Importaciones
  comprasActivosFijos: number; // Casilla 30 - Activos fijos (si aplica)
  comprasExentas: number; // Casilla 32 - Compras exentas (FPEQ, FESP, etc.)
  totalComprasGravadas: number; // Total de compras gravadas (suma de casillas 27-30)
  notasCreditoCompras: number; // Notas de crédito recibidas (resta)
  comprasNetoGravadas: number; // Neto de compras gravadas
  // Crédito fiscal
  creditoFiscalBienes: number; // IVA de bienes
  creditoFiscalServicios: number; // IVA de servicios
  creditoFiscalImportaciones: number; // IVA de importaciones
  creditoFiscalActivosFijos: number; // IVA de activos fijos
  notasCreditoIVA: number; // IVA de notas de crédito (resta)
  creditoFiscal: number; // Casilla 34 - Total crédito fiscal del período
  creditoRemanente: number; // Casilla 38 (del mes anterior, user input)
  diferencia: number; // Casilla 40 (débito - crédito)
  ivaAPagar: number; // Casilla 42
  creditoRemanenteProximoMes: number; // Casilla 43 - when crédito > débito
  // Estadísticas adicionales
  documentosPorTipo: {
    tipo: string;
    cantidad: number;
    monto: number;
    iva: number;
  }[];
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

  // Calculate suggested crédito remanente based on VAT credit account balance (saldo anterior)
  const calcularCreditoRemanenteSugerido = async () => {
    if (!enterpriseId) return;

    try {
      // Get the VAT credit account from enterprise config
      const { data: configData } = await supabase
        .from("tab_enterprise_config")
        .select("vat_credit_account_id")
        .eq("enterprise_id", enterpriseId)
        .maybeSingle();

      if (!configData?.vat_credit_account_id) {
        setCreditoRemanenteSugerido(0);
        return;
      }

      const vatCreditAccountId = configData.vat_credit_account_id;

      // Calculate the start date of the selected month (we need balance BEFORE this date)
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;

      // Get all journal entry details for the VAT credit account BEFORE the selected month
      const { data: journalDetails } = await supabase
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
        .lt("tab_journal_entries.entry_date", startDate);

      if (!journalDetails || journalDetails.length === 0) {
        setCreditoRemanenteSugerido(0);
        return;
      }

      // Calculate the balance: for a debit account (IVA por Cobrar), balance = debit - credit
      let totalDebit = 0;
      let totalCredit = 0;

      journalDetails.forEach((detail: any) => {
        totalDebit += Number(detail.debit_amount) || 0;
        totalCredit += Number(detail.credit_amount) || 0;
      });

      const saldoAnterior = totalDebit - totalCredit;
      
      // Only set positive balance as suggested (negative would mean we owe, not a credit)
      setCreditoRemanenteSugerido(Math.max(0, saldoAnterior));

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

    // IDs de tipos de operación del sistema
    const OPERATION_TYPE_BIENES = 1;
    const OPERATION_TYPE_SERVICIOS = 2;
    const OPERATION_TYPE_ACTIVOS_FIJOS = 3;
    const OPERATION_TYPE_IMPORTACIONES = 4;
    const OPERATION_TYPE_OTRAS = 5;

    // Inicializar compras por tipo de operación
    let comprasBienes = 0;
    let comprasServicios = 0;
    let importaciones = 0;
    let comprasActivosFijos = 0;
    let comprasExentas = 0;
    let notasCreditoCompras = 0;

    // Crédito fiscal por tipo
    let creditoFiscalBienes = 0;
    let creditoFiscalServicios = 0;
    let creditoFiscalImportaciones = 0;
    let creditoFiscalActivosFijos = 0;
    let notasCreditoIVA = 0;

    // Estadísticas por tipo de documento
    const docTypeStats: Record<string, { cantidad: number; monto: number; iva: number }> = {};

    purchases.forEach(purchase => {
      const docType = purchase.fel_document_type || 'FACT';
      const multiplier = getMultiplier(docType);
      const baseAmount = (purchase.base_amount || purchase.net_amount) * multiplier;
      const vatAmount = purchase.vat_amount * multiplier;
      const operationType = purchase.operation_type_id;

      // Inicializar estadísticas del tipo de documento
      if (!docTypeStats[docType]) {
        docTypeStats[docType] = { cantidad: 0, monto: 0, iva: 0 };
      }
      docTypeStats[docType].cantidad += 1;
      docTypeStats[docType].monto += baseAmount;
      docTypeStats[docType].iva += vatAmount;

      // Si es documento exento (FPEQ, FESP, etc.), va a compras exentas
      if (exentosTypes.includes(docType)) {
        comprasExentas += (purchase.total_amount * multiplier);
        return; // No suma a crédito fiscal
      }

      // Si es Nota de Crédito (NCRE), se registra por separado (multiplier ya es -1)
      if (docType === 'NCRE') {
        // El multiplier ya es -1, así que estos valores serán negativos
        notasCreditoCompras += Math.abs(baseAmount);
        notasCreditoIVA += Math.abs(vatAmount);
        return;
      }

      // Clasificar por tipo de operación
      switch (operationType) {
        case OPERATION_TYPE_SERVICIOS:
          comprasServicios += baseAmount;
          creditoFiscalServicios += vatAmount;
          break;
        case OPERATION_TYPE_IMPORTACIONES:
          importaciones += baseAmount;
          creditoFiscalImportaciones += vatAmount;
          break;
        case OPERATION_TYPE_ACTIVOS_FIJOS:
          comprasActivosFijos += baseAmount;
          creditoFiscalActivosFijos += vatAmount;
          break;
        case OPERATION_TYPE_BIENES:
        case OPERATION_TYPE_OTRAS:
        default:
          // Bienes, Otras o sin clasificar van a "Otras Compras" (Casilla 27)
          comprasBienes += baseAmount;
          creditoFiscalBienes += vatAmount;
          break;
      }
    });

    // Calcular totales
    // Total compras gravadas incluye las exentas (FPEQ, FESP) para el cálculo del neto
    const totalComprasGravadas = comprasBienes + comprasServicios + importaciones + comprasActivosFijos + comprasExentas;
    const comprasNetoGravadas = totalComprasGravadas - notasCreditoCompras;
    const creditoFiscalBruto = creditoFiscalBienes + creditoFiscalServicios + creditoFiscalImportaciones + creditoFiscalActivosFijos;
    const creditoFiscal = creditoFiscalBruto - notasCreditoIVA;

    const totalVentas = ventasGravadasLocales + exportaciones + ventasExentas;
    const diferencia = debitoFiscal - creditoFiscal;
    // Total crédito incluyendo remanente del mes anterior
    const totalCredito = creditoFiscal + creditoRemanenteInput;
    // Si débito > totalCredito, hay IVA a pagar
    // Si totalCredito > débito, hay crédito remanente para el próximo mes
    const ivaAPagar = Math.max(0, debitoFiscal - totalCredito);
    const creditoRemanenteProximoMes = Math.max(0, totalCredito - debitoFiscal);

    // Convertir estadísticas a array
    const documentosPorTipo = Object.entries(docTypeStats).map(([tipo, stats]) => ({
      tipo,
      cantidad: stats.cantidad,
      monto: Math.round(stats.monto),
      iva: Math.round(stats.iva),
    }));

    return {
      ventasGravadasLocales: Math.round(ventasGravadasLocales),
      exportaciones: Math.round(exportaciones),
      ventasExentas: Math.round(ventasExentas),
      totalVentas: Math.round(totalVentas),
      debitoFiscal: Math.round(debitoFiscal),
      // Compras desglosadas
      comprasBienes: Math.round(comprasBienes),
      comprasServicios: Math.round(comprasServicios),
      importaciones: Math.round(importaciones),
      comprasActivosFijos: Math.round(comprasActivosFijos),
      comprasExentas: Math.round(comprasExentas),
      totalComprasGravadas: Math.round(totalComprasGravadas),
      notasCreditoCompras: Math.round(notasCreditoCompras),
      comprasNetoGravadas: Math.round(comprasNetoGravadas),
      // Crédito fiscal desglosado
      creditoFiscalBienes: Math.round(creditoFiscalBienes),
      creditoFiscalServicios: Math.round(creditoFiscalServicios),
      creditoFiscalImportaciones: Math.round(creditoFiscalImportaciones),
      creditoFiscalActivosFijos: Math.round(creditoFiscalActivosFijos),
      notasCreditoIVA: Math.round(notasCreditoIVA),
      creditoFiscal: Math.round(creditoFiscal),
      creditoRemanente: Math.round(creditoRemanenteInput),
      diferencia: Math.round(diferencia),
      ivaAPagar: Math.round(ivaAPagar),
      creditoRemanenteProximoMes: Math.round(creditoRemanenteProximoMes),
      documentosPorTipo,
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
      totalIngresos: Math.round(totalIngresos),
      tasaImpuesto,
      impuestoAPagar: Math.round(impuestoAPagar),
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
