import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type FormatType = 'balance_general' | 'estado_resultados';
export type SectionType = 'group' | 'subtotal' | 'total' | 'calculated';

export interface SectionAccount {
  id?: number;
  section_id?: number;
  account_id: number;
  display_order: number;
  sign_multiplier: 1 | -1;
  include_children: boolean;
  account_code?: string;
  account_name?: string;
}

export interface Section {
  id?: number;
  format_id?: number;
  section_name: string;
  section_type: SectionType;
  display_order: number;
  show_in_report: boolean;
  accounts: SectionAccount[];
}

export interface FinancialFormat {
  id?: number;
  enterprise_id: number;
  format_type: FormatType;
  name: string;
  is_active: boolean;
  sections: Section[];
}

export function useFinancialStatementFormat(enterpriseId: number | null, formatType: FormatType) {
  const [format, setFormat] = useState<FinancialFormat | null>(null);
  const [loading, setLoading] = useState(false);

  const loadFormat = useCallback(async () => {
    if (!enterpriseId) return;
    
    setLoading(true);
    try {
      // Load format
      const { data: formatData, error: formatError } = await supabase
        .from('tab_financial_statement_formats')
        .select('*')
        .eq('enterprise_id', enterpriseId)
        .eq('format_type', formatType)
        .maybeSingle();

      if (formatError) throw formatError;

      if (!formatData) {
        setFormat(null);
        return;
      }

      // Load sections
      const { data: sectionsData, error: sectionsError } = await supabase
        .from('tab_financial_statement_sections')
        .select('*')
        .eq('format_id', formatData.id)
        .order('display_order');

      if (sectionsError) throw sectionsError;

      // Load accounts for each section with account details
      const sections: Section[] = [];
      for (const section of sectionsData || []) {
        const { data: accountsData, error: accountsError } = await supabase
          .from('tab_financial_statement_section_accounts')
          .select('*')
          .eq('section_id', section.id)
          .order('display_order');

        if (accountsError) throw accountsError;

        const accountIds = (accountsData || []).map((a: any) => a.account_id);
        const accountDetailsMap = new Map<number, { account_code: string; account_name: string }>();

        if (accountIds.length > 0) {
          const { data: accountDetails, error: accountDetailsError } = await supabase
            .from('tab_accounts')
            .select('id, account_code, account_name')
            .in('id', accountIds);

          if (accountDetailsError) throw accountDetailsError;

          (accountDetails || []).forEach((acc: any) => {
            accountDetailsMap.set(acc.id, {
              account_code: acc.account_code,
              account_name: acc.account_name,
            });
          });
        }

        sections.push({
          id: section.id,
          format_id: section.format_id,
          section_name: section.section_name,
          section_type: section.section_type as SectionType,
          display_order: section.display_order,
          show_in_report: section.show_in_report,
          accounts: (accountsData || []).map((a: any) => {
            const details = accountDetailsMap.get(a.account_id);
            return {
              id: a.id,
              section_id: a.section_id,
              account_id: a.account_id,
              display_order: a.display_order,
              sign_multiplier: a.sign_multiplier as 1 | -1,
              include_children: a.include_children,
              account_code: details?.account_code,
              account_name: details?.account_name,
            };
          }),
        });
      }

      setFormat({
        id: formatData.id,
        enterprise_id: formatData.enterprise_id,
        format_type: formatData.format_type as FormatType,
        name: formatData.name,
        is_active: formatData.is_active,
        sections,
      });
    } catch (error) {
      console.error('Error loading format:', error);
      setFormat(null);
    } finally {
      setLoading(false);
    }
  }, [enterpriseId, formatType]);

  const saveFormat = async (newFormat: FinancialFormat) => {
    if (!enterpriseId) return false;

    setLoading(true);
    try {
      let formatId = newFormat.id;

      // Check if format already exists for this enterprise/type combination
      if (!formatId) {
        const { data: existingFormat } = await supabase
          .from('tab_financial_statement_formats')
          .select('id')
          .eq('enterprise_id', enterpriseId)
          .eq('format_type', formatType)
          .maybeSingle();
        
        if (existingFormat) {
          formatId = existingFormat.id;
        }
      }

      // Create or update format
      if (formatId) {
        const { error } = await supabase
          .from('tab_financial_statement_formats')
          .update({
            name: newFormat.name,
            is_active: newFormat.is_active,
          })
          .eq('id', formatId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('tab_financial_statement_formats')
          .insert({
            enterprise_id: enterpriseId,
            format_type: formatType,
            name: newFormat.name,
            is_active: newFormat.is_active,
          })
          .select()
          .single();
        if (error) throw error;
        formatId = data.id;
      }

      // Delete existing sections (cascade will delete accounts)
      await supabase
        .from('tab_financial_statement_sections')
        .delete()
        .eq('format_id', formatId);

      // Insert new sections
      for (const section of newFormat.sections) {
        const { data: sectionData, error: sectionError } = await supabase
          .from('tab_financial_statement_sections')
          .insert({
            format_id: formatId,
            section_name: section.section_name,
            section_type: section.section_type,
            display_order: section.display_order,
            show_in_report: section.show_in_report,
          })
          .select()
          .single();

        if (sectionError) throw sectionError;

        // Insert accounts for section
        if (section.accounts.length > 0) {
          const accountsToInsert = section.accounts.map(a => ({
            section_id: sectionData.id,
            account_id: a.account_id,
            display_order: a.display_order,
            sign_multiplier: a.sign_multiplier,
            include_children: a.include_children,
          }));

          const { error: accountsError } = await supabase
            .from('tab_financial_statement_section_accounts')
            .insert(accountsToInsert);

          if (accountsError) throw accountsError;
        }
      }

      toast.success('Formato guardado exitosamente');
      await loadFormat();
      return true;
    } catch (error) {
      console.error('Error saving format:', error);
      toast.error('Error al guardar el formato');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const deleteFormat = async () => {
    if (!format?.id) return false;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('tab_financial_statement_formats')
        .delete()
        .eq('id', format.id);

      if (error) throw error;

      toast.success('Formato eliminado');
      setFormat(null);
      return true;
    } catch (error) {
      console.error('Error deleting format:', error);
      toast.error('Error al eliminar el formato');
      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFormat();
  }, [loadFormat]);

  return {
    format,
    loading,
    saveFormat,
    deleteFormat,
    reloadFormat: loadFormat,
  };
}
