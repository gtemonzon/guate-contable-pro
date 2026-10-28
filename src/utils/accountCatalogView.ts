// ============= accountCatalogView =============
// Utilidades puras para la vista del catálogo de cuentas: filtros, chips de
// rubro y expansión por nivel. No dependen de React ni de la base de datos.
import type { Database } from "@/integrations/supabase/types";

type AccountRow = Database["public"]["Tables"]["tab_accounts"]["Row"];

export type CatalogAccount = Pick<
  AccountRow,
  "id" | "account_code" | "account_name" | "parent_account_id" | "level" | "allows_movement"
>;

/** Minúsculas y sin acentos, para comparar sin distinguir mayúsculas ni tildes. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export interface CatalogFilter {
  query: string;
  rootId: number | null;
}

export interface CatalogFilterResult<T extends CatalogAccount> {
  visible: T[];
  matchedDetail: number;
  totalDetail: number;
}

/** Ids de la cuenta raíz y todo su subárbol. */
function subtreeIds<T extends CatalogAccount>(accounts: T[], rootId: number): Set<number> {
  const childrenByParent = new Map<number, number[]>();
  for (const a of accounts) {
    if (a.parent_account_id == null) continue;
    const arr = childrenByParent.get(a.parent_account_id);
    if (arr) arr.push(a.id);
    else childrenByParent.set(a.parent_account_id, [a.id]);
  }
  const out = new Set<number>();
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop() as number;
    if (out.has(cur)) continue;
    out.add(cur);
    for (const k of childrenByParent.get(cur) ?? []) stack.push(k);
  }
  return out;
}

export function filterCatalog<T extends CatalogAccount>(
  accounts: T[],
  { query, rootId }: CatalogFilter,
): CatalogFilterResult<T> {
  const totalDetail = accounts.filter((a) => a.allows_movement === true).length;
  const q = normalizeText(query);
  const scope = rootId != null ? accounts.filter((a) => subtreeIds(accounts, rootId).has(a.id)) : accounts;

  if (!q) {
    return {
      visible: scope,
      matchedDetail: scope.filter((a) => a.allows_movement === true).length,
      totalDetail,
    };
  }

  const byId = new Map<number, T>();
  for (const a of accounts) byId.set(a.id, a);
  const scopeIds = new Set(scope.map((a) => a.id));

  const matches = scope.filter(
    (a) => normalizeText(a.account_code).includes(q) || normalizeText(a.account_name).includes(q),
  );
  const show = new Set<number>();
  for (const m of matches) {
    let cur: T | undefined = m;
    while (cur && !show.has(cur.id)) {
      show.add(cur.id);
      cur = cur.parent_account_id != null ? byId.get(cur.parent_account_id) : undefined;
      if (cur && !scopeIds.has(cur.id)) break;
    }
  }
  return {
    visible: accounts.filter((a) => show.has(a.id)),
    matchedDetail: matches.filter((a) => a.allows_movement === true).length,
    totalDetail,
  };
}

const CONNECTORS = new Set(["de", "del", "la", "el", "los", "las", "y", "e", "en", "por", "para"]);

/** "COSTO DE PRODUCCION" => "Costo de Produccion" (conserva acentos). */
export function formatChipLabel(name: string): string {
  return name
    .trim()
    .toLocaleLowerCase("es")
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) =>
      i > 0 && CONNECTORS.has(w) ? w : w.charAt(0).toLocaleUpperCase("es") + w.slice(1),
    )
    .join(" ");
}

export interface RootChip {
  id: number;
  code: string;
  label: string;
}

export function getRootChips<T extends CatalogAccount>(accounts: T[]): RootChip[] {
  return accounts
    .filter((a) => a.parent_account_id == null)
    .sort((a, b) => a.account_code.localeCompare(b.account_code, "es", { numeric: true }))
    .map((a) => ({ id: a.id, code: a.account_code, label: formatChipLabel(a.account_name) }));
}

/** Ids de cuentas con hijos que deben quedar expandidas para ver hasta el nivel indicado. */
export function groupsToExpand<T extends CatalogAccount>(
  accounts: T[],
  levelLimit: number | null,
): number[] {
  const parents = new Set<number>();
  for (const a of accounts) if (a.parent_account_id != null) parents.add(a.parent_account_id);
  return accounts
    .filter((a) => parents.has(a.id) && (levelLimit === null || a.level < levelLimit))
    .map((a) => a.id);
}
