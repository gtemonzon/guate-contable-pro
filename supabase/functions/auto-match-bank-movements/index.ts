// Edge function: auto-match-bank-movements
// Scoring: monto exacto (40) + fecha ±3 días (30) + referencia coincide (30)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Body {
  bank_account_id: number;
  enterprise_id: number;
  period_start: string;
  period_end: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing auth' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userResp } = await supabase.auth.getUser();
    if (!userResp.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body: Body = await req.json();
    const { bank_account_id, period_start, period_end } = body;
    if (!bank_account_id || !period_start || !period_end) {
      return new Response(JSON.stringify({ error: 'Missing params' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Bank movements no conciliados del período
    const { data: movements, error: mErr } = await supabase
      .from('tab_bank_movements')
      .select('id, movement_date, description, debit_amount, credit_amount, reference')
      .eq('bank_account_id', bank_account_id)
      .eq('is_reconciled', false)
      .gte('movement_date', period_start)
      .lte('movement_date', period_end);
    if (mErr) throw mErr;

    // Buscar account_id de la cuenta bancaria
    const { data: bAcc } = await supabase
      .from('tab_bank_accounts')
      .select('account_id')
      .eq('id', bank_account_id)
      .maybeSingle();
    if (!bAcc?.account_id) {
      return new Response(JSON.stringify({ suggestions: [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Detalles de partidas en cuenta bancaria (publicadas)
    const { data: details, error: dErr } = await supabase
      .from('tab_journal_entry_details')
      .select('id, debit_amount, credit_amount, description, tab_journal_entries!inner(entry_date, is_posted, bank_reference, beneficiary_name)')
      .eq('account_id', bAcc.account_id)
      .eq('tab_journal_entries.is_posted', true)
      .gte('tab_journal_entries.entry_date', period_start)
      .lte('tab_journal_entries.entry_date', period_end);
    if (dErr) throw dErr;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const detailsArr = (details as any[]) || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const movementsArr = (movements as any[]) || [];

    const suggestions: unknown[] = [];

    for (const m of movementsArr) {
      const mAmount = (m.debit_amount || 0) + (m.credit_amount || 0);
      const mDate = new Date(m.movement_date);
      const mRef = (m.reference || '').toLowerCase().trim();

      let best: { detail: typeof detailsArr[number]; score: number } | null = null;

      for (const d of detailsArr) {
        const dAmount = (d.debit_amount || 0) + (d.credit_amount || 0);
        const dDate = new Date(d.tab_journal_entries.entry_date);
        const dRef = (d.tab_journal_entries.bank_reference || '').toLowerCase().trim();

        let score = 0;
        if (Math.abs(mAmount - dAmount) < 0.01) score += 40;
        const daysDiff = Math.abs((mDate.getTime() - dDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff <= 3) score += 30 - Math.floor(daysDiff * 5);
        if (mRef && dRef && mRef === dRef) score += 30;

        if (score > 0 && (!best || score > best.score)) {
          best = { detail: d, score };
        }
      }

      if (best && best.score >= 30) {
        const confidence = best.score >= 70 ? 'high' : best.score >= 50 ? 'medium' : 'low';
        suggestions.push({
          movement_id: m.id,
          journal_detail_id: best.detail.id,
          score: best.score,
          confidence,
          movement_description: m.description,
          journal_description: best.detail.description || '(sin descripción)',
          movement_date: m.movement_date,
          journal_date: best.detail.tab_journal_entries.entry_date,
          amount: mAmount,
        });
      }
    }

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('auto-match error', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
