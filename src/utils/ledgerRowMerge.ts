/**
 * Mezcla de filas recargadas del servidor con las filas locales de Libros Fiscales.
 *
 * La recarga no debe pisar trabajo en curso: la fila que se está editando conserva
 * su versión local, las filas nuevas aún no guardadas se mantienen arriba y cada
 * fila ya existente conserva su clave local (`_uid` en compras, `client_id` en
 * ventas) para que React no remonte la tarjeta ni se pierda el foco.
 */

export interface LedgerRowLike {
  id?: number | null;
  isNew?: boolean;
}

export interface MergeFetchedRowsOptions<T> {
  /** Clave estable de la fila (compras: _uid; ventas: client_id). */
  keyOf: (row: T) => string | null | undefined;
  /** Devuelve la fila con la clave dada (para conservar la clave local en la recargada). */
  setKey: (row: T, key: string) => T;
  /** Claves cuya versión LOCAL se conserva (la fila en edición). */
  preserveKeys?: Iterable<string | null | undefined>;
}

/**
 * Devuelve las filas recargadas (`fetched`, en su orden) con estas reglas:
 * - Arriba, las filas locales nuevas sin guardar (isNew y sin id), en su orden local.
 * - Una fila recargada que ya existía localmente (mismo id) conserva la clave local;
 *   si esa clave está en `preserveKeys`, se usa la versión local completa.
 * - Una fila local preservada que ya no viene del servidor se mantiene (arriba, tras
 *   las nuevas) para no perder lo que se está escribiendo.
 * - Nunca hay dos filas con la misma clave ni con el mismo id.
 */
export function mergeFetchedRows<T extends LedgerRowLike>(
  local: readonly T[],
  fetched: readonly T[],
  { keyOf, setKey, preserveKeys }: MergeFetchedRowsOptions<T>,
): T[] {
  const preserve = new Set<string>();
  for (const k of preserveKeys ?? []) if (k) preserve.add(k);

  const localById = new Map<number, T>();
  for (const row of local) {
    if (row.id != null && !localById.has(row.id)) localById.set(row.id, row);
  }

  const result: T[] = [];
  const usedKeys = new Set<string>();
  const usedIds = new Set<number>();
  const push = (row: T) => {
    const key = keyOf(row);
    if (key && usedKeys.has(key)) return;
    if (row.id != null && usedIds.has(row.id)) return;
    if (key) usedKeys.add(key);
    if (row.id != null) usedIds.add(row.id);
    result.push(row);
  };

  // 1) Filas nuevas sin guardar, arriba y en su orden.
  for (const row of local) {
    if (row.isNew && row.id == null) push(row);
  }

  // 2) Filas locales preservadas que ya no vienen del servidor.
  const fetchedIds = new Set<number>();
  for (const row of fetched) if (row.id != null) fetchedIds.add(row.id);
  for (const row of local) {
    const key = keyOf(row);
    if (key && preserve.has(key) && row.id != null && !fetchedIds.has(row.id)) push(row);
  }

  // 3) Filas recargadas, en el orden del servidor.
  for (const row of fetched) {
    const existing = row.id != null ? localById.get(row.id) : undefined;
    if (!existing) {
      push(row);
      continue;
    }
    const localKey = keyOf(existing);
    if (localKey && preserve.has(localKey)) {
      push(existing);
    } else if (localKey) {
      push(setKey(row, localKey));
    } else {
      push(row);
    }
  }

  return result;
}

export interface WorkInProgressState {
  /** Claves en edición (compras y ventas); null = sin edición. */
  editingKeys: ReadonlyArray<string | null | undefined>;
  /** ¿Hay alguna fila nueva sin guardar? */
  hasUnsavedNewRows: boolean;
  /** Estado del indicador de guardado. */
  saveStatus: string;
}

/**
 * ¿Hay trabajo en curso que una recarga silenciosa (volver a la pestaña, evento de
 * sesión) podría pisar? Si devuelve true, la recarga se omite y se hace una sola vez
 * cuando termine la edición.
 */
export function shouldDeferSilentReload(state: WorkInProgressState): boolean {
  return (
    state.editingKeys.some((k) => !!k) ||
    state.hasUnsavedNewRows ||
    state.saveStatus === "saving"
  );
}
