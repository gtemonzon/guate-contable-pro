import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { AccountCombobox, Account } from '@/components/ui/account-combobox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useEnterpriseConfig } from '@/hooks/useEnterpriseConfig';
import { Loader2, Save, AlertCircle } from 'lucide-react';

export function EnterpriseAccountsManager() {
  const [currentEnterpriseId, setCurrentEnterpriseId] = useState<number | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  
  const { config, loading, saveConfig } = useEnterpriseConfig(currentEnterpriseId);

  const [formData, setFormData] = useState({
    vat_credit_account_id: null as number | null,
    vat_debit_account_id: null as number | null,
    period_result_account_id: null as number | null,
    retained_earnings_account_id: null as number | null,
    purchases_account_id: null as number | null,
    sales_account_id: null as number | null,
    customers_account_id: null as number | null,
    suppliers_account_id: null as number | null,
    inventory_account_id: null as number | null,
    cost_of_sales_method: 'manual' as 'manual' | 'coeficiente',
    cost_of_sales_account_id: null as number | null,
    unrealized_fx_gain_account_id: null as number | null,
    unrealized_fx_loss_account_id: null as number | null,
    realized_fx_gain_account_id: null as number | null,
    realized_fx_loss_account_id: null as number | null,
    default_auditor_name: '' as string,
    default_auditor_colegiado: '' as string,
    payroll_salaries_expense_account_id: null as number | null,
    payroll_bonificacion_expense_account_id: null as number | null,
    payroll_igss_patronal_expense_account_id: null as number | null,
    payroll_indemnizacion_expense_account_id: null as number | null,
    payroll_aguinaldo_expense_account_id: null as number | null,
    payroll_bono14_expense_account_id: null as number | null,
    payroll_vacaciones_expense_account_id: null as number | null,
    payroll_igss_payable_account_id: null as number | null,
    payroll_isr_payable_account_id: null as number | null,
    payroll_salaries_payable_account_id: null as number | null,
    payroll_indemnizacion_provision_account_id: null as number | null,
    payroll_aguinaldo_bono14_provision_account_id: null as number | null,
  });

  useEffect(() => {
    const enterpriseId = localStorage.getItem('currentEnterpriseId');
    if (enterpriseId) {
      setCurrentEnterpriseId(Number(enterpriseId));
    }
  }, []);

  useEffect(() => {
    if (config) {
      setFormData({
        vat_credit_account_id: config.vat_credit_account_id,
        vat_debit_account_id: config.vat_debit_account_id,
        period_result_account_id: config.period_result_account_id,
        retained_earnings_account_id: config.retained_earnings_account_id,
        purchases_account_id: config.purchases_account_id,
        sales_account_id: config.sales_account_id,
        customers_account_id: config.customers_account_id,
        suppliers_account_id: config.suppliers_account_id,
        inventory_account_id: config.inventory_account_id,
        cost_of_sales_method: config.cost_of_sales_method || 'manual',
        cost_of_sales_account_id: config.cost_of_sales_account_id,
        unrealized_fx_gain_account_id: config.unrealized_fx_gain_account_id ?? null,
        unrealized_fx_loss_account_id: config.unrealized_fx_loss_account_id ?? null,
        realized_fx_gain_account_id: config.realized_fx_gain_account_id ?? null,
        realized_fx_loss_account_id: config.realized_fx_loss_account_id ?? null,
        default_auditor_name: config.default_auditor_name ?? '',
        default_auditor_colegiado: config.default_auditor_colegiado ?? '',
        payroll_salaries_expense_account_id: config.payroll_salaries_expense_account_id ?? null,
        payroll_bonificacion_expense_account_id: config.payroll_bonificacion_expense_account_id ?? null,
        payroll_igss_patronal_expense_account_id: config.payroll_igss_patronal_expense_account_id ?? null,
        payroll_indemnizacion_expense_account_id: config.payroll_indemnizacion_expense_account_id ?? null,
        payroll_aguinaldo_expense_account_id: config.payroll_aguinaldo_expense_account_id ?? null,
        payroll_bono14_expense_account_id: config.payroll_bono14_expense_account_id ?? null,
        payroll_vacaciones_expense_account_id: config.payroll_vacaciones_expense_account_id ?? null,
        payroll_igss_payable_account_id: config.payroll_igss_payable_account_id ?? null,
        payroll_isr_payable_account_id: config.payroll_isr_payable_account_id ?? null,
        payroll_salaries_payable_account_id: config.payroll_salaries_payable_account_id ?? null,
        payroll_indemnizacion_provision_account_id: config.payroll_indemnizacion_provision_account_id ?? null,
        payroll_aguinaldo_bono14_provision_account_id: config.payroll_aguinaldo_bono14_provision_account_id ?? null,
      });
    }
  }, [config]);

  useEffect(() => {
    const loadAccounts = async () => {
      if (!currentEnterpriseId) return;
      
      setLoadingAccounts(true);
      try {
        const { data, error } = await supabase
          .from('tab_accounts')
          .select('id, account_code, account_name, account_type')
          .eq('enterprise_id', currentEnterpriseId)
          .eq('is_active', true)
          .eq('allows_movement', true)
          .order('account_code');

        if (error) throw error;
        setAccounts((data || []).map(a => ({
          id: Number(a.id),
          account_code: a.account_code,
          account_name: a.account_name,
        })));
      } catch (error) {
        console.error('Error loading accounts:', error);
      } finally {
        setLoadingAccounts(false);
      }
    };

    loadAccounts();
  }, [currentEnterpriseId]);

  const handleSave = async () => {
    await saveConfig({
      vat_credit_account_id: formData.vat_credit_account_id,
      vat_debit_account_id: formData.vat_debit_account_id,
      period_result_account_id: formData.period_result_account_id,
      retained_earnings_account_id: formData.retained_earnings_account_id,
      purchases_account_id: formData.purchases_account_id,
      sales_account_id: formData.sales_account_id,
      customers_account_id: formData.customers_account_id,
      suppliers_account_id: formData.suppliers_account_id,
      inventory_account_id: formData.inventory_account_id,
      cost_of_sales_method: formData.cost_of_sales_method,
      cost_of_sales_account_id: formData.cost_of_sales_account_id,
      unrealized_fx_gain_account_id: formData.unrealized_fx_gain_account_id,
      unrealized_fx_loss_account_id: formData.unrealized_fx_loss_account_id,
      realized_fx_gain_account_id: formData.realized_fx_gain_account_id,
      realized_fx_loss_account_id: formData.realized_fx_loss_account_id,
    });
  };

  if (!currentEnterpriseId) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-center">
            Seleccione una empresa para configurar las cuentas contables.
          </p>
        </CardContent>
      </Card>
    );
  }

  const accountFields = [
    { key: 'vat_credit_account_id', label: 'IVA Crédito Fiscal', description: 'Cuenta para registrar el IVA de compras' },
    { key: 'vat_debit_account_id', label: 'IVA Débito Fiscal', description: 'Cuenta para registrar el IVA de ventas' },
    { key: 'period_result_account_id', label: 'Resultado del Período', description: 'Cuenta para acumular utilidad/pérdida del ejercicio' },
    { key: 'retained_earnings_account_id', label: 'Utilidades Acumuladas', description: 'Cuenta de capital para trasladar el resultado del ejercicio al cierre anual' },
    { key: 'inventory_account_id', label: 'Inventario de Mercaderías', description: 'Cuenta de inventario (se usa para calcular inventario inicial y final)' },
    { key: 'purchases_account_id', label: 'Compras', description: 'Cuenta para registrar las compras' },
    { key: 'sales_account_id', label: 'Ventas', description: 'Cuenta para registrar las ventas' },
    { key: 'customers_account_id', label: 'Clientes', description: 'Cuenta de cuentas por cobrar' },
    { key: 'suppliers_account_id', label: 'Proveedores', description: 'Cuenta de cuentas por pagar' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cuentas Contables Especiales</CardTitle>
        <CardDescription>
          Configure las cuentas que se utilizarán automáticamente en pólizas y reportes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loadingAccounts || loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {accountFields.map(({ key, label, description }) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={key}>{label}</Label>
                  <AccountCombobox
                    accounts={accounts}
                    value={formData[key as keyof typeof formData] as number | null}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, [key]: value }))}
                    placeholder={`Seleccionar ${label.toLowerCase()}`}
                  />
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
              ))}
            </div>

            <Separator />

            {/* Costo de Ventas Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Costo de Ventas</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Método de Costo de Ventas</Label>
                  <Select
                    value={formData.cost_of_sales_method}
                    onValueChange={(value: 'manual' | 'coeficiente') =>
                      setFormData(prev => ({ ...prev, cost_of_sales_method: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual</SelectItem>
                      <SelectItem value="coeficiente">Por Coeficiente (Inventario Periódico)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {formData.cost_of_sales_method === 'manual'
                      ? 'El usuario registra el costo de ventas manualmente'
                      : 'El sistema calcula automáticamente durante el cierre del período'}
                  </p>
                </div>

                {formData.cost_of_sales_method === 'coeficiente' && (
                  <div className="space-y-2">
                    <Label>Cuenta de Costo de Ventas</Label>
                    <AccountCombobox
                      accounts={accounts}
                      value={formData.cost_of_sales_account_id}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, cost_of_sales_account_id: value }))}
                      placeholder="Seleccionar cuenta de costo de ventas"
                    />
                    <p className="text-xs text-muted-foreground">
                      Cuenta donde se registrará el costo de ventas calculado
                    </p>
                  </div>
                )}
              </div>

              {formData.cost_of_sales_method === 'coeficiente' && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Al usar el método por coeficiente, el sistema calculará automáticamente:
                    <br />
                    <strong>Costo de Ventas = Inventario Inicial + Compras - Inventario Final</strong>
                    <br />
                    El inventario inicial se toma del saldo acumulado de la cuenta de inventario.
                    El inventario final debe ingresarse manualmente durante el cierre del período.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <Separator />

            {/* Diferencial Cambiario Section */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">Diferencial Cambiario</h3>
                <p className="text-sm text-muted-foreground">
                  Cuentas usadas para registrar ganancias y pérdidas por tipo de cambio en operaciones en moneda extranjera.
                </p>
              </div>

              <div className="space-y-1">
                <h4 className="text-sm font-medium">No Realizado (revaluación de saldos al cierre del mes)</h4>
                <p className="text-xs text-muted-foreground">
                  Se usan en la partida <code className="text-[10px] bg-muted px-1 rounded">DIFC-NR-YYYY-MM</code> generada por el wizard de Revaluación FX.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Ganancia Cambiaria NO Realizada</Label>
                  <AccountCombobox
                    accounts={accounts}
                    value={formData.unrealized_fx_gain_account_id}
                    onValueChange={(v) => setFormData(p => ({ ...p, unrealized_fx_gain_account_id: v }))}
                    placeholder="Seleccionar cuenta de ingreso"
                  />
                  <p className="text-xs text-muted-foreground">Típicamente cuenta de ingreso "Ganancia por diferencial cambiario no realizado".</p>
                </div>
                <div className="space-y-2">
                  <Label>Pérdida Cambiaria NO Realizada</Label>
                  <AccountCombobox
                    accounts={accounts}
                    value={formData.unrealized_fx_loss_account_id}
                    onValueChange={(v) => setFormData(p => ({ ...p, unrealized_fx_loss_account_id: v }))}
                    placeholder="Seleccionar cuenta de gasto"
                  />
                  <p className="text-xs text-muted-foreground">Típicamente cuenta de gasto "Pérdida por diferencial cambiario no realizado".</p>
                </div>
              </div>

              <div className="space-y-1 pt-2">
                <h4 className="text-sm font-medium">Realizado (al liquidar facturas en moneda extranjera)</h4>
                <p className="text-xs text-muted-foreground">
                  Se usan en la partida <code className="text-[10px] bg-muted px-1 rounded">DIFC-R-YYYY-MM</code> generada al pagar/cobrar facturas en USD u otra moneda.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Ganancia Cambiaria Realizada</Label>
                  <AccountCombobox
                    accounts={accounts}
                    value={formData.realized_fx_gain_account_id}
                    onValueChange={(v) => setFormData(p => ({ ...p, realized_fx_gain_account_id: v }))}
                    placeholder="Seleccionar cuenta de ingreso"
                  />
                  <p className="text-xs text-muted-foreground">Típicamente cuenta de ingreso "Ganancia por diferencial cambiario realizado".</p>
                </div>
                <div className="space-y-2">
                  <Label>Pérdida Cambiaria Realizada</Label>
                  <AccountCombobox
                    accounts={accounts}
                    value={formData.realized_fx_loss_account_id}
                    onValueChange={(v) => setFormData(p => ({ ...p, realized_fx_loss_account_id: v }))}
                    placeholder="Seleccionar cuenta de gasto"
                  />
                  <p className="text-xs text-muted-foreground">Típicamente cuenta de gasto "Pérdida por diferencial cambiario realizado".</p>
                </div>
              </div>

              {(!formData.realized_fx_gain_account_id || !formData.realized_fx_loss_account_id ||
                !formData.unrealized_fx_gain_account_id || !formData.unrealized_fx_loss_account_id) && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Configura las cuatro cuentas para que el sistema pueda generar partidas de diferencial cambiario automáticamente. Sin ellas, los wizards de Revaluación FX y Liquidación de facturas en moneda extranjera mostrarán un error.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={loading}>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Guardar Configuración
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
