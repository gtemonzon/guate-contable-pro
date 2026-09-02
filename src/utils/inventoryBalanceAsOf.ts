import { supabase } from "@/integrations/supabase/client";
import { fetchAllRecords } from "@/utils/supabaseHelpers";

/**
 * Réplica exacta en el cliente de la lógica de los triggers
 * `inventory_movement_before_insert` / `inventory_movement_after_insert`:
 *  - entrada            -> recalcula el costo promedio ponderado
 *  - ajuste positivo    -> suma cantidad, conserva el costo
 *  - salida / ajuste neg-> resta cantidad, conserva el costo
 * Todos los valores se redondean a 4 decimales igual que en la base de datos.
 */

export type InventoryMovementType = "entrada" | "salida" | "ajuste";
export type InventoryAdjustmentDirection = "positivo" | "negativo";

export interface BalanceMovement {
  item_id: number;
  movement_type: InventoryMovementType;
  adjustment_direction: InventoryAdjustmentDirection | null;
  quantity: number;
  unit_cost: number;
  movement_date: string;
  id: number;
  reference?: string | null;
  notes?: string | null;
}

interface RawMovement {
  id: number;
  item_id: number;
  movement_type: string;
  adjustment_direction: string | null;
  quantity: number;
  unit_cost: number;
  movement_date: string;
  reference: string | null;
  notes: string | null;
}

export interface ItemBalance {
  quantity: number;
  unitCost: number;
  value: number;
}

export const ZERO_BALANCE: ItemBalance = { quantity: 0, unitCost: 0, value: 0 };

const round4 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 10000) / 10000;
const round2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

export function isDecreaseMovement(m: Pick<BalanceMovement, "movement_type" | "adjustment_direction">): boolean {
  return m.movement_type === "salida" || (m.movement_type === "ajuste" && m.adjustment_direction === "negativo");
}

export function normalizeMovement(r: RawMovement): BalanceMovement {
  const type: InventoryMovementType =
    r.movement_type === "entrada" || r.movement_type === "salida" || r.movement_type === "ajuste"
      ? r.movement_type
      : "ajuste";
  const dir: InventoryAdjustmentDirection | null =
    r.adjustment_direction === "positivo" || r.adjustment_direction === "negativo"
      ? r.adjustment_direction
      : null;
  return {
    id: r.id,
    item_id: r.item_id,
    movement_type: type,
    adjustment_direction: dir,
    quantity: Number(r.quantity) || 0,
    unit_cost: Number(r.unit_cost) || 0,
    movement_date: r.movement_date,
    reference: r.reference,
    notes: r.notes,
  };
}

/** Orden cronológico estable: fecha, luego id (mismo criterio que el kardex). */
export function sortChronologically(movements: BalanceMovement[]): BalanceMovement[] {
  return [...movements].sort((a, b) =>
    a.movement_date === b.movement_date ? a.id - b.id : a.movement_date < b.movement_date ? -1 : 1
  );
}

/** Aplica un movimiento sobre un saldo, replicando el trigger de la base de datos. */
export function applyMovement(balance: ItemBalance, m: BalanceMovement): ItemBalance {
  const qty = round4(balance.quantity);
  const cost = round4(balance.unitCost);

  if (m.movement_type === "entrada") {
    const newQty = round4(qty + m.quantity);
    const newCost =
      qty <= 0
        ? round4(m.unit_cost)
        : newQty === 0
          ? round4(cost)
          : round4((qty * cost + m.quantity * m.unit_cost) / (qty + m.quantity));
    return { quantity: newQty, unitCost: newCost, value: round2(newQty * newCost) };
  }

  if (m.movement_type === "ajuste" && m.adjustment_direction === "positivo") {
    const newQty = round4(qty + m.quantity);
    return { quantity: newQty, unitCost: cost, value: round2(newQty * cost) };
  }

  const newQty = round4(qty - m.quantity);
  return { quantity: newQty, unitCost: cost, value: round2(newQty * cost) };
}

/** Calcula el saldo resultante de una secuencia de movimientos (se ordena internamente). */
export function balanceFromMovements(movements: BalanceMovement[]): ItemBalance {
  let balance = ZERO_BALANCE;
  for (const m of sortChronologically(movements)) balance = applyMovement(balance, m);
  return balance;
}

