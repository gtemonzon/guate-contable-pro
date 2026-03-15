import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useFinancialStatementFormat, FormatType, Section, SectionAccount } from '@/hooks/useFinancialStatementFormat';
import { FinancialStatementSection } from './FinancialStatementSection';
import { Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Account {
  id: number;
  account_code: string;
  account_name: string;
  account_type: string;
  level: number;
  allows_movement: boolean;
}

const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  activo: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  pasivo: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
  capital: 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200',
  ingreso: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  gasto: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  costo: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
};

export function FinancialStatementDesigner() {
  const [currentEnterpriseId, setCurrentEnterpriseId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<FormatType>('balance_general');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [localSections, setLocalSections] = useState<Section[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  const { format, loading, saveFormat, deleteFormat, reloadFormat } = useFinancialStatementFormat(
    currentEnterpriseId,
    activeTab
  );

  useEffect(() => {
    const enterpriseId = localStorage.getItem('currentEnterpriseId');
    if (enterpriseId) {
      setCurrentEnterpriseId(Number(enterpriseId));
    }
  }, []);

  useEffect(() => {
    const loadAccounts = async () => {
      if (!currentEnterpriseId) return;
      
      setLoadingAccounts(true);
      try {
        // Filter by account type based on the active tab
        const accountTypes = activeTab === 'balance_general' 
          ? ['activo', 'pasivo', 'capital']
          : ['ingreso', 'gasto'];

        const { data, error } = await supabase
          .from('tab_accounts')
          .select('id, account_code, account_name, account_type, level, allows_movement')
          .eq('enterprise_id', currentEnterpriseId)
          .eq('is_active', true)
          .in('account_type', accountTypes)
          .lte('level', 2) // Only show parent accounts (level 1 and 2)
          .order('account_code');

        if (error) throw error;
        setAccounts(data || []);
      } catch (error) {
        console.error('Error loading accounts:', error);
      } finally {
        setLoadingAccounts(false);
      }
    };

    loadAccounts();
  }, [currentEnterpriseId, activeTab]);

  useEffect(() => {
    if (format) {
      setLocalSections(format.sections);
    } else {
      // Create default sections based on format type
      if (activeTab === 'balance_general') {
        setLocalSections([
          { section_name: 'ACTIVO CORRIENTE', section_type: 'group', display_order: 1, show_in_report: true, accounts: [] },
          { section_name: 'ACTIVO NO CORRIENTE', section_type: 'group', display_order: 2, show_in_report: true, accounts: [] },
          { section_name: 'TOTAL ACTIVO', section_type: 'total', display_order: 3, show_in_report: true, accounts: [] },
          { section_name: 'PASIVO CORRIENTE', section_type: 'group', display_order: 4, show_in_report: true, accounts: [] },
          { section_name: 'PASIVO NO CORRIENTE', section_type: 'group', display_order: 5, show_in_report: true, accounts: [] },
          { section_name: 'TOTAL PASIVO', section_type: 'total', display_order: 6, show_in_report: true, accounts: [] },
          { section_name: 'CAPITAL', section_type: 'group', display_order: 7, show_in_report: true, accounts: [] },
          { section_name: 'RESULTADO DEL PERÍODO', section_type: 'calculated', display_order: 8, show_in_report: true, accounts: [] },
          { section_name: 'TOTAL CAPITAL', section_type: 'total', display_order: 9, show_in_report: true, accounts: [] },
        ]);
      } else {
        setLocalSections([
          { section_name: 'INGRESOS', section_type: 'group', display_order: 1, show_in_report: true, accounts: [] },
          { section_name: 'TOTAL INGRESOS', section_type: 'subtotal', display_order: 2, show_in_report: true, accounts: [] },
          { section_name: 'COSTOS', section_type: 'group', display_order: 3, show_in_report: true, accounts: [] },
          { section_name: 'UTILIDAD BRUTA', section_type: 'calculated', display_order: 4, show_in_report: true, accounts: [] },
          { section_name: 'GASTOS DE OPERACIÓN', section_type: 'group', display_order: 5, show_in_report: true, accounts: [] },
          { section_name: 'UTILIDAD DE OPERACIÓN', section_type: 'calculated', display_order: 6, show_in_report: true, accounts: [] },
          { section_name: 'OTROS INGRESOS Y GASTOS', section_type: 'group', display_order: 7, show_in_report: true, accounts: [] },
          { section_name: 'UTILIDAD NETA', section_type: 'total', display_order: 8, show_in_report: true, accounts: [] },
        ]);
      }
    }
    setHasChanges(false);
  }, [format, activeTab]);

  const handleDragStart = (e: React.DragEvent, account: Account) => {
    e.dataTransfer.setData('account', JSON.stringify(account));
  };

  const handleDropOnSection = (sectionIndex: number) => (e: React.DragEvent) => {
    const accountData = e.dataTransfer.getData('account');
    if (!accountData) return;

    const account: Account = JSON.parse(accountData);
    
    // Check if account is already in any section
    const isAlreadyUsed = localSections.some(s => 
      s.accounts.some(a => a.account_id === account.id)
    );

    if (isAlreadyUsed) {
      toast.error('Esta cuenta ya está asignada a una sección');
      return;
    }

    const newSections = [...localSections];
    const newAccount: SectionAccount = {
      account_id: account.id,
      display_order: newSections[sectionIndex].accounts.length + 1,
      sign_multiplier: 1,
      include_children: true,
      account_code: account.account_code,
      account_name: account.account_name,
    };

    newSections[sectionIndex].accounts.push(newAccount);
    setLocalSections(newSections);
    setHasChanges(true);
  };

  const handleUpdateSection = (index: number, section: Section) => {
    const newSections = [...localSections];
    newSections[index] = section;
    setLocalSections(newSections);
    setHasChanges(true);
  };

  const handleDeleteSection = (index: number) => {
    const newSections = localSections.filter((_, i) => i !== index);
    // Update display orders
    newSections.forEach((s, i) => s.display_order = i + 1);
    setLocalSections(newSections);
    setHasChanges(true);
  };

  const handleMoveSection = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= localSections.length) return;

    const newSections = [...localSections];
    [newSections[index], newSections[newIndex]] = [newSections[newIndex], newSections[index]];
    // Update display orders
    newSections.forEach((s, i) => s.display_order = i + 1);
    setLocalSections(newSections);
    setHasChanges(true);
  };

  const handleRemoveAccount = (sectionIndex: number, accountIndex: number) => {
    const newSections = [...localSections];
    newSections[sectionIndex].accounts.splice(accountIndex, 1);
    // Update display orders
    newSections[sectionIndex].accounts.forEach((a, i) => a.display_order = i + 1);
    setLocalSections(newSections);
    setHasChanges(true);
  };

  const handleAddSection = () => {
    const newSection: Section = {
      section_name: 'Nueva Sección',
      section_type: 'group',
      display_order: localSections.length + 1,
      show_in_report: true,
      accounts: [],
    };
    setLocalSections([...localSections, newSection]);
    setHasChanges(true);
  };

  const handleSave = async () => {
    const formatName = activeTab === 'balance_general' ? 'Balance General' : 'Estado de Resultados';
    
    await saveFormat({
      id: format?.id,
      enterprise_id: currentEnterpriseId!,
      format_type: activeTab,
      name: formatName,
      is_active: true,
      sections: localSections,
    });
    setHasChanges(false);
  };

  const handleDelete = async () => {
    if (confirm('¿Está seguro de eliminar este formato? Se usará la configuración por defecto.')) {
      await deleteFormat();
      setHasChanges(false);
    }
  };

  const getUsedAccountIds = () => {
    return new Set(localSections.flatMap(s => s.accounts.map(a => a.account_id)));
  };

  if (!currentEnterpriseId) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-center">
            Seleccione una empresa para configurar los formatos de estados financieros.
          </p>
        </CardContent>
      </Card>
    );
  }

  const usedAccountIds = getUsedAccountIds();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Diseñador de Estados Financieros</CardTitle>
        <CardDescription>
          Arrastre las cuentas padre a las secciones correspondientes para configurar el formato de sus reportes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as FormatType)}>
          <TabsList className="mb-4">
            <TabsTrigger value="balance_general">Balance General</TabsTrigger>
            <TabsTrigger value="estado_resultados">Estado de Resultados</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab}>
            {loading || loadingAccounts ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Left Panel - Available Accounts */}
                <div className="lg:col-span-1">
                  <div className="sticky top-4">
                    <h3 className="font-medium mb-2">Cuentas Disponibles</h3>
                    <ScrollArea className="h-[500px] border rounded-md p-2">
                      <div className="space-y-1">
                        {accounts.map((account) => {
                          const isUsed = usedAccountIds.has(account.id);
                          return (
                            <div
                              key={account.id}
                              draggable={!isUsed}
                              onDragStart={(e) => handleDragStart(e, account)}
                              className={`p-2 rounded-md text-sm cursor-grab ${
                                isUsed 
                                  ? 'bg-muted/30 text-muted-foreground opacity-50 cursor-not-allowed' 
                                  : 'bg-muted hover:bg-muted/80'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span>
                                  <span className="font-mono text-xs">{account.account_code}</span>
                                  {' '}
                                  {account.account_name}
                                </span>
                                <Badge variant="outline" className={`text-xs ${ACCOUNT_TYPE_COLORS[account.account_type]}`}>
                                  {account.account_type}
                                </Badge>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </div>
                </div>

                {/* Right Panel - Sections */}
                <div className="lg:col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium">Secciones del Reporte</h3>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={handleAddSection}>
                        <Plus className="h-4 w-4 mr-1" />
                        Agregar Sección
                      </Button>
                      {format && (
                        <Button variant="outline" size="sm" onClick={handleDelete}>
                          <Trash2 className="h-4 w-4 mr-1" />
                          Eliminar Formato
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-3 pr-4">
                      {localSections.map((section, index) => (
                        <FinancialStatementSection
                          key={index}
                          section={section}
                          index={index}
                          totalSections={localSections.length}
                          onUpdate={(s) => handleUpdateSection(index, s)}
                          onDelete={() => handleDeleteSection(index)}
                          onMoveUp={() => handleMoveSection(index, 'up')}
                          onMoveDown={() => handleMoveSection(index, 'down')}
                          onRemoveAccount={(accountIndex) => handleRemoveAccount(index, accountIndex)}
                          onDrop={handleDropOnSection(index)}
                        />
                      ))}
                    </div>
                  </ScrollArea>

                  <div className="flex justify-end mt-4">
                    <Button onClick={handleSave} disabled={loading || !hasChanges}>
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      Guardar Formato
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
