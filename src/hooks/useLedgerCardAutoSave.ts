import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/** Resultado del guardado: false = no se guardó (la fila sigue con cambios pendientes). */
export type LedgerSaveResult = boolean | void;

/**
 * Motivo del guardado: "auto" (pausa al escribir, pestaña oculta, desmontaje) no
 * avisa si falta algo; "manual" (guardar/cerrar, cambiar de factura…) sí.
 */
export interface LedgerSaveOptions {
  reason: "auto" | "manual";
}

interface UseLedgerCardAutoSaveOptions {
  /** Clave estable de la fila (compras: _uid; ventas: client_id). */
  rowKey: string;
  /** Guarda la fila por su clave. */
  onSave: (rowKey: string, opts: LedgerSaveOptions) => LedgerSaveResult | Promise<LedgerSaveResult>;
  /** Tarjeta: para devolver el foco al campo activo tras el autoguardado. */
  cardRef: RefObject<HTMLElement>;
  delayMs?: number;
}

/**
 * Autoguardado de una tarjeta de libro fiscal (compras/ventas).
 *
 * - Los cambios pendientes se llevan en refs, así ningún temporizador ni el
 *   desmontaje guardan con un closure viejo.
 * - El temporizador se reinicia con cada cambio y guarda al pausar (2.5 s).
 * - `flush()` cancela el temporizador y guarda YA lo pendiente; devuelve si se
 *   guardó (el padre no cambia de fila ni cierra si devuelve false).
 * - Al ocultarse la pestaña con cambios pendientes se guarda de inmediato, y
 *   `beforeunload` avisa solo mientras hay cambios sin guardar.
 */
export function useLedgerCardAutoSave({ rowKey, onSave, cardRef, delayMs = 2500 }: UseLedgerCardAutoSaveOptions) {
  const [hasChanges, setHasChanges] = useState(false);
  const [changeTick, setChangeTick] = useState(0);
  const hasChangesRef = useRef(false);
  const changeTickRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyRef = useRef(rowKey);
  keyRef.current = rowKey;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** Registra un cambio del usuario (reinicia el temporizador). */
  const markChanged = useCallback(() => {
    hasChangesRef.current = true;
    changeTickRef.current += 1;
    setHasChanges(true);
    setChangeTick((t) => t + 1);
  }, []);

  /** Guarda ahora. Solo queda "limpia" si se guardó y no hubo cambios mientras tanto. */
  const runSave = useCallback(async (reason: LedgerSaveOptions["reason"]): Promise<boolean> => {
    clearTimer();
    const tickAtStart = changeTickRef.current;
    let ok: boolean;
    try {
      ok = (await onSaveRef.current(keyRef.current, { reason })) !== false;
    } catch {
      ok = false;
    }
    if (ok && changeTickRef.current === tickAtStart) {
      hasChangesRef.current = false;
      setHasChanges(false);
    }
    return ok;
  }, [clearTimer]);

  /**
   * Guarda lo pendiente (si lo hay) y devuelve si quedó guardado.
   * `force` guarda aunque no haya cambios registrados (p. ej. disco en fila nueva).
   */
  const flush = useCallback(async (opts?: { force?: boolean }): Promise<boolean> => {
    clearTimer();
    if (!hasChangesRef.current && !opts?.force) return true;
    return runSave("manual");
  }, [clearTimer, runSave]);

  // Autoguardado con debounce: el temporizador se reinicia con cada cambio.
  useEffect(() => {
    if (!hasChanges) return;
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const activeEl = document.activeElement as HTMLElement | null;
      const activeId = cardRef.current?.contains(activeEl) ? activeEl?.id : null;
      const restoreFocus = () => {
        if (!activeId) return;
        window.requestAnimationFrame(() => {
          window.setTimeout(() => {
            const el = document.getElementById(activeId);
            const current = document.activeElement;
            if (el && document.contains(el) && (!current || current === document.body)) el.focus();
          }, 50);
        });
      };
      void runSave("auto").then(restoreFocus);
      restoreFocus();
    }, delayMs);
    return clearTimer;
  }, [changeTick, hasChanges, delayMs, cardRef, clearTimer, runSave]);

  // Pestaña oculta con cambios pendientes: guardar de inmediato.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && hasChangesRef.current) void runSave("auto");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [runSave]);

  // Aviso al cerrar/recargar la página solo si hay cambios sin guardar.
  useEffect(() => {
    if (!hasChanges) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasChanges]);

  // Al desmontar con cambios pendientes: guardar (sin esperar) con la clave y el
  // callback más recientes.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (hasChangesRef.current) {
        hasChangesRef.current = false;
        void Promise.resolve()
          .then(() => onSaveRef.current(keyRef.current, { reason: "auto" }))
          .catch(() => {});
      }
    };
  }, []);

  /** Descarta los cambios pendientes sin guardar (fila eliminada/descartada). */
  const discard = useCallback(() => {
    clearTimer();
    hasChangesRef.current = false;
    setHasChanges(false);
  }, [clearTimer]);

  return { hasChanges, markChanged, flush, discard };
}
