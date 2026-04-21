import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Copy, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { fetchAllRecords } from "@/utils/supabaseHelpers";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import type { Database } from "@/integrations/supabase/types";

type Account = Database['public']['Tables']['tab_accounts']['Row'];
type Enterprise = Database['public']['Tables']['tab_enterprises']['Row'];

interface CatalogSummary {
  activo: number;
  pasivo: number;
  capital: number;
  ingreso: number;
  gasto: number;
  total: number;
}

interface CopyAccountsCatalogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentEnterpriseId: number;
  onSuccess: () => void;
}

export function CopyAccountsCatalogDialog({
  open,
  onOpenChange,
  currentEnterpriseId,
  onSuccess,
}: CopyAccountsCatalogDialogProps) {
  const { toast } = useToast();
  const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
  const [selectedEnterpriseId, setSelectedEnterpriseId] = useState<string>("");
  const [loadingEnterprises, setLoadingEnterprises] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [copying, setCopying] = useState(false);
  const [summary, setSummary] = useState<CatalogSummary | null>(null);
  const [existingAccountCodes, setExistingAccountCodes] = useState<Set<string>>(new Set());
  const [hasExistingAccounts, setHasExistingAccounts] = useState(false);
  const [copyProgress, setCopyProgress] = useState({ current: 0, total: 0, currentAccount: "" });

  useEffect(() => {
    if (open) {
      fetchEnterprises();
      checkExistingAccounts();
    }
  }, [open, currentEnterpriseId]);

  useEffect(() => {
    if (selectedEnterpriseId) {
      fetchCatalogSummary(parseInt(selectedEnterpriseId));
    } else {
      setSummary(null);
    }
  }, [selectedEnterpriseId]);

  const fetchEnterprises = async () => {
    setLoadingEnterprises(true);
    try {
      // Primero obtener el tenant_id de la empresa actual
      const { data: currentEnterprise, error: ceError } = await supabase
        .from('tab_enterprises')
        .select('tenant_id')
        .eq('id', currentEnterpriseId)
        .single();

      if (ceError) throw ceError;

      const currentTenantId = currentEnterprise?.tenant_id;

      // Obtener las empresas del usuario excluyendo la actual
      const { data: userEnterprises, error: ueError } = await supabase
        .from('tab_user_enterprises')
        .select('enterprise_id');

      if (ueError) throw ueError;

      const enterpriseIds = userEnterprises
        ?.map(ue => ue.enterprise_id)
        .filter((id): id is number => id !== null && id !== currentEnterpriseId) || [];

      if (enterpriseIds.length === 0) {
        setEnterprises([]);
        return;
      }

      // Filtrar por el mismo tenant de la empresa actual
      let query = supabase
        .from('tab_enterprises')
        .select('*')
        .in('id', enterpriseIds)
        .eq('is_active', true);

      if (currentTenantId) {
        query = query.eq('tenant_id', currentTenantId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setEnterprises(data || []);
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Error",
        description: getSafeErrorMessage(error),
      });
    } finally {
      setLoadingEnterprises(false);
    }
  };

  const checkExistingAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from('tab_accounts')
        .select('account_code')
        .eq('enterprise_id', currentEnterpriseId);

      if (error) throw error;

      const codes = new Set(data?.map(acc => acc.account_code) || []);
      setExistingAccountCodes(codes);
      setHasExistingAccounts(codes.size > 0);
    } catch (error) {
      console.error('Error checking existing accounts:', error);
    }
  };

  const fetchCatalogSummary = async (enterpriseId: number) => {
    setLoadingSummary(true);
    try {
      const { data, error } = await supabase
        .from('tab_accounts')
        .select('account_type')
        .eq('enterprise_id', enterpriseId);

      if (error) throw error;

      const summary: CatalogSummary = {
        activo: 0,
        pasivo: 0,
        capital: 0,
        ingreso: 0,
        gasto: 0,
        total: data?.length || 0,
      };

      data?.forEach(account => {
        const type = account.account_type as keyof Omit<CatalogSummary, 'total'>;
        if (type in summary) {
          summary[type]++;
        }
      });

      setSummary(summary);
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Error",
        description: getSafeErrorMessage(error),
      });
    } finally {
      setLoadingSummary(false);
    }
  };

  const handleCopy = async () => {
    if (!selectedEnterpriseId) return;

    setCopying(true);
    setCopyProgress({ current: 0, total: 0, currentAccount: "" });
    try {
      // Obtener todas las cuentas de la empresa origen
      const sourceAccounts = await fetchAllRecords<Account>(
        supabase
          .from('tab_accounts')
          .select('*')
          .eq('enterprise_id', parseInt(selectedEnterpriseId))
          .order('level')
          .order('account_code')
      );

      if (sourceAccounts.length === 0) {
        toast({
          variant: "destructive",
          title: "Sin cuentas",
          description: "La empresa seleccionada no tiene cuentas para copiar",
        });
        return;
      }

      // Filtrar cuentas que ya existen en la empresa destino
      const accountsToInsert = sourceAccounts.filter(
        acc => !existingAccountCodes.has(acc.account_code)
      );

      if (accountsToInsert.length === 0) {
        toast({
          variant: "destructive",
          title: "Cuentas duplicadas",
          description: "Todas las cuentas de la empresa origen ya existen en la empresa destino",
        });
        return;
      }

      // Mapear IDs antiguos a nuevos para mantener jerarquía
      const oldToNewIdMap = new Map<number, number>();

      // Agrupar cuentas por nivel para insertarlas en orden
      const accountsByLevel = new Map<number, Account[]>();
      accountsToInsert.forEach(account => {
        const level = account.level;
        if (!accountsByLevel.has(level)) {
          accountsByLevel.set(level, []);
        }
        accountsByLevel.get(level)!.push(account);
      });

      // Ordenar niveles e insertar en orden
      const sortedLevels = Array.from(accountsByLevel.keys()).sort((a, b) => a - b);

      let totalInserted = 0;
      let processed = 0;
      const totalToProcess = accountsToInsert.length;
      setCopyProgress({ current: 0, total: totalToProcess, currentAccount: "" });

      for (const level of sortedLevels) {
        const levelAccounts = accountsByLevel.get(level)!;
        
        for (const account of levelAccounts) {
          processed++;
          setCopyProgress({
            current: processed,
            total: totalToProcess,
            currentAccount: `${account.account_code} - ${account.account_name}`,
          });
          // Determinar el parent_account_id correcto
          let newParentId: number | null = null;
          
          if (account.parent_account_id) {
            // Buscar si el padre fue insertado
            newParentId = oldToNewIdMap.get(account.parent_account_id) || null;
            
            // Si el padre no fue insertado, buscar si ya existe en la empresa destino
            if (!newParentId) {
              const parentAccount = sourceAccounts.find(a => a.id === account.parent_account_id);
              if (parentAccount) {
                const { data: existingParent } = await supabase
                  .from('tab_accounts')
                  .select('id')
                  .eq('enterprise_id', currentEnterpriseId)
                  .eq('account_code', parentAccount.account_code)
                  .maybeSingle();
                
                if (existingParent) {
                  newParentId = existingParent.id;
                }
              }
            }
          }

          // Insertar la cuenta
          const { data: insertedAccount, error: insertError } = await supabase
            .from('tab_accounts')
            .insert({
              enterprise_id: currentEnterpriseId,
              account_code: account.account_code,
              account_name: account.account_name,
              account_type: account.account_type,
              level: account.level,
              parent_account_id: newParentId,
              allows_movement: account.allows_movement,
              requires_cost_center: account.requires_cost_center,
              is_active: account.is_active,
              is_bank_account: account.is_bank_account,
              balance_type: account.balance_type,
            })
            .select('id')
            .single();

          if (insertError) {
            console.error('Error inserting account:', account.account_code, insertError);
            continue;
          }

          if (insertedAccount) {
            oldToNewIdMap.set(account.id, insertedAccount.id);
            totalInserted++;
          }
        }
      }

      const skipped = sourceAccounts.length - accountsToInsert.length;

      toast({
        title: "Catálogo copiado",
        description: `Se copiaron ${totalInserted} cuentas${skipped > 0 ? `. ${skipped} cuentas omitidas por duplicado` : ''}`,
      });

      onOpenChange(false);
      onSuccess();
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Error al copiar",
        description: getSafeErrorMessage(error),
      });
    } finally {
      setCopying(false);
      setCopyProgress({ current: 0, total: 0, currentAccount: "" });
    }
  };

  const handleClose = () => {
    if (copying) return;
    setSelectedEnterpriseId("");
    setSummary(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Copiar Catálogo de Otra Empresa
          </DialogTitle>
          <DialogDescription>
            Copia el catálogo de cuentas de otra empresa a la empresa actual
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Empresa origen</label>
            {loadingEnterprises ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : enterprises.length === 0 ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  No tienes acceso a otras empresas para copiar su catálogo
                </AlertDescription>
              </Alert>
            ) : (
              <Select
                value={selectedEnterpriseId}
                onValueChange={setSelectedEnterpriseId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una empresa..." />
                </SelectTrigger>
                <SelectContent>
                  {enterprises.map((enterprise) => (
                    <SelectItem key={enterprise.id} value={enterprise.id.toString()}>
                      {enterprise.business_name} ({enterprise.nit})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {loadingSummary && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {summary && !loadingSummary && (
            <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Resumen del catálogo:
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Activo:</span>
                  <span className="font-medium">{summary.activo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pasivo:</span>
                  <span className="font-medium">{summary.pasivo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Capital:</span>
                  <span className="font-medium">{summary.capital}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ingreso:</span>
                  <span className="font-medium">{summary.ingreso}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Gasto:</span>
                  <span className="font-medium">{summary.gasto}</span>
                </div>
              </div>
              <div className="border-t pt-2 flex justify-between text-sm font-medium">
                <span>Total cuentas:</span>
                <span>{summary.total}</span>
              </div>
            </div>
          )}

          {hasExistingAccounts && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                La empresa destino ya tiene cuentas. Las cuentas con códigos duplicados serán omitidas.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={copying}>
            Cancelar
          </Button>
          <Button
            onClick={handleCopy}
            disabled={!selectedEnterpriseId || copying || enterprises.length === 0}
          >
            {copying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Copiando...
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                Copiar Catálogo
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
