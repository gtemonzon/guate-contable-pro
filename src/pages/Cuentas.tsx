import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Upload, Download, BookOpen, Copy } from "lucide-react";
import { AccountDialog } from "@/components/cuentas/AccountDialog";
import { AccountTreeView } from "@/components/cuentas/AccountTreeView";
import { ImportAccountsDialog } from "@/components/cuentas/ImportAccountsDialog";
import { CopyAccountsCatalogDialog } from "@/components/cuentas/CopyAccountsCatalogDialog";
import type { Database } from "@/integrations/supabase/types";
import { getSafeErrorMessage } from "@/utils/errorMessages";

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
  const [typeFilter, setTypeFilter] = useState<string>("all");
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

  const filteredAccounts = (() => {
    const hasSearch = !!searchQuery.trim();
    const hasTypeFilter = typeFilter !== "all";
    if (!hasSearch && !hasTypeFilter) return accounts;

    // Cuentas que coinciden directamente con los filtros aplicados
    const matchingAccounts = accounts.filter((account) => {
      const matchesSearch = !hasSearch
        ? true
        : account.account_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
          account.account_name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = !hasTypeFilter ? true : account.account_type === typeFilter;
      return matchesSearch && matchesType;
    });

    // Incluir todos los ancestros para mantener el árbol navegable
    const accountsToShow = new Set<number>();
    matchingAccounts.forEach((account) => {
      accountsToShow.add(account.id);
      let currentAccount = account;
      while (currentAccount.parent_account_id) {
        accountsToShow.add(currentAccount.parent_account_id);
        const parent = accounts.find((acc) => acc.id === currentAccount.parent_account_id);
        if (!parent) break;
        currentAccount = parent;
      }
    });

    return accounts.filter((account) => accountsToShow.has(account.id));
  })();

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Catálogo de Cuentas</h1>
          <p className="text-muted-foreground">
            Gestiona el plan de cuentas contable
          </p>
        </div>
        <div className="flex gap-2">
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

      <Card>
        <CardHeader>
          <CardTitle>Buscar Cuentas</CardTitle>
          <CardDescription>
            Filtra por código, nombre o tipo de cuenta
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar cuenta..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Tipo de cuenta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="activo">Activo</SelectItem>
                <SelectItem value="pasivo">Pasivo</SelectItem>
                <SelectItem value="capital">Capital</SelectItem>
                <SelectItem value="ingreso">Ingreso</SelectItem>
                <SelectItem value="gasto">Gasto</SelectItem>
                <SelectItem value="costo">Costo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {filteredAccounts.length === 0 ? (
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
        <Card>
          <CardHeader>
            <CardTitle>Estructura del Catálogo</CardTitle>
            <CardDescription>
              Vista jerárquica de las cuentas contables
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AccountTreeView
              accounts={filteredAccounts}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onQuickCreate={handleQuickCreate}
            />
          </CardContent>
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
