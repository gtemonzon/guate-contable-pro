/**
 * useDashboardProgress — tracks loading state of dashboard modules
 * and exposes a progress ratio for the loading overlay.
 *
 * Accepts a `resetKey` that, when changed, resets all modules back to
 * "loading" so the overlay reappears on enterprise / period switches.
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

function buildInitialStatuses(): Record<string, ModuleStatus> {
  const init: Record<string, ModuleStatus> = {};
  MODULE_DEFS.forEach((m) => { init[m.id] = 'loading'; });
  return init;
}

export function useDashboardProgress(resetKey?: string) {
  const [statuses, setStatuses] = useState<Record<string, ModuleStatus>>(buildInitialStatuses);

  // Track the previous resetKey so we can detect changes
  const prevKeyRef = useRef(resetKey);

  useEffect(() => {
    if (prevKeyRef.current !== resetKey) {
      prevKeyRef.current = resetKey;
      // Reset all modules to loading
      setStatuses(buildInitialStatuses());
    }
  }, [resetKey]);

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
