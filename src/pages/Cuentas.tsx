import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Upload, Download, BookOpen } from "lucide-react";
import { AccountDialog } from "@/components/cuentas/AccountDialog";
import { AccountTreeView } from "@/components/cuentas/AccountTreeView";
import { ImportAccountsDialog } from "@/components/cuentas/ImportAccountsDialog";
import type { Database } from "@/integrations/supabase/types";
import { getSafeErrorMessage } from "@/utils/errorMessages";

type Account = Database['public']['Tables']['tab_accounts']['Row'];

const Cuentas = () => {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [selectedEnterprise, setSelectedEnterprise] = useState<number | null>(null);

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
    } catch (error: any) {
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
    } catch (error: any) {
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

  const handleDialogClose = () => {
    setDialogOpen(false);
    setSelectedAccount(null);
    if (selectedEnterprise) {
      fetchAccounts(selectedEnterprise);
    }
  };

  const handleImportClose = () => {
    setImportDialogOpen(false);
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
    if (!searchQuery.trim()) {
      return accounts;
    }

    // Encontrar todas las cuentas que coinciden con la búsqueda
    const matchingAccounts = accounts.filter((account) =>
      account.account_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      account.account_name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Incluir todos los ancestros de las cuentas coincidentes
    const accountsToShow = new Set<number>();
    
    matchingAccounts.forEach((account) => {
      accountsToShow.add(account.id);
      
      // Agregar todos los ancestros
      let currentAccount = account;
      while (currentAccount.parent_account_id) {
        accountsToShow.add(currentAccount.parent_account_id);
        const parent = accounts.find(acc => acc.id === currentAccount.parent_account_id);
        if (!parent) break;
        currentAccount = parent;
      }
    });

    return accounts.filter(account => accountsToShow.has(account.id));
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
            Filtra por código o nombre de cuenta
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar cuenta..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
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
            />
          </CardContent>
        </Card>
      )}

      <AccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        account={selectedAccount}
        enterpriseId={selectedEnterprise}
        accounts={accounts}
        onSuccess={handleDialogClose}
      />

      <ImportAccountsDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        enterpriseId={selectedEnterprise}
        onSuccess={handleImportClose}
      />
    </div>
  );
};

export default Cuentas;
