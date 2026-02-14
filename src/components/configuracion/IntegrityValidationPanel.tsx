import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldCheck, AlertTriangle, AlertCircle, Info, ChevronDown, Play, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAccountingIntegrity, type ValidationSummary } from '@/hooks/useAccountingIntegrity';

const CATEGORY_LABELS: Record<string, string> = {
  A: 'Integridad de Partidas',
  B: 'Integridad de Cuentas',
  C: 'Integridad de Períodos',
  D: 'Integridad Fiscal',
  E: 'Conciliación Bancaria',
  F: 'Balance Contable',
  G: 'Costo de Ventas',
};

const severityConfig = {
  ERROR: { icon: AlertCircle, color: 'text-destructive', bg: 'bg-destructive/10', badge: 'destructive' as const },
  WARNING: { icon: AlertTriangle, color: 'text-yellow-600', bg: 'bg-yellow-50', badge: 'secondary' as const },
  INFO: { icon: Info, color: 'text-blue-600', bg: 'bg-blue-50', badge: 'outline' as const },
};

export function IntegrityValidationPanel() {
  const { runValidation, isRunning, progress, summary } = useAccountingIntegrity();
  const [periods, setPeriods] = useState<any[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all');
  const [lastValidation, setLastValidation] = useState<any>(null);

  const currentEnterpriseIdStr = localStorage.getItem('currentEnterpriseId');
  const currentEntId = currentEnterpriseIdStr ? parseInt(currentEnterpriseIdStr) : null;

  useEffect(() => {
    if (!currentEntId) return;
    
    const fetchData = async () => {
      const [periodsRes, lastRes] = await Promise.all([
        supabase
          .from('tab_accounting_periods')
          .select('id, year, status')
          .eq('enterprise_id', currentEntId)
          .order('year', { ascending: false }),
        supabase
          .from('tab_integrity_validations')
          .select('*')
          .eq('enterprise_id', currentEntId)
          .order('run_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      
      if (periodsRes.data) setPeriods(periodsRes.data);
      if (lastRes.data) setLastValidation(lastRes.data);
    };

    fetchData();
  }, [currentEntId]);

  const handleRun = async () => {
    if (!currentEntId) return;
    const periodId = selectedPeriod === 'all' ? null : parseInt(selectedPeriod);
    await runValidation(currentEntId, periodId);
  };

  const getHealthColor = (score: number) => {
    if (score >= 95) return 'text-success';
    if (score >= 80) return 'text-yellow-600';
    return 'text-destructive';
  };

  const displaySummary: ValidationSummary | null = summary || (lastValidation ? {
    totalErrors: lastValidation.total_errors,
    totalWarnings: lastValidation.total_warnings,
    totalInfo: lastValidation.total_info,
    healthScore: Number(lastValidation.health_score),
    results: (lastValidation.results as any[]) || [],
    runAt: lastValidation.run_at,
    categories: {},
  } : null);

  // Rebuild categories from flat results if loading from DB
  const categorizedResults = displaySummary ? (() => {
    if (Object.keys(displaySummary.categories).length > 0) return displaySummary.categories;
    const cats: Record<string, { errors: number; warnings: number; info: number; results: any[] }> = {};
    Object.keys(CATEGORY_LABELS).forEach(cat => {
      const catResults = displaySummary.results.filter(r => r.category === cat);
      cats[cat] = {
        errors: catResults.filter(r => r.severity === 'ERROR').length,
        warnings: catResults.filter(r => r.severity === 'WARNING').length,
        info: catResults.filter(r => r.severity === 'INFO').length,
        results: catResults,
      };
    });
    return cats;
  })() : {};

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Validación de Integridad Contable
          </CardTitle>
          <CardDescription>
            Verifica la consistencia matemática y lógica de los datos contables
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Período</label>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los períodos</SelectItem>
                  {periods.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.year} ({p.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleRun} disabled={isRunning || !currentEntId}>
              {isRunning ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Validando...</>
              ) : (
                <><Play className="h-4 w-4 mr-2" /> Ejecutar Validación</>
              )}
            </Button>
          </div>

          {/* Progress */}
          {isRunning && progress.length > 0 && (
            <div className="space-y-2">
              {progress.map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  {p.status === 'running' ? (
                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  ) : p.status === 'done' ? (
                    <ShieldCheck className="h-3 w-3 text-success" />
                  ) : (
                    <div className="h-3 w-3 rounded-full border" />
                  )}
                  <span className={p.status === 'running' ? 'font-medium' : 'text-muted-foreground'}>
                    {p.label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary */}
      {displaySummary && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-6 text-center">
                <div className={`text-3xl font-bold ${getHealthColor(displaySummary.healthScore)}`}>
                  {displaySummary.healthScore.toFixed(0)}%
                </div>
                <p className="text-sm text-muted-foreground">Puntaje de Salud</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <div className="text-3xl font-bold text-destructive">{displaySummary.totalErrors}</div>
                <p className="text-sm text-muted-foreground">Errores</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <div className="text-3xl font-bold text-yellow-600">{displaySummary.totalWarnings}</div>
                <p className="text-sm text-muted-foreground">Advertencias</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <div className="text-3xl font-bold text-blue-600">{displaySummary.totalInfo}</div>
                <p className="text-sm text-muted-foreground">Informativos</p>
              </CardContent>
            </Card>
          </div>

          {/* Results by category */}
          <div className="space-y-3">
            {Object.entries(CATEGORY_LABELS).map(([catId, catLabel]) => {
              const cat = categorizedResults[catId];
              if (!cat) return null;
              const total = cat.errors + cat.warnings + cat.info;

              return (
                <Collapsible key={catId}>
                  <Card>
                    <CollapsibleTrigger className="w-full">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <span>{catLabel}</span>
                            {cat.errors > 0 && <Badge variant="destructive">{cat.errors} errores</Badge>}
                            {cat.warnings > 0 && <Badge variant="secondary">{cat.warnings} advertencias</Badge>}
                            {total === 0 && <Badge variant="outline" className="text-success border-success">✓ Sin problemas</Badge>}
                          </CardTitle>
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="pt-0">
                        {cat.results.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No se encontraron problemas en esta categoría.</p>
                        ) : (
                          <div className="space-y-2">
                            {cat.results.map((result, idx) => {
                              const config = severityConfig[result.severity];
                              const Icon = config.icon;
                              return (
                                <div key={idx} className={`flex items-start gap-3 p-3 rounded-lg ${config.bg}`}>
                                  <Icon className={`h-4 w-4 mt-0.5 ${config.color} shrink-0`} />
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <Badge variant={config.badge} className="text-xs">{result.code}</Badge>
                                      <span className="text-sm font-medium">{result.message}</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">{result.details}</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground text-right">
            Última validación: {new Date(displaySummary.runAt).toLocaleString('es-GT')}
          </p>
        </>
      )}
    </div>
  );
}
