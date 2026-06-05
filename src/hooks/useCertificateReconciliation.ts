import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ReconciliationByCounterpart {
  nit: string;
  name: string;
  ledgerBase: number;
  ledgerVat: number;
  certIsr: number;
  certVat: number;
  certExemptBase: number;
}

export interface ReconciliationSummary {
  // Compras vs constancias EMITIDAS (retenciones que la empresa hace a proveedores)
  purchasesNet: number;
  purchasesVat: number;
  isrIssuedToSuppliers: number;
  vatIssuedToSuppliers: number;
  vatExemptionsIssued: number;
  // Ventas vs constancias RECIBIDAS (retenciones que los clientes hacen a la empresa)
  salesNet: number;
  salesVat: number;
  isrReceivedFromCustomers: number;
  vatReceivedFromCustomers: number;
  vatExemptionsReceived: number;
  bySupplier: ReconciliationByCounterpart[];
  byCustomer: ReconciliationByCounterpart[];
}

const monthRange = (year: number, month: number) => {
  const start = new Date(year, month - 1, 1).toISOString().slice(0, 10);
  const end = new Date(year, month, 0).toISOString().slice(0, 10);
  return { start, end };
};

export function useCertificateReconciliation(
  enterpriseId: number | null,
  month: number | null,
  year: number | null,
) {
  return useQuery({
    queryKey: ["certificate_reconciliation", enterpriseId, month, year],
    enabled: !!enterpriseId && !!month && !!year,
    queryFn: async (): Promise<ReconciliationSummary> => {
      const { start, end } = monthRange(year!, month!);

      const [purchasesRes, salesRes, certsRes] = await Promise.all([
        supabase
          .from("tab_purchase_ledger")
          .select("supplier_nit, supplier_name, net_amount, vat_amount")
          .eq("enterprise_id", enterpriseId!)
          .is("deleted_at", null)
          .gte("invoice_date", start)
          .lte("invoice_date", end),
        supabase
          .from("tab_sales_ledger")
          .select("customer_nit, customer_name, net_amount, vat_amount, is_annulled")
          .eq("enterprise_id", enterpriseId!)
          .is("deleted_at", null)
          .gte("invoice_date", start)
          .lte("invoice_date", end),
        supabase
          .from("tab_tax_certificates" as never)
          .select("direction, document_type, counterpart_nit, counterpart_name, tax_amount, base_amount, status")
          .eq("enterprise_id", enterpriseId!)
          .gte("issue_date", start)
          .lte("issue_date", end),
      ]);

      if (purchasesRes.error) throw purchasesRes.error;
      if (salesRes.error) throw salesRes.error;
      if (certsRes.error) throw certsRes.error;

      const result: ReconciliationSummary = {
        purchasesNet: 0, purchasesVat: 0,
        isrIssuedToSuppliers: 0, vatIssuedToSuppliers: 0, vatExemptionsIssued: 0,
        salesNet: 0, salesVat: 0,
        isrReceivedFromCustomers: 0, vatReceivedFromCustomers: 0, vatExemptionsReceived: 0,
        bySupplier: [], byCustomer: [],
      };

      const supMap = new Map<string, ReconciliationByCounterpart>();
      const custMap = new Map<string, ReconciliationByCounterpart>();
      const getOrInit = (m: Map<string, ReconciliationByCounterpart>, nit: string, name: string) => {
        const key = (nit || "").trim() || "—";
        let row = m.get(key);
        if (!row) {
          row = { nit: key, name, ledgerBase: 0, ledgerVat: 0, certIsr: 0, certVat: 0, certExemptBase: 0 };
          m.set(key, row);
        }
        return row;
      };

      for (const p of (purchasesRes.data ?? []) as Array<{ supplier_nit: string | null; supplier_name: string | null; net_amount: number | null; vat_amount: number | null; }>) {
        const net = Number(p.net_amount ?? 0);
        const vat = Number(p.vat_amount ?? 0);
        result.purchasesNet += net;
        result.purchasesVat += vat;
        const row = getOrInit(supMap, p.supplier_nit ?? "", p.supplier_name ?? "");
        row.ledgerBase += net;
        row.ledgerVat += vat;
      }

      for (const s of (salesRes.data ?? []) as Array<{ customer_nit: string | null; customer_name: string | null; net_amount: number | null; vat_amount: number | null; is_annulled: boolean | null; }>) {
        if (s.is_annulled) continue;
        const net = Number(s.net_amount ?? 0);
        const vat = Number(s.vat_amount ?? 0);
        result.salesNet += net;
        result.salesVat += vat;
        const row = getOrInit(custMap, s.customer_nit ?? "", s.customer_name ?? "");
        row.ledgerBase += net;
        row.ledgerVat += vat;
      }

      type CertRow = { direction: string; document_type: string; counterpart_nit: string; counterpart_name: string; tax_amount: number; base_amount: number; status: string };
      for (const c of (certsRes.data ?? []) as unknown as CertRow[]) {
        if (c.status === "void") continue;
        const tax = Number(c.tax_amount);
        const base = Number(c.base_amount);
        if (c.direction === "issued") {
          // empresa emite -> retención a proveedor
          const row = getOrInit(supMap, c.counterpart_nit, c.counterpart_name);
          if (c.document_type === "isr_retention") { result.isrIssuedToSuppliers += tax; row.certIsr += tax; }
          else if (c.document_type === "vat_retention") { result.vatIssuedToSuppliers += tax; row.certVat += tax; }
          else if (c.document_type === "vat_exemption") { result.vatExemptionsIssued += base; row.certExemptBase += base; }
        } else {
          const row = getOrInit(custMap, c.counterpart_nit, c.counterpart_name);
          if (c.document_type === "isr_retention") { result.isrReceivedFromCustomers += tax; row.certIsr += tax; }
          else if (c.document_type === "vat_retention") { result.vatReceivedFromCustomers += tax; row.certVat += tax; }
          else if (c.document_type === "vat_exemption") { result.vatExemptionsReceived += base; row.certExemptBase += base; }
        }
      }

      result.bySupplier = Array.from(supMap.values())
        .filter((r) => r.certIsr || r.certVat || r.certExemptBase)
        .sort((a, b) => (b.certIsr + b.certVat) - (a.certIsr + a.certVat));
      result.byCustomer = Array.from(custMap.values())
        .filter((r) => r.certIsr || r.certVat || r.certExemptBase)
        .sort((a, b) => (b.certIsr + b.certVat) - (a.certIsr + a.certVat));

      return result;
    },
  });
}
