export type InventorySortKey = "code" | "name" | "quantity-asc" | "quantity-desc";

interface SortableInventoryItem {
  sku: string;
  name: string;
  current_quantity: number;
}

/** Copia ordenada estable; los empates se resuelven por código. */
export function sortInventoryItems<T extends SortableInventoryItem>(
  items: readonly T[], key: InventorySortKey,
): T[] {
  return [...items].sort((a, b) => {
    const byCode = a.sku.localeCompare(b.sku, "es-GT");
    switch (key) {
      case "name": return a.name.localeCompare(b.name, "es-GT") || byCode;
      case "quantity-asc": return Number(a.current_quantity) - Number(b.current_quantity) || byCode;
      case "quantity-desc": return Number(b.current_quantity) - Number(a.current_quantity) || byCode;
      default: return byCode;
    }
  });
}