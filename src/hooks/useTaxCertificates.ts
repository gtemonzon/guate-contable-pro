import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEnterprise } from "@/contexts/EnterpriseContext";
import { useTenant } from "@/contexts/TenantContext";

export type CertificateDirection = "issued" | "received";
export type CertificateDocumentType = "isr_retention" | "vat_retention" | "vat_exemption";
export type CertificateStatus = "draft" | "posted" | "void";
export type IsrRegime =
  | "actividades_lucrativas"
  | "rentas_capital_inmobiliario"
  | "rentas_capital_mobiliario";

export interface TaxCertificate {
  id: number;
  tenant_id: number;
  enterprise_id: number;
  period_id: number | null;
  direction: CertificateDirection;
  document_type: CertificateDocumentType;
  counterpart_nit: string;
  counterpart_name: string;
  document_number: string;
  authorization_number: string | null;
  series: string | null;
  issue_date: string;
  base_amount: number;
  vat_amount: number;
  percentage: number;
  tax_amount: number;
  isr_regime: IsrRegime | null;
  isr_category_id: number | null;
  purchase_ledger_id: number | null;
  sales_ledger_id: number | null;
  journal_entry_id: number | null;
  status: CertificateStatus;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CertificateFilters {
  month?: number | null;
  year?: number | null;
  document_type?: CertificateDocumentType | "all";
  direction?: CertificateDirection | "all";
  nit?: string;
  name?: string;
  document_number?: string;
  authorization_number?: string;
}

export const DOCUMENT_TYPE_LABELS: Record<CertificateDocumentType, string> = {
  isr_retention: "Retención ISR",
  vat_retention: "Retención IVA",
  vat_exemption: "Exención IVA",
};

export const DIRECTION_LABELS: Record<CertificateDirection, string> = {
  issued: "Emitida",
  received: "Recibida",
};

export const REGIME_LABELS: Record<IsrRegime, string> = {
  actividades_lucrativas: "Actividades Lucrativas",
  rentas_capital_inmobiliario: "Rentas de Capital Inmobiliario",
  rentas_capital_mobiliario: "Rentas de Capital Mobiliario",
};

export function useTaxCertificates(filters: CertificateFilters) {
  const { selectedEnterpriseId } = useEnterprise();

  return useQuery({
    queryKey: ["tax_certificates", selectedEnterpriseId, filters],
    enabled: !!selectedEnterpriseId,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase
        .from("tab_tax_certificates" as never)
        .select("*")
        .eq("enterprise_id", selectedEnterpriseId!)
        .order("issue_date", { ascending: false });

      if (filters.month && filters.year) {
        const start = new Date(filters.year, filters.month - 1, 1);
        const end = new Date(filters.year, filters.month, 0);
        q = q
          .gte("issue_date", start.toISOString().slice(0, 10))
          .lte("issue_date", end.toISOString().slice(0, 10));
      } else if (filters.year) {
        q = q.gte("issue_date", `${filters.year}-01-01`).lte("issue_date", `${filters.year}-12-31`);
      }

      if (filters.document_type && filters.document_type !== "all") {
        q = q.eq("document_type", filters.document_type);
      }
      if (filters.direction && filters.direction !== "all") {
        q = q.eq("direction", filters.direction);
      }
      if (filters.nit) q = q.ilike("counterpart_nit", `%${filters.nit}%`);
      if (filters.name) q = q.ilike("counterpart_name", `%${filters.name}%`);
      if (filters.document_number) q = q.ilike("document_number", `%${filters.document_number}%`);
      if (filters.authorization_number)
        q = q.ilike("authorization_number", `%${filters.authorization_number}%`);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as TaxCertificate[];
    },
  });
}

export interface IsrCategory {
  id: number;
  name: string;
  description: string | null;
  regime: IsrRegime;
  default_percentage: number;
  is_active: boolean;
  display_order: number;
}

export function useIsrCategories() {
  return useQuery({
    queryKey: ["isr_income_categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tab_isr_income_categories" as never)
        .select("*")
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return (data ?? []) as unknown as IsrCategory[];
    },
  });
}

export type CertificateInput = Omit<
  TaxCertificate,
  "id" | "created_at" | "updated_at" | "created_by" | "tenant_id"
>;

export function useSaveCertificate() {
  const qc = useQueryClient();
  const { currentTenant } = useTenant();

  return useMutation({
    mutationFn: async (payload: {
      id?: number;
      data: CertificateInput;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");
      if (!currentTenant?.id) throw new Error("Tenant no disponible");

      if (payload.id) {
        const { error } = await supabase
          .from("tab_tax_certificates" as never)
          .update(payload.data as never)
          .eq("id", payload.id);
        if (error) throw error;
        return payload.id;
      } else {
        const { data, error } = await supabase
          .from("tab_tax_certificates" as never)
          .insert({
            ...payload.data,
            tenant_id: currentTenant.id,
            created_by: user.id,
          } as never)
          .select("id")
          .single();
        if (error) throw error;
        return (data as { id: number }).id;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tax_certificates"] });
    },
  });
}

export function useDeleteCertificate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from("tab_tax_certificates" as never)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tax_certificates"] }),
  });
}
