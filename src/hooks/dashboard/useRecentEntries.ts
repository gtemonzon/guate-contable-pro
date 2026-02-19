/**
 * useRecentEntries — fetches the 3 most recent journal entries for the dashboard widget.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatGTQ } from '@/domain/accounting/calculations';

export interface RecentEntry {
  id: number;
  number: string;
  date: string;
  description: string;
  amount: string;
}

export function useRecentEntries(enterpriseId: number | null) {
  return useQuery<RecentEntry[]>({
    queryKey: ['dashboard-recent-entries', enterpriseId],
    enabled: !!enterpriseId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('tab_journal_entries')
        .select('id, entry_number, entry_date, description, total_debit')
        .eq('enterprise_id', enterpriseId!)
        .is('deleted_at', null)
        .order('entry_date', { ascending: false })
        .limit(3);

      return (data ?? []).map((e) => ({
        id:          e.id,
        number:      e.entry_number,
        date:        e.entry_date,
        description: e.description,
        amount:      `Q ${formatGTQ(Number(e.total_debit || 0))}`,
      }));
    },
  });
}
