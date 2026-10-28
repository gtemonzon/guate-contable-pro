import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Plus, Search, Upload, Download, BookOpen, Copy, X } from "lucide-react";
import { AccountDialog } from "@/components/cuentas/AccountDialog";
import { AccountTreeView } from "@/components/cuentas/AccountTreeView";
import { ImportAccountsDialog } from "@/components/cuentas/ImportAccountsDialog";
import { CopyAccountsCatalogDialog } from "@/components/cuentas/CopyAccountsCatalogDialog";
import type { Database, TablesUpdate } from "@/integrations/supabase/types";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { filterCatalog, getRootChips } from "@/utils/accountCatalogView";

const PILL_CLASS =
  "rounded-full border px-3 h-8 data-[state=on]:bg-foreground data-[state=on]:text-background data-[state=on]:border-foreground";

type Account = Database['public']['Tables']['tab_accounts']['Row'];

interface PresetConfig {
  suggestedCode: string;
  accountType: string;
  balanceType: string;
  parentAccountId: number | null;
  level: number;
  allowsMovement: boolean;
}

const Cuentas = () => {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [rootId, setRootId] = useState<number | null>(null);
  const [levelValue, setLevelValue] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [selectedEnterprise, setSelectedEnterprise] = useState<number | null>(null);
  const [presetConfig, setPresetConfig] = useState<PresetConfig | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Read URL params from global search
  useEffect(() => {
    const searchParam = searchParams.get("search");
    if (searchParam) {
      setSearchQuery(decodeURIComponent(searchParam));
      searchParams.delete("search");
      setSearchParams(searchParams, { replace: true });
    }
  }, []);

  useEffect(() => {
    fetchEnterprises();
    
    // Listen for enterprise changes
    const handleStorageChange = () => {
      fetchEnterprises();
    };
    
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const fetchEnterprises = async () => {
    try {
      // Get the selected enterprise from localStorage
      const currentEnterpriseId = localStorage.getItem("currentEnterpriseId");
      
      if (!currentEnterpriseId) {
        setLoading(false);
        return;
      }

      const enterpriseId = parseInt(currentEnterpriseId);
      setSelectedEnterprise(enterpriseId);
      fetchAccounts(enterpriseId);
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Error",
        description: getSafeErrorMessage(error),
      });
      setLoading(false);
    }
  };

  const fetchAccounts = async (enterpriseId: number) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('tab_accounts')
        .select('*')
        .eq('enterprise_id', enterpriseId)
        .order('account_code');

      if (error) throw error;
      setAccounts(data || []);
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Error al cargar cuentas",
        description: getSafeErrorMessage(error),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setSelectedAccount(null);
    setDialogOpen(true);
  };

  const handleEdit = (account: Account) => {
    setSelectedAccount(account);
    setDialogOpen(true);
  };

  // Optimistic inline update for quick-edit badges (no full tree reload).
  const handleInlineUpdate = async (
    accountId: number,
    field: 'account_type' | 'balance_type' | 'allows_movement',
    newValue: string | boolean
  ): Promise<{ ok: boolean; message?: string }> => {
    const start = performance.now();
    const current = accounts.find((a) => a.id === accountId);
    if (!current) return { ok: false, message: "Cuenta no encontrada" };
    const oldValue = current[field];

    // Optimistic patch — mutate only the affected node.
    setAccounts((prev) =>
      prev.map((a) => (a.id === accountId ? { ...a, [field]: newValue } as Account : a))
    );

    const { error } = await supabase
      .from('tab_accounts')
      .update({ [field]: newValue } as TablesUpdate<'tab_accounts'>)
      .eq('id', accountId);

    const ms = Math.round(performance.now() - start);
    console.debug('[inline-edit]', { accountId, field, oldValue, newValue, ms, error: error?.message });

    if (error) {
      // Rollback only the affected node.
      setAccounts((prev) =>
        prev.map((a) => (a.id === accountId ? { ...a, [field]: oldValue } as Account : a))
      );
      const message = getSafeErrorMessage(error);
      toast({ variant: "destructive", title: "No se pudo actualizar", description: message });
      return { ok: false, message };
    }
    return { ok: true };
  };

  const handleDelete = async (
    account: Account,
    childrenIds: number[],
    onProgress?: (current: number, total: number, currentName: string) => void
  ): Promise<{ canDelete: boolean; message?: string; deletedCount?: number }> => {
    try {
      // Get all account IDs to check (the account + all descendants)
      const allAccountIds = [account.id, ...childrenIds];
      
      // Check if any of these accounts have transactions
      const { data: transactions, error: checkError } = await supabase
        .from('tab_journal_entry_details')
        .select('id, account_id')
        .in('account_id', allAccountIds)
        .limit(1);

      if (checkError) throw checkError;

      if (transactions && transactions.length > 0) {
        // Find which account has transactions
        const accountWithTransactions = accounts.find(acc => acc.id === transactions[0].account_id);
        return {
          canDelete: false,
          message: `No se puede eliminar. La cuenta "${accountWithTransactions?.account_code} - ${accountWithTransactions?.account_name}" tiene movimientos en partidas contables.`
        };
      }

      // Delete all accounts (children first, then parent) - delete in reverse order by level
      const accountsToDelete = [account, ...accounts.filter(acc => childrenIds.includes(acc.id))]
        .sort((a, b) => b.level - a.level);

      const total = accountsToDelete.length;
      let processed = 0;
      onProgress?.(0, total, "");

      for (const acc of accountsToDelete) {
        processed++;
        onProgress?.(processed, total, `${acc.account_code} - ${acc.account_name}`);

        const { error: deleteError } = await supabase
          .from('tab_accounts')
          .delete()
          .eq('id', acc.id);

        if (deleteError) throw deleteError;
      }

      // Refresh accounts
      if (selectedEnterprise) {
        fetchAccounts(selectedEnterprise);
      }

      return { canDelete: true, deletedCount: total };
    } catch (error: unknown) {
      return {
        canDelete: false,
        message: getSafeErrorMessage(error)
      };
    }
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setSelectedAccount(null);
    setPresetConfig(null);
    if (selectedEnterprise) {
      fetchAccounts(selectedEnterprise);
    }
  };

  // Calculate the next sibling code based on the highest existing sibling under the SAME parent prefix
  const calculateNextSiblingCode = (referenceAccount: Account): string => {
    const refParts = referenceAccount.account_code.split('.');
    const parentPrefix = refParts.slice(0, -1).join('.'); // ej. "6.1" para "6.1.11"
    const refDepth = refParts.length;

    // Filtrar hermanos por prefijo de código (más confiable que parent_account_id)
    // y mismo nivel (misma cantidad de segmentos)
    const siblings = accounts.filter(acc => {
      const parts = acc.account_code.split('.');
      if (parts.length !== refDepth) return false;
      const accParentPrefix = parts.slice(0, -1).join('.');
      return accParentPrefix === parentPrefix;
    });

    if (siblings.length === 0) return referenceAccount.account_code;

    // Encontrar el número más alto entre los hermanos (no por orden alfabético)
    const refLastPart = refParts[refParts.length - 1];
    const paddingLength = refLastPart.length;
    let maxNum = 0;
    for (const sib of siblings) {
      const sibParts = sib.account_code.split('.');
      const lastPart = sibParts[sibParts.length - 1];
      const num = parseInt(lastPart, 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }

    const nextNum = (maxNum + 1).toString().padStart(paddingLength, '0');
    return [...refParts.slice(0, -1), nextNum].join('.');
  };

  // Calculate the next child code
  const calculateNextChildCode = (parentAccount: Account): string => {
    const children = accounts
      .filter(acc => acc.parent_account_id === parentAccount.id)
      .sort((a, b) => a.account_code.localeCompare(b.account_code));
    
    if (children.length === 0) {
      // No children yet, suggest first child
      return `${parentAccount.account_code}.1`;
    }
    
    const lastChild = children[children.length - 1];
    const parts = lastChild.account_code.split('.');
    const lastPart = parts[parts.length - 1];
    const numericPart = parseInt(lastPart);
    
    if (isNaN(numericPart)) {
      return `${parentAccount.account_code}.1`;
    }
    
    const paddingLength = lastPart.length;
    const nextNum = (numericPart + 1).toString().padStart(paddingLength, '0');
    parts[parts.length - 1] = nextNum;
    return parts.join('.');
  };

  const handleQuickCreate = (referenceAccount: Account, createType: 'sibling' | 'child') => {
    let suggestedCode: string;
    let parentAccountId: number | null;
    let level: number;
    let allowsMovement: boolean;

    if (createType === 'sibling') {
      parentAccountId = referenceAccount.parent_account_id;
      level = referenceAccount.level;
      allowsMovement = false;
      suggestedCode = calculateNextSiblingCode(referenceAccount);
    } else {
      parentAccountId = referenceAccount.id;
      level = referenceAccount.level + 1;
      allowsMovement = true;
      suggestedCode = calculateNextChildCode(referenceAccount);
    }

    setPresetConfig({
      suggestedCode,
      accountType: referenceAccount.account_type,
      balanceType: referenceAccount.balance_type || 'deudor',
      parentAccountId,
      level,
      allowsMovement,
    });
    
    setSelectedAccount(null);
    setDialogOpen(true);
  };

  const handleImportClose = () => {
    setImportDialogOpen(false);
    if (selectedEnterprise) {
      fetchAccounts(selectedEnterprise);
    }
  };

  const handleCopyClose = () => {
    setCopyDialogOpen(false);
    if (selectedEnterprise) {
      fetchAccounts(selectedEnterprise);
    }
  };

  const handleExportTemplate = () => {
    const csvContent = "codigo_cuenta,nombre_cuenta,tipo_cuenta,cuenta_padre,nivel,permite_movimiento,requiere_centro_costo\n" +
      "1,ACTIVO,activo,,1,false,false\n" +
      "1.1,ACTIVO CORRIENTE,activo,1,2,false,false\n" +
      "1.1.1,Caja y Bancos,activo,1.1,3,false,false\n" +
      "1.1.1.01,Caja General,activo,1.1.1,4,true,false\n";

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_cuentas.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    toast({
      title: "Plantilla descargada",
      description: "Usa esta plantilla para importar tu catálogo de cuentas",
    });
  };

  const filtered = filterCatalog(accounts, { query: searchQuery, rootId });
  const rootChips = getRootChips(accounts);
  const maxLevel = Math.min(6, accounts.reduce((m, a) => Math.max(m, a.level), 0));
  const levelOptions = Array.from({ length: maxLevel }, (_, i) => i + 1);
  const autoExpandAll = searchQuery.trim() !== "" || rootId !== null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!selectedEnterprise) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium mb-2">No hay empresa seleccionada</p>
          <p className="text-sm text-muted-foreground">
            Crea una empresa primero para gestionar su catálogo de cuentas
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100dvh-7rem)] lg:min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Catálogo de Cuentas</h1>
          <p className="text-sm text-muted-foreground">Gestiona el plan de cuentas contable</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setCopyDialogOpen(true)}>
            <Copy className="mr-2 h-4 w-4" />
            Copiar Catálogo
          </Button>
          <Button variant="outline" onClick={handleExportTemplate}>
            <Download className="mr-2 h-4 w-4" />
            Plantilla
          </Button>
          <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Importar
          </Button>
          <Button onClick={handleCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Nueva Cuenta
          </Button>
        </div>
      </div>

      {accounts.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col lg:flex-row lg:items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por código o nombre (ej. «sueldos», «6.2.1»)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-9"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Ver hasta el nivel:</span>
              <ToggleGroup
                type="single"
                value={levelValue}
                onValueChange={(v) => v && setLevelValue(v)}
                className="flex-wrap justify-start"
              >
                {levelOptions.map((n) => (
                  <ToggleGroupItem key={n} value={String(n)} size="sm" className={PILL_CLASS}>
                    Nivel {n}
                  </ToggleGroupItem>
                ))}
                <ToggleGroupItem value="all" size="sm" className={PILL_CLASS}>
                  Todos
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[{ id: null as number | null, code: "", label: "Todas" }, ...rootChips].map((chip) => {
              const active = rootId === chip.id;
              return (
                <button
                  key={chip.id ?? "all"}
                  type="button"
                  onClick={() => setRootId(chip.id)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors ${
                    active ? "bg-foreground text-background border-foreground" : "bg-card hover:bg-muted"
                  }`}
                >
                  {chip.code && (
                    <span
                      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold ${
                        active ? "bg-background text-foreground" : "bg-muted text-foreground"
                      }`}
                    >
                      {chip.code}
                    </span>
                  )}
                  {chip.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {filtered.matchedDetail} de {filtered.totalDetail} cuentas de detalle
          </p>
        </div>
      )}

      {accounts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">No hay cuentas registradas</p>
            <p className="text-sm text-muted-foreground mb-4">
              Comienza creando cuentas o importando un catálogo
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Importar Catálogo
              </Button>
              <Button onClick={handleCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Crear Cuenta
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden min-h-[420px] max-h-[70dvh] h-[70dvh] lg:h-auto lg:max-h-none lg:flex-1 lg:min-h-0">
          {filtered.visible.length === 0 ? (
            <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
              No hay cuentas que coincidan con los filtros.
            </div>
          ) : (
            <AccountTreeView
              accounts={filtered.visible}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onQuickCreate={handleQuickCreate}
              onInlineUpdate={handleInlineUpdate}
              levelLimit={levelValue === "all" ? null : Number(levelValue)}
              autoExpandAll={autoExpandAll}
            />
          )}
        </Card>
      )}

      <AccountDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setPresetConfig(null);
        }}
        account={selectedAccount}
        enterpriseId={selectedEnterprise}
        accounts={accounts}
        onSuccess={handleDialogClose}
        presetConfig={presetConfig}
      />

      <ImportAccountsDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        enterpriseId={selectedEnterprise}
        onSuccess={handleImportClose}
      />

      <CopyAccountsCatalogDialog
        open={copyDialogOpen}
        onOpenChange={setCopyDialogOpen}
        currentEnterpriseId={selectedEnterprise}
        onSuccess={handleCopyClose}
      />
    </div>
  );
};

export default Cuentas;
