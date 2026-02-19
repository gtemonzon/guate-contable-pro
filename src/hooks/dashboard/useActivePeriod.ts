/**
 * useActivePeriod — fetches and tracks the active accounting period
 * for the current enterprise, listening to period/enterprise change events.
 */
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ActivePeriod {
  id: number;
  year: number;
  start_date: string;
  end_date: string;
  status: string;
}

export function useActivePeriod(enterpriseId: number | null) {
  const [activePeriod, setActivePeriod] = useState<ActivePeriod | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enterpriseId) {
      setActivePeriod(null);
      setLoading(false);
      return;
    }

    const fetch = async () => {
      setLoading(true);
      try {
        const savedPeriodId = localStorage.getItem(`currentPeriodId_${enterpriseId}`);

        if (savedPeriodId) {
          const { data } = await supabase
            .from('tab_accounting_periods')
            .select('id, year, start_date, end_date, status')
            .eq('id', parseInt(savedPeriodId))
            .single();
          if (data) { setActivePeriod(data); return; }
        }

        const { data: periods } = await supabase
          .from('tab_accounting_periods')
          .select('id, year, start_date, end_date, status')
          .eq('enterprise_id', enterpriseId)
          .eq('status', 'abierto')
          .order('is_default_period', { ascending: false })
          .order('start_date', { ascending: false })
          .limit(1);

        setActivePeriod(periods?.[0] ?? null);
      } catch (err) {
        console.error('[useActivePeriod] error:', err);
        setActivePeriod(null);
      } finally {
        setLoading(false);
      }
    };

    fetch();

    const handle = () => fetch();
    window.addEventListener('periodChanged',    handle);
    window.addEventListener('enterpriseChanged', handle);
    window.addEventListener('storage',           handle);
    return () => {
      window.removeEventListener('periodChanged',    handle);
      window.removeEventListener('enterpriseChanged', handle);
      window.removeEventListener('storage',           handle);
    };
  }, [enterpriseId]);

  return { activePeriod, loading };
}
