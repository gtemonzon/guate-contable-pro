import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, CheckCheck, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Suggestion {
  movement_id: number;
  journal_detail_id: number;
  score: number;
  confidence: 'high' | 'medium' | 'low';
  movement_description: string;
  journal_description: string;
  movement_date: string;
  journal_date: string;
  amount: number;
}

interface Props {
  enterpriseId: number;
  bankAccountId: number | null;
  year: number | null;
  month: number | null;
  onApplied: () => void;
}

export function AutoMatchPanel({ enterpriseId, bankAccountId, year, month, onApplied }: Props) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const runAnalysis = async () => {
    if (!bankAccountId || !year || !month) {
      toast.error('Selecciona cuenta y período en la pestaña Conciliación');
      return;
    }
    setLoading(true);
    try {
      const lastDay = new Date(year, month, 0).getDate();
      const period_start = `${year}-${String(month).padStart(2, '0')}-01`;
      const period_end = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
      const { data, error } = await supabase.functions.invoke('auto-match-bank-movements', {
        body: { bank_account_id: bankAccountId, enterprise_id: enterpriseId, period_start, period_end },
      });
      if (error) throw error;
      setSuggestions(data?.suggestions || []);
      toast.success(`${data?.suggestions?.length || 0} sugerencias encontradas`);
    } catch (err) {
      console.error(err);
      toast.error('Error al ejecutar análisis');
    } finally {
      setLoading(false);
    }
  };

  const applyHighConfidence = async () => {
    const high = suggestions.filter((s) => s.confidence === 'high');
    if (high.length === 0) {
      toast.info('No hay sugerencias de alta confianza');
      return;
    }
    setApplying(true);
    try {
      // Marcar tab_bank_movements como conciliados (sin crear conciliación formal aún)
      const updates = high.map((s) =>
        supabase.from('tab_bank_movements').update({ is_reconciled: true }).eq('id', s.movement_id)
      );
      await Promise.all(updates);
      toast.success(`${high.length} movimientos marcados como conciliados`);
      setSuggestions([]);
      onApplied();
    } catch (err) {
      console.error(err);
      toast.error('Error al aplicar sugerencias');
    } finally {
      setApplying(false);
    }
  };

  const grouped = {
    high: suggestions.filter((s) => s.confidence === 'high'),
    medium: suggestions.filter((s) => s.confidence === 'medium'),
    low: suggestions.filter((s) => s.confidence === 'low'),
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" />Matching asistido</CardTitle>
        <CardDescription>El sistema sugiere correspondencias entre movimientos bancarios importados y partidas contables del período seleccionado.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button onClick={runAnalysis} disabled={loading || !bankAccountId}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Analizar coincidencias
          </Button>
          {grouped.high.length > 0 && (
            <Button variant="default" onClick={applyHighConfidence} disabled={applying}>
              <CheckCheck className="h-4 w-4 mr-2" />
              Aceptar {grouped.high.length} de alta confianza
            </Button>
          )}
        </div>

        {!bankAccountId && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 border rounded-lg">
            <AlertCircle className="h-4 w-4" />
            Selecciona cuenta bancaria, mes y año en la pestaña "Conciliación".
          </div>
        )}

        {(['high', 'medium', 'low'] as const).map((level) => grouped[level].length > 0 && (
          <div key={level} className="space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Badge variant={level === 'high' ? 'default' : level === 'medium' ? 'secondary' : 'outline'}>
                {level === 'high' ? 'Alta' : level === 'medium' ? 'Media' : 'Baja'} confianza
              </Badge>
              <span className="text-muted-foreground">{grouped[level].length} sugerencias</span>
            </h3>
            <div className="space-y-1">
              {grouped[level].map((s, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 text-xs p-2 border rounded">
                  <div className="col-span-5">
                    <p className="font-medium truncate">{s.movement_description}</p>
                    <p className="text-muted-foreground">{s.movement_date} · Banco</p>
                  </div>
                  <div className="col-span-5">
                    <p className="font-medium truncate">{s.journal_description}</p>
                    <p className="text-muted-foreground">{s.journal_date} · Partida</p>
                  </div>
                  <div className="col-span-2 text-right">
                    <p className="font-mono font-semibold">Q{s.amount.toFixed(2)}</p>
                    <p className="text-muted-foreground">Score: {s.score}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
