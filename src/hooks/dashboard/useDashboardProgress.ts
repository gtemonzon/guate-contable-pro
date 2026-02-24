/**
 * useDashboardProgress — tracks loading state of dashboard modules
 * and exposes a progress ratio for the loading overlay.
 */
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';

export type ModuleStatus = 'loading' | 'ready' | 'error';

export interface DashboardModule {
  id: string;
  label: string;
  status: ModuleStatus;
}

const MODULE_DEFS: { id: string; label: string }[] = [
  { id: 'kpis',            label: 'Indicadores financieros' },
  { id: 'pendingEntries',  label: 'Partidas pendientes' },
  { id: 'bankBalances',    label: 'Saldos bancarios' },
  { id: 'taxData',         label: 'Datos fiscales' },
  { id: 'recentEntries',   label: 'Últimas partidas' },
  { id: 'bookSummaries',   label: 'Resumen libros' },
  { id: 'charts',          label: 'Gráficas anuales' },
  { id: 'cardConfig',      label: 'Configuración' },
];

export function useDashboardProgress() {
  const [statuses, setStatuses] = useState<Record<string, ModuleStatus>>(() => {
    const init: Record<string, ModuleStatus> = {};
    MODULE_DEFS.forEach((m) => { init[m.id] = 'loading'; });
    return init;
  });

  const setModuleStatus = useCallback((id: string, status: ModuleStatus) => {
    setStatuses((prev) => {
      if (prev[id] === status) return prev;
      return { ...prev, [id]: status };
    });
  }, []);

  const modules: DashboardModule[] = useMemo(
    () => MODULE_DEFS.map((m) => ({ ...m, status: statuses[m.id] || 'loading' })),
    [statuses],
  );

  const readyCount = modules.filter((m) => m.status === 'ready' || m.status === 'error').length;
  const totalCount = modules.length;
  const progress = totalCount > 0 ? Math.round((readyCount / totalCount) * 100) : 0;
  const allDone = readyCount >= totalCount;

  return { modules, readyCount, totalCount, progress, allDone, setModuleStatus };
}
