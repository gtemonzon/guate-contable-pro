export type AccountOption = { id: number; account_code: string; account_name: string };

const normalize = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const uniqueSorted = (list: AccountOption[]): AccountOption[] => {
  const map = new Map<number, AccountOption>();
  for (const acc of list) if (!map.has(acc.id)) map.set(acc.id, acc);
  return [...map.values()].sort((a, b) => a.account_code.localeCompare(b.account_code));
};

export function isLikelyFixedAssetAccount(code: string, name: string): boolean {
  if (!/^1\.?2/.test(code)) return false;
  const n = normalize(name);
  return !n.includes("deprec") && !n.includes("amortiz");
}

export function buildAssetAccountOptions({
  movementAccounts,
  categoryAssetAccountIds,
}: {
  movementAccounts: AccountOption[];
  categoryAssetAccountIds: number[];
}): AccountOption[] {
  const ids = new Set(categoryAssetAccountIds);
  return uniqueSorted(
    movementAccounts.filter(
      (a) => ids.has(a.id) || isLikelyFixedAssetAccount(a.account_code, a.account_name),
    ),
  );
}

export function getPurchaseAccountOptions({
  operationTypeCode,
  expenseAccounts,
  assetAccounts,
  selectedAccountId,
}: {
  operationTypeCode: string | null | undefined;
  expenseAccounts: AccountOption[];
  assetAccounts: AccountOption[];
  selectedAccountId: number | null | undefined;
}): AccountOption[] {
  const useAssets = operationTypeCode?.toUpperCase() === "ACTIVOS_FIJOS" && assetAccounts.length > 0;
  const base = useAssets ? assetAccounts : expenseAccounts;
  const result = [...base];
  if (selectedAccountId != null && !base.some((a) => a.id === selectedAccountId)) {
    const found = [...expenseAccounts, ...assetAccounts].find((a) => a.id === selectedAccountId);
    if (found) result.push(found);
  }
  return uniqueSorted(result);
}

export function getAccountLookup(
  expenseAccounts: AccountOption[],
  assetAccounts: AccountOption[],
): AccountOption[] {
  return uniqueSorted([...expenseAccounts, ...assetAccounts]);
}
