import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface EnterpriseConfig {
  id?: number;
  enterprise_id: number;
  vat_credit_account_id: number | null;
  vat_debit_account_id: number | null;
  period_result_account_id: number | null;
  initial_inventory_account_id: number | null;
  final_inventory_account_id: number | null;
  purchases_account_id: number | null;
  sales_account_id: number | null;
  customers_account_id: number | null;
  suppliers_account_id: number | null;
  inventory_account_id: number | null;
  cost_of_sales_method: 'manual' | 'coeficiente';
  cost_of_sales_account_id: number | null;
}

const defaultConfig = (enterpriseId: number): EnterpriseConfig => ({
  enterprise_id: enterpriseId,
  vat_credit_account_id: null,
  vat_debit_account_id: null,
  period_result_account_id: null,
  initial_inventory_account_id: null,
  final_inventory_account_id: null,
  purchases_account_id: null,
  sales_account_id: null,
  customers_account_id: null,
  suppliers_account_id: null,
  inventory_account_id: null,
  cost_of_sales_method: 'manual',
  cost_of_sales_account_id: null,
});

export function useEnterpriseConfig(enterpriseId: number | null) {
  const [config, setConfig] = useState<EnterpriseConfig | null>(null);
  const [loading, setLoading] = useState(false);

  const loadConfig = useCallback(async () => {
    if (!enterpriseId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tab_enterprise_config')
        .select('*')
        .eq('enterprise_id', enterpriseId)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        setConfig(data as unknown as EnterpriseConfig);
      } else {
        setConfig(defaultConfig(enterpriseId));
      }
    } catch (error) {
      console.error('Error loading enterprise config:', error);
      setConfig(defaultConfig(enterpriseId));
    } finally {
      setLoading(false);
    }
  }, [enterpriseId]);

  const saveConfig = async (newConfig: Partial<EnterpriseConfig>) => {
    if (!enterpriseId) return false;

    setLoading(true);
    try {
      const configData = {
        enterprise_id: enterpriseId,
        vat_credit_account_id: newConfig.vat_credit_account_id,
        vat_debit_account_id: newConfig.vat_debit_account_id,
        period_result_account_id: newConfig.period_result_account_id,
        initial_inventory_account_id: newConfig.initial_inventory_account_id,
        final_inventory_account_id: newConfig.final_inventory_account_id,
        purchases_account_id: newConfig.purchases_account_id,
        sales_account_id: newConfig.sales_account_id,
        customers_account_id: newConfig.customers_account_id,
        suppliers_account_id: newConfig.suppliers_account_id,
        inventory_account_id: newConfig.inventory_account_id,
        cost_of_sales_method: newConfig.cost_of_sales_method,
        cost_of_sales_account_id: newConfig.cost_of_sales_account_id,
      };

      const { data: existing } = await supabase
        .from('tab_enterprise_config')
        .select('id')
        .eq('enterprise_id', enterpriseId)
        .maybeSingle();

      let error;
      if (existing) {
        const result = await supabase
          .from('tab_enterprise_config')
          .update(configData)
          .eq('enterprise_id', enterpriseId);
        error = result.error;
      } else {
        const result = await supabase
          .from('tab_enterprise_config')
          .insert(configData);
        error = result.error;
      }

      if (error) throw error;

      toast.success('Configuración guardada exitosamente');
      await loadConfig();
      return true;
    } catch (error) {
      console.error('Error saving enterprise config:', error);
      toast.error('Error al guardar la configuración');
      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  return {
    config,
    loading,
    saveConfig,
    reloadConfig: loadConfig,
  };
}
