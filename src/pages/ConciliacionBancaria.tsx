import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BadgeCheck, Building2, Calendar, Landmark } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Account = Database['public']['Tables']['tab_accounts']['Row'];
type AccountingPeriod = Database['public']['Tables']['tab_accounting_periods']['Row'];
type BankMovement = Database['public']['Tables']['tab_bank_movements']['Row'];

const ConciliacionBancaria = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<Account[]>([]);
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [movements, setMovements] = useState<BankMovement[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [selectedPeriod, setSelectedPeriod] = useState<string>("");
  const [bankBalance, setBankBalance] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [selectedMovements, setSelectedMovements] = useState<Set<number>>(new Set());
  const [selectedEnterprise, setSelectedEnterprise] = useState<string | null>(null);

  useEffect(() => {
    const currentEnterpriseId = localStorage.getItem("currentEnterpriseId");
    if (currentEnterpriseId) {
      setSelectedEnterprise(currentEnterpriseId);
      fetchBankAccounts(currentEnterpriseId);
      fetchPeriods(currentEnterpriseId);
    }
  }, []);

  useEffect(() => {
    if (selectedAccount && selectedPeriod) {
      fetchMovements();
    }
  }, [selectedAccount, selectedPeriod]);

  const fetchBankAccounts = async (enterpriseId: string) => {
    try {
      const { data, error } = await supabase
        .from('tab_accounts')
        .select('*')
        .eq('enterprise_id', parseInt(enterpriseId))
        .eq('is_bank_account', true)
        .eq('is_active', true)
        .order('account_code');

      if (error) throw error;
      setBankAccounts(data || []);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error al cargar cuentas bancarias",
        description: error.message,
      });
    }
  };

  const fetchPeriods = async (enterpriseId: string) => {
    try {
      const { data, error } = await supabase
        .from('tab_accounting_periods')
        .select('*')
        .eq('enterprise_id', parseInt(enterpriseId))
        .order('start_date', { ascending: false });

      if (error) throw error;
      setPeriods(data || []);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error al cargar períodos",
        description: error.message,
      });
    }
  };

  const fetchMovements = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('tab_bank_movements')
        .select('*')
        .eq('bank_account_id', parseInt(selectedAccount))
        .order('movement_date', { ascending: false });

      if (error) throw error;
      setMovements(data || []);
      
      // Pre-select already reconciled movements
      const reconciledIds = new Set(
        data?.filter(m => m.is_reconciled).map(m => m.id) || []
      );
      setSelectedMovements(reconciledIds);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error al cargar movimientos",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleMovement = (movementId: number) => {
    const newSelected = new Set(selectedMovements);
    if (newSelected.has(movementId)) {
      newSelected.delete(movementId);
    } else {
      newSelected.add(movementId);
    }
    setSelectedMovements(newSelected);
  };

  const calculateBalances = () => {
    const reconciled = movements
      .filter(m => selectedMovements.has(m.id))
      .reduce((sum, m) => sum + (m.debit_amount - m.credit_amount), 0);
    
    const pending = movements
      .filter(m => !selectedMovements.has(m.id))
      .reduce((sum, m) => sum + (m.debit_amount - m.credit_amount), 0);
    
    return { reconciled, pending };
  };

  const handleReconcile = async () => {
    if (!selectedAccount || !selectedPeriod || !bankBalance) {
      toast({
        variant: "destructive",
        title: "Datos incompletos",
        description: "Debes seleccionar cuenta, período e ingresar el saldo bancario",
      });
      return;
    }

    try {
      setLoading(true);
      
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Usuario no autenticado");

      // Calculate book balance from selected movements
      const bookBalance = movements
        .filter(m => selectedMovements.has(m.id))
        .reduce((sum, m) => sum + (m.debit_amount - m.credit_amount), 0);

      // Create reconciliation record
      const { data: reconciliation, error: recError } = await supabase
        .from('tab_bank_reconciliations')
        .insert([{
          bank_account_id: parseInt(selectedAccount),
          reconciliation_date: new Date().toISOString().split('T')[0],
          bank_statement_balance: parseFloat(bankBalance),
          book_balance: bookBalance,
          adjustments: 0,
          reconciled_balance: bookBalance,
          status: 'completed',
          created_by: user.user.id,
          notes: notes || null,
        }])
        .select()
        .single();

      if (recError) throw recError;

      // Update selected movements
      const movementIds = Array.from(selectedMovements);
      const { error: updateError } = await supabase
        .from('tab_bank_movements')
        .update({
          is_reconciled: true,
          reconciliation_id: reconciliation.id,
        })
        .in('id', movementIds);

      if (updateError) throw updateError;

      // Update unselected movements
      const unselectedIds = movements
        .filter(m => !selectedMovements.has(m.id))
        .map(m => m.id);
      
      if (unselectedIds.length > 0) {
        await supabase
          .from('tab_bank_movements')
          .update({
            is_reconciled: false,
            reconciliation_id: null,
          })
          .in('id', unselectedIds);
      }

      toast({
        title: "Conciliación completada",
        description: `Se conciliaron ${movementIds.length} movimientos`,
      });

      // Reset form
      setSelectedAccount("");
      setSelectedPeriod("");
      setBankBalance("");
      setNotes("");
      setSelectedMovements(new Set());
      setMovements([]);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error al conciliar",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const balances = calculateBalances();

  if (!selectedEnterprise) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium mb-2">No hay empresa seleccionada</p>
          <p className="text-sm text-muted-foreground">
            Selecciona una empresa para realizar conciliaciones bancarias
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Conciliación Bancaria</h1>
        <p className="text-muted-foreground">
          Concilia los movimientos bancarios con el estado de cuenta
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Landmark className="h-5 w-5" />
              Cuenta Bancaria
            </CardTitle>
            <CardDescription>Selecciona la cuenta a conciliar</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona una cuenta bancaria" />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id.toString()}>
                    {account.account_code} - {account.account_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Período Contable
            </CardTitle>
            <CardDescription>Selecciona el período a conciliar</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un período" />
              </SelectTrigger>
              <SelectContent>
                {periods.map((period) => (
                  <SelectItem key={period.id} value={period.id.toString()}>
                    {period.year} - {new Date(period.start_date).toLocaleDateString()} al {new Date(period.end_date).toLocaleDateString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>

      {selectedAccount && selectedPeriod && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Saldo del Estado de Cuenta</CardTitle>
              <CardDescription>Ingresa el saldo que aparece en tu estado de cuenta bancario</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="bank-balance">Saldo Bancario</Label>
                <Input
                  id="bank-balance"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={bankBalance}
                  onChange={(e) => setBankBalance(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="notes">Notas (opcional)</Label>
                <Input
                  id="notes"
                  placeholder="Observaciones sobre la conciliación"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Movimientos Bancarios</CardTitle>
              <CardDescription>
                Marca los movimientos que aparecen en el estado de cuenta
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : movements.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No hay movimientos para este período
                </p>
              ) : (
                <div className="space-y-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <BadgeCheck className="h-4 w-4" />
                        </TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movements.map((movement) => (
                        <TableRow key={movement.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedMovements.has(movement.id)}
                              onCheckedChange={() => toggleMovement(movement.id)}
                            />
                          </TableCell>
                          <TableCell>{new Date(movement.movement_date).toLocaleDateString()}</TableCell>
                          <TableCell>{movement.description}</TableCell>
                          <TableCell>
                            <span className={`text-sm ${movement.debit_amount > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                              {movement.debit_amount > 0 ? 'Depósito' : 'Retiro'}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            Q {(movement.debit_amount || movement.credit_amount).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <div className="grid gap-4 md:grid-cols-3 pt-4 border-t">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Movimientos Conciliados</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">Q {balances.reconciled.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {selectedMovements.size} movimientos
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Movimientos Pendientes</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">Q {balances.pending.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {movements.length - selectedMovements.size} movimientos
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Diferencia</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className={`text-2xl font-bold ${Math.abs(balances.reconciled - parseFloat(bankBalance || '0')) < 0.01 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          Q {(balances.reconciled - parseFloat(bankBalance || '0')).toFixed(2)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          vs. Saldo bancario
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="flex justify-end pt-4">
                    <Button onClick={handleReconcile} disabled={loading || !bankBalance}>
                      <BadgeCheck className="mr-2 h-4 w-4" />
                      Guardar Conciliación
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default ConciliacionBancaria;
