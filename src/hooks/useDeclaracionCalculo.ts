import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRecords } from "@/utils/supabaseHelpers";

export type TaxFormType = 'IVA_PEQUENO' | 'IVA_GENERAL' | 'ISR_MENSUAL' | 'ISR_TRIMESTRAL' | 'ISO_TRIMESTRAL';

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
  exencionIVA: number; // Exención IVA realizada (user input, resta del impuesto)
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
  // Escala progresiva
  primerTramo: number; // Hasta Q30,000 al 5%
  segundoTramo: number; // Excedente de Q30,000 al 7%
  isrBruto: number; // Impuesto calculado antes de retenciones
  retencionRealizada: number; // Retenciones ISR de terceros (input del usuario)
  isrAPagar: number; // ISR neto a pagar
}

export interface ISOCalculo {
  anioBase: number;
  anioAplicacion: number;
  ingresosBrutosAnioAnterior: number;
  comprasAnioAnterior: number;
  baseImponibleAnual: number;
  baseTrimestral: number;
  tasaImpuesto: number;
  impuestoTrimestral: number;
}

export interface OtroValorISR {
  id: string;
  label: string;
  amount: number;
  sign: 1 | -1; // +1 suma (otro ingreso), -1 resta (otro gasto)
}

export interface ISRTrimestralCalculo {
  trimestre: number; // 1..4
  trimestreLabel: string; // "1 (enero a marzo)"
  fechaInicio: string;
  fechaFin: string;
  // Datos contables acumulados año a la fecha
  ingresos: number; // de cuentas tipo "ingreso"
  inventarioInicial: number; // saldo cuenta inventario al 01-ene
  comprasPeriodo: number; // movimiento débito - crédito de cuenta compras
  inventarioFinalEstimado: number; // input usuario
  costoVentas: number; // inv inicial + compras - inv final estimado
  gastosOperacion: number; // de cuentas tipo "gasto" (excluye 5.x compras si están como gasto)
  otrosNeto: number; // suma neta de otros valores
  rentaImponible: number; // ingresos - costo - gastos + otros
  isrCalculado: number; // rentaImponible * tasa
  isrPagadoAnterior: number; // input usuario
  isrAPagar: number; // isrCalculado - isrPagadoAnterior
  tasaImpuesto: number;
}