/**
 * Trae TODOS los movimientos de la empresa hasta `asOfDate` (inclusive) en una
 * sola consulta paginada, y devuelve el saldo por producto a esa fecha.
 */
export async function fetchBalancesAsOf(
  enterpriseId: number,
  asOfDate: string
): Promise<Map<number, ItemBalance>> {
  const movements = await fetchMovementsUpTo(enterpriseId, asOfDate);
  return balancesByItem(movements);
}

/** Agrupa movimientos ya cargados por producto y calcula el saldo de cada uno. */
export function balancesByItem(movements: BalanceMovement[]): Map<number, ItemBalance> {
  const grouped = new Map<number, BalanceMovement[]>();
  for (const m of movements) {
    const list = grouped.get(m.item_id);
    if (list) list.push(m);
    else grouped.set(m.item_id, [m]);
  }
  const result = new Map<number, ItemBalance>();
  grouped.forEach((list, itemId) => result.set(itemId, balanceFromMovements(list)));
  return result;
}

/** Consulta paginada de movimientos de la empresa con `movement_date <= asOfDate`. */
export async function fetchMovementsUpTo(
  enterpriseId: number,
  asOfDate: string
): Promise<BalanceMovement[]> {
  const rows = await fetchAllRecords<RawMovement>(() =>
    supabase
      .from("tab_inventory_movements")
      .select("id,item_id,movement_type,adjustment_direction,quantity,unit_cost,movement_date,reference,notes")
      .eq("enterprise_id", enterpriseId)
      .lte("movement_date", asOfDate)
      .order("movement_date", { ascending: true })
      .order("id", { ascending: true })
  );
  return rows.map(normalizeMovement);
}

export interface PeriodFlowRow {
  itemId: number;
  opening: ItemBalance;
  inQuantity: number;
  inValue: number;
  outQuantity: number;
  outValue: number;
  closing: ItemBalance;
  /** true si Saldo Inicial + Entradas − Salidas = Saldo Final (tolerancia 0.01). */
  reconciles: boolean;
}

/**
 * Entradas, salidas y saldos de todos los productos en un rango de fechas.
 * El saldo inicial se calcula con los movimientos anteriores a `dateFrom`,
 * y el saldo final con todos los movimientos hasta `dateTo`.
 */
export async function fetchPeriodFlows(
  enterpriseId: number,
  dateFrom: string,
  dateTo: string
): Promise<PeriodFlowRow[]> {
  const allMovements = await fetchMovementsUpTo(enterpriseId, dateTo);

  const before = allMovements.filter((m) => m.movement_date < dateFrom);
  const inRange = allMovements.filter((m) => m.movement_date >= dateFrom && m.movement_date <= dateTo);

  const openingByItem = balancesByItem(before);
  const closingByItem = balancesByItem(allMovements);

  const itemIds = new Set<number>([
    ...openingByItem.keys(),
    ...closingByItem.keys(),
    ...inRange.map((m) => m.item_id),
  ]);

  const rows: PeriodFlowRow[] = [];
  itemIds.forEach((itemId) => {
    const opening = openingByItem.get(itemId) ?? ZERO_BALANCE;
    const closing = closingByItem.get(itemId) ?? ZERO_BALANCE;

    let inQuantity = 0;
    let inValue = 0;
    let outQuantity = 0;
    let outValue = 0;

    // Se recorre el histórico completo para conocer el costo vigente en cada
    // movimiento del rango (las salidas se valoran al promedio del momento).
    let running = opening;
    for (const m of sortChronologically(inRange.filter((mv) => mv.item_id === itemId))) {
      const nextBalance = applyMovement(running, m);
      if (isDecreaseMovement(m)) {
        outQuantity = round4(outQuantity + m.quantity);
        outValue = round2(outValue + m.quantity * running.unitCost);
      } else {
        inQuantity = round4(inQuantity + m.quantity);
        const entryCost = m.movement_type === "entrada" ? m.unit_cost : running.unitCost;
        inValue = round2(inValue + m.quantity * entryCost);
      }
      running = nextBalance;
    }

    const expectedQty = round4(opening.quantity + inQuantity - outQuantity);
    const reconciles = Math.abs(expectedQty - closing.quantity) <= 0.01;

    rows.push({ itemId, opening, inQuantity, inValue, outQuantity, outValue, closing, reconciles });
  });

  return rows;
}
