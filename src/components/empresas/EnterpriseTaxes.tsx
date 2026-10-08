import { EnterpriseIssuanceProfiles } from "@/components/empresas/EnterpriseIssuanceProfiles";
import { EnterpriseDueDateConfig } from "@/components/empresas/EnterpriseDueDateConfig";
import { EnterpriseTaxForms } from "@/components/empresas/EnterpriseTaxForms";

interface EnterpriseTaxesProps {
  enterpriseId: number;
}

export function EnterpriseTaxes({ enterpriseId }: EnterpriseTaxesProps) {
  return (
    <div className="space-y-4">
      <EnterpriseIssuanceProfiles enterpriseId={enterpriseId} />

      <EnterpriseDueDateConfig enterpriseId={enterpriseId} />

      <EnterpriseTaxForms enterpriseId={enterpriseId} />
    </div>
  );
}