export function useDeclaracionCalculo(
  enterpriseId: number | null, 
  month: number, 
  year: number,
  creditoRemanenteInput: number = 0,
  exencionIVAInput: number = 0,
  retencionISRInput: number = 0,
  inventarioFinalEstimadoInput: number = 0,
  otrosValoresInput: OtroValorISR[] = [],
  isrPagadoAnteriorInput: number = 0,
) {
  const [loading, setLoading] = useState(false);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [felDocTypes, setFelDocTypes] = useState<FelDocType[]>([]);
  const [taxConfigs, setTaxConfigs] = useState<TaxConfig[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creditoRemanenteSugerido, setCreditoRemanenteSugerido] = useState<number>(0);
  const [ingresosAnioAnterior, setIngresosAnioAnterior] = useState<number>(0);
  const [comprasAnioAnterior, setComprasAnioAnterior] = useState<number>(0);
  const [isrTrimContable, setIsrTrimContable] = useState<{
    ingresos: number;
    inventarioInicial: number;
    comprasPeriodo: number;
    gastosOperacion: number;
  }>({ ingresos: 0, inventarioInicial: 0, comprasPeriodo: 0, gastosOperacion: 0 });

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

      // Fetch yearly totals from previous year for ISO reference
      const previousYear = year - 1;
      const previousYearStart = `${previousYear}-01-01`;
      const previousYearEnd = `${previousYear}-12-31`;

      const [salesPrevYearRes, purchasesPrevYearRes] = await Promise.all([
        supabase
          .from("tab_sales_ledger")
          .select("net_amount")
          .eq("enterprise_id", enterpriseId)
          .eq("is_annulled", false)
          .gte("invoice_date", previousYearStart)
          .lte("invoice_date", previousYearEnd),
        supabase
          .from("tab_purchase_ledger")
          .select("net_amount")
          .eq("enterprise_id", enterpriseId)
          .gte("invoice_date", previousYearStart)
          .lte("invoice_date", previousYearEnd),
      ]);

      const ingresosPrevYear = (salesPrevYearRes.data || []).reduce((sum, row) => sum + Number(row.net_amount || 0), 0);
      const comprasPrevYear = (purchasesPrevYearRes.data || []).reduce((sum, row) => sum + Number(row.net_amount || 0), 0);
      setIngresosAnioAnterior(ingresosPrevYear);
      setComprasAnioAnterior(comprasPrevYear);

      // Calculate suggested crédito remanente from previous month
      await calcularCreditoRemanenteSugerido();

      // Calculate accounting data for ISR Trimestral (acumulado año a la fecha hasta fin del trimestre)
      await calcularDatosContablesISRTrimestral();

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
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
        .eq("tab_journal_entries.is_posted", true)
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

  // Calculate quarterly accumulated accounting data for ISR Trimestral (SAT-1341)
  // Pulls from accounting (no fiscal ledgers): income accounts, purchases account,
  // inventory account opening balance, expense accounts (gastos de operación).
  const calcularDatosContablesISRTrimestral = async () => {
    if (!enterpriseId) return;
    try {
      const trimestre = Math.ceil(month / 3);
      const monthEnd = trimestre * 3; // 3, 6, 9, 12
      const yearStart = `${year}-01-01`;
      const periodEnd = new Date(year, monthEnd, 0).toISOString().split('T')[0];

      // Get enterprise config (inventory + purchases accounts)
      const { data: configData } = await supabase
        .from("tab_enterprise_config")
        .select("inventory_account_id, purchases_account_id")
        .eq("enterprise_id", enterpriseId)
        .maybeSingle();

      // Get all movement-allowing accounts of types: ingreso, gasto
      const { data: accountsData } = await supabase
        .from("tab_accounts")
        .select("id, account_type, account_code")
        .eq("enterprise_id", enterpriseId)
        .eq("allows_movement", true)
        .in("account_type", ["ingreso", "gasto"]);

      const ingresoIds = (accountsData || []).filter(a => a.account_type === "ingreso").map(a => a.id);
      // Gastos de operación: tipo 'gasto' EXCLUYENDO la cuenta de compras (que va al costo de ventas)
      const purchasesAccId = configData?.purchases_account_id ?? null;
      const gastoIds = (accountsData || [])
        .filter(a => a.account_type === "gasto" && a.id !== purchasesAccId)
        .map(a => a.id);
      const inventoryId = configData?.inventory_account_id ?? null;

      // Helper: get sum of (credit-debit) or (debit-credit) for a set of account ids in date range
      const sumAccountsInRange = async (
        accountIds: number[],
        startDate: string,
        endDate: string,
        nature: 'debit' | 'credit'
      ): Promise<number> => {
        if (accountIds.length === 0) return 0;
        const entries = await fetchAllRecords(
          supabase
            .from("tab_journal_entries")
            .select("id")
            .eq("enterprise_id", enterpriseId)
            .eq("is_posted", true)
            .is("deleted_at", null)
            .gte("entry_date", startDate)
            .lte("entry_date", endDate)
        );
        if (!entries || entries.length === 0) return 0;
        const entryIds = entries.map((e: any) => e.id);
        let total = 0;
        const batchSize = 100;
        for (let i = 0; i < entryIds.length; i += batchSize) {
          const batch = entryIds.slice(i, i + batchSize);
          const { data: details } = await supabase
            .from("tab_journal_entry_details")
            .select("debit_amount, credit_amount, account_id")
            .is("deleted_at", null)
            .in("account_id", accountIds)
            .in("journal_entry_id", batch);
          (details || []).forEach((d: any) => {
            const dr = Number(d.debit_amount) || 0;
            const cr = Number(d.credit_amount) || 0;
            total += nature === 'credit' ? (cr - dr) : (dr - cr);
          });
        }
        return Math.round(total * 100) / 100;
      };

      // Helper: balance of account up to (excluding) a date — used for inventario inicial
      const balanceUpTo = async (accountId: number, endDateExclusive: string): Promise<number> => {
        const entries = await fetchAllRecords(
          supabase
            .from("tab_journal_entries")
            .select("id")
            .eq("enterprise_id", enterpriseId)
            .eq("is_posted", true)
            .is("deleted_at", null)
            .lt("entry_date", endDateExclusive)
        );
        if (!entries || entries.length === 0) return 0;
        const entryIds = entries.map((e: any) => e.id);
        let total = 0;
        const batchSize = 100;
        for (let i = 0; i < entryIds.length; i += batchSize) {
          const batch = entryIds.slice(i, i + batchSize);
          const { data: details } = await supabase
            .from("tab_journal_entry_details")
            .select("debit_amount, credit_amount")
            .is("deleted_at", null)
            .eq("account_id", accountId)
            .in("journal_entry_id", batch);
          (details || []).forEach((d: any) => {
            total += (Number(d.debit_amount) || 0) - (Number(d.credit_amount) || 0);
          });
        }
        return Math.round(total * 100) / 100;
      };

      const [ingresos, gastos, compras, invInicial] = await Promise.all([
        sumAccountsInRange(ingresoIds, yearStart, periodEnd, 'credit'),
        sumAccountsInRange(gastoIds, yearStart, periodEnd, 'debit'),
        purchasesAccId ? sumAccountsInRange([purchasesAccId], yearStart, periodEnd, 'debit') : Promise.resolve(0),
        inventoryId ? balanceUpTo(inventoryId, yearStart) : Promise.resolve(0),
      ]);

      setIsrTrimContable({
        ingresos: Math.max(0, ingresos),
        inventarioInicial: Math.max(0, invInicial),
        comprasPeriodo: Math.max(0, compras),
        gastosOperacion: Math.max(0, gastos),
      });
    } catch (err) {
      console.error("Error calculating ISR Trimestral accounting data:", err);
      setIsrTrimContable({ ingresos: 0, inventarioInicial: 0, comprasPeriodo: 0, gastosOperacion: 0 });
    }
  };

  const getMultiplier = (docType: string): number => {
    const found = felDocTypes.find(d => d.code === docType);
    return found?.affects_total ?? 1;
  };

  // Calculate IVA General (SAT-2237)
  const ivaGeneralCalculo = useMemo((): IVAGeneralCalculo => {
    // Tipos exentos de IVA
    const exentosTypes = ['FPEQ', 'FESP', 'NABN', 'RDON', 'RECI'];
    
    let ventasGravadasLocales = 0;
    const exportaciones = 0;
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
    // Si débito > totalCredito, hay IVA a pagar (antes de exención)
    // Si totalCredito > débito, hay crédito remanente para el próximo mes
    const ivaAPagarBruto = Math.max(0, debitoFiscal - totalCredito);
    // Aplicar exención IVA realizada (resta del impuesto a pagar)
    const ivaAPagar = Math.max(0, ivaAPagarBruto - exencionIVAInput);
    // Crédito remanente: crédito que sobra del período + exceso de exención sobre impuesto bruto
    const creditoSobrante = Math.max(0, totalCredito - debitoFiscal);
    const exencionExcedente = Math.max(0, exencionIVAInput - ivaAPagarBruto);
    const creditoRemanenteProximoMes = creditoSobrante + exencionExcedente;

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
      exencionIVA: Math.round(exencionIVAInput),
      diferencia: Math.round(diferencia),
      ivaAPagar: Math.round(ivaAPagar),
      creditoRemanenteProximoMes: Math.round(creditoRemanenteProximoMes),
      documentosPorTipo,
    };
  }, [sales, purchases, felDocTypes, creditoRemanenteInput, exencionIVAInput]);

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

  // Calculate ISR Mensual con escala progresiva (5% hasta Q30,000 / 7% excedente)
  const isrMensualCalculo = useMemo((): ISRMensualCalculo => {
    // Umbral para el primer tramo (Q30,000)
    const UMBRAL_PRIMER_TRAMO = 30000;
    const TASA_PRIMER_TRAMO = 0.05; // 5%
    const TASA_SEGUNDO_TRAMO = 0.07; // 7%
    const IMPUESTO_FIJO_SEGUNDO_TRAMO = 1500; // Q1,500 del primer tramo

    let ingresosBrutos = 0;
    sales.forEach(sale => {
      const multiplier = getMultiplier(sale.fel_document_type);
      ingresosBrutos += sale.net_amount * multiplier;
    });

    // Calcular ISR con escala progresiva
    let primerTramo = 0;
    let segundoTramo = 0;
    let isrBruto = 0;

    if (ingresosBrutos <= UMBRAL_PRIMER_TRAMO) {
      // Solo primer tramo (5%)
      primerTramo = ingresosBrutos;
      segundoTramo = 0;
      isrBruto = ingresosBrutos * TASA_PRIMER_TRAMO;
    } else {
      // Primer tramo completo + segundo tramo
      primerTramo = UMBRAL_PRIMER_TRAMO;
      segundoTramo = ingresosBrutos - UMBRAL_PRIMER_TRAMO;
      isrBruto = IMPUESTO_FIJO_SEGUNDO_TRAMO + (segundoTramo * TASA_SEGUNDO_TRAMO);
    }

    // Aplicar retención realizada (resta del impuesto)
    const isrAPagar = Math.max(0, isrBruto - retencionISRInput);

    // ISR uses exact amounts with centavos (no rounding to integers)
    const round2 = (n: number) => Math.round(n * 100) / 100;
    return {
      ingresosBrutos: round2(ingresosBrutos),
      primerTramo: round2(primerTramo),
      segundoTramo: round2(segundoTramo),
      isrBruto: round2(isrBruto),
      retencionRealizada: round2(retencionISRInput),
      isrAPagar: round2(isrAPagar),
    };
  }, [sales, felDocTypes, retencionISRInput]);

  // Calculate ISO trimestral using final information from previous year
  const isoCalculo = useMemo((): ISOCalculo => {
    const previousYear = year - 1;
    const tasaImpuesto = taxConfigs.find(c => c.tax_form_type === 'ISO_TRIMESTRAL')?.tax_rate ?? 1;

    const baseImponibleAnual = Math.max(0, ingresosAnioAnterior - comprasAnioAnterior);
    const baseTrimestral = baseImponibleAnual / 4;
    const impuestoTrimestral = baseTrimestral * (tasaImpuesto / 100);

    return {
      anioBase: previousYear,
      anioAplicacion: year,
      ingresosBrutosAnioAnterior: Math.round(ingresosAnioAnterior),
      comprasAnioAnterior: Math.round(comprasAnioAnterior),
      baseImponibleAnual: Math.round(baseImponibleAnual),
      baseTrimestral: Math.round(baseTrimestral),
      tasaImpuesto,
      impuestoTrimestral: Math.round(impuestoTrimestral),
    };
  }, [year, taxConfigs, ingresosAnioAnterior, comprasAnioAnterior]);

  // Calculate ISR Trimestral (SAT-1341) — accumulated year-to-date through end of selected quarter
  const isrTrimestralCalculo = useMemo((): ISRTrimestralCalculo => {
    const trimestre = Math.ceil(month / 3);
    const monthEnd = trimestre * 3;
    const trimestreLabels: Record<number, string> = {
      1: '1 (enero a marzo)',
      2: '2 (abril a junio)',
      3: '3 (julio a septiembre)',
      4: '4 (octubre a diciembre)',
    };
    const fechaInicio = `${year}-01-01`;
    const fechaFin = new Date(year, monthEnd, 0).toISOString().split('T')[0];

    const config = taxConfigs.find(c => c.tax_form_type === 'ISR_TRIMESTRAL');
    const tasaImpuesto = config?.tax_rate ?? 25; // Default 25% régimen sobre utilidades

    const { ingresos, inventarioInicial, comprasPeriodo, gastosOperacion } = isrTrimContable;
    const costoVentas = Math.max(0, inventarioInicial + comprasPeriodo - inventarioFinalEstimadoInput);
    const otrosNeto = otrosValoresInput.reduce((sum, o) => sum + o.sign * (Number(o.amount) || 0), 0);
    const rentaImponible = ingresos - costoVentas - gastosOperacion + otrosNeto;
    const isrCalculado = Math.max(0, rentaImponible) * (tasaImpuesto / 100);
    const isrAPagar = Math.max(0, isrCalculado - isrPagadoAnteriorInput);

    const round2 = (n: number) => Math.round(n * 100) / 100;
    return {
      trimestre,
      trimestreLabel: trimestreLabels[trimestre] || `${trimestre}`,
      fechaInicio,
      fechaFin,
      ingresos: round2(ingresos),
      inventarioInicial: round2(inventarioInicial),
      comprasPeriodo: round2(comprasPeriodo),
      inventarioFinalEstimado: round2(inventarioFinalEstimadoInput),
      costoVentas: round2(costoVentas),
      gastosOperacion: round2(gastosOperacion),
      otrosNeto: round2(otrosNeto),
      rentaImponible: round2(rentaImponible),
      isrCalculado: round2(isrCalculado),
      isrPagadoAnterior: round2(isrPagadoAnteriorInput),
      isrAPagar: round2(isrAPagar),
      tasaImpuesto,
    };
  }, [month, year, taxConfigs, isrTrimContable, inventarioFinalEstimadoInput, otrosValoresInput, isrPagadoAnteriorInput]);

  return {
    loading,
    error,
    sales,
    purchases,
    taxConfigs,
    ivaGeneralCalculo,
    ivaPequenoCalculo,
    isrMensualCalculo,
    isoCalculo,
    isrTrimestralCalculo,
    creditoRemanenteSugerido,
    fetchData,
  };
}
