import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SetupStep {
  id: string;
  label: string;
  description: string;
  isCompleted: boolean;
  route?: string;
  dialogTab?: string;
}

export function useEnterpriseSetupStatus(enterpriseId: number | null) {
  const [steps, setSteps] = useState<SetupStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [completedCount, setCompletedCount] = useState(0);

  useEffect(() => {
    if (!enterpriseId) {
      setSteps([]);
      setLoading(false);
      return;
    }

    const fetchStatus = async () => {
      setLoading(true);
      
      try {
        // Run all queries in parallel
        const [periodsResult, accountsResult, configResult, formatsResult] = await Promise.all([
          // Check for open accounting period
          supabase
            .from('tab_accounting_periods')
            .select('id', { count: 'exact', head: true })
            .eq('enterprise_id', enterpriseId)
            .eq('status', 'abierto'),
          
          // Check for accounts
          supabase
            .from('tab_accounts')
            .select('id', { count: 'exact', head: true })
            .eq('enterprise_id', enterpriseId),
          
          // Check enterprise config for special accounts
          supabase
            .from('tab_enterprise_config')
            .select('vat_credit_account_id, vat_debit_account_id')
            .eq('enterprise_id', enterpriseId)
            .maybeSingle(),
          
          // Check for financial statement formats
          supabase
            .from('tab_financial_statement_formats')
            .select('id', { count: 'exact', head: true })
            .eq('enterprise_id', enterpriseId),
        ]);

        const hasPeriod = (periodsResult.count || 0) > 0;
        const hasAccounts = (accountsResult.count || 0) > 0;
        const hasSpecialAccounts = !!(
          configResult.data?.vat_credit_account_id && 
          configResult.data?.vat_debit_account_id
        );
        const hasFinancialFormats = (formatsResult.count || 0) > 0;

        const newSteps: SetupStep[] = [
          {
            id: "empresa",
            label: "Crear Empresa",
            description: "Datos básicos de la empresa (NIT, razón social, régimen fiscal)",
            isCompleted: true, // Always completed if enterprise exists
            dialogTab: "general",
          },
          {
            id: "periodo",
            label: "Período Contable",
            description: "Crear y activar un período contable",
            isCompleted: hasPeriod,
            dialogTab: "periods",
          },
          {
            id: "catalogo",
            label: "Catálogo de Cuentas",
            description: "Cargar o importar cuentas contables",
            isCompleted: hasAccounts,
            route: "/cuentas",
          },
          {
            id: "cuentas-especiales",
            label: "Cuentas Especiales",
            description: "Configurar cuentas de IVA, clientes, proveedores, etc.",
            isCompleted: hasSpecialAccounts,
            route: "/configuracion?tab=enterprise-accounts",
          },
          {
            id: "estados-financieros",
            label: "Estados Financieros",
            description: "Diseñar formato de Balance General y Estado de Resultados",
            isCompleted: hasFinancialFormats,
            route: "/configuracion?tab=financial-statements",
          },
        ];

        setSteps(newSteps);
        setCompletedCount(newSteps.filter(s => s.isCompleted).length);
      } catch (error) {
        console.error('Error fetching enterprise setup status:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, [enterpriseId]);

  return { steps, loading, completedCount, totalSteps: 5 };
}
