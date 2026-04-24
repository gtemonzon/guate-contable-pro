import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, Calculator, FileText, Loader2, AlertCircle } from 'lucide-react';
import { usePayrollEntries, type PayrollPeriod } from '@/hooks/usePayrollPeriods';
import { useEnterpriseConfig } from '@/hooks/useEnterpriseConfig';
import { calculatePayrollPosting, postPayroll } from '@/hooks/usePayrollPosting';
import { ImportPayrollDialog } from './ImportPayrollDialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useEffect } from 'react';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  period: PayrollPeriod;
  onUpdated: () => void;
}

interface AccountInfo {
  id: number;
  account_code: string;
  account_name: string;
}

export function PayrollDetailDialog({ open, onOpenChange, period, onUpdated }: Props) {
  const { entries, replaceEntries, reload } = usePayrollEntries(period.id);
  const { config } = useEnterpriseConfig(period.enterprise_id);
  const [importOpen, setImportOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const [accountsMap, setAccountsMap] = useState<Map<number, AccountInfo>>(new Map());

  useEffect(() => {
    if (!open) return;
    supabase.from('tab_accounts').select('id,account_code,account_name').eq('enterprise_id', period.enterprise_id).then(({ data }) => {
      const m = new Map<number, AccountInfo>();
      (data || []).forEach((a) => m.set(a.id, a as AccountInfo));
      setAccountsMap(m);
    });
  }, [open, period.enterprise_id]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { lines, warnings } = config ? calculatePayrollPosting(entries, config as any) : { lines: [], warnings: [] };

  const handlePost = async () => {
    if (!config) return;
    setPosting(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ok = await postPayroll(period, entries, config as any);
    setPosting(false);
    if (ok) { onUpdated(); onOpenChange(false); }
  };

  const totalDebit = lines.reduce((s, l) => s + l.debit_amount, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit_amount, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Nómina {String(period.period_month).padStart(2, '0')}/{period.period_year}
            <Badge className="ml-2" variant={period.status === 'posted' ? 'default' : 'secondary'}>
              {period.status}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">{entries.length} empleados · Líquido: Q {entries.reduce((s, e) => s + e.net_pay, 0).toFixed(2)}</p>
            {period.status !== 'posted' && (
              <Button onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />Importar Excel
              </Button>
            )}
          </div>

          {entries.length > 0 && (
            <>
              <div className="border rounded-lg overflow-x-auto max-h-[300px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empleado</TableHead>
                      <TableHead className="text-right">Base</TableHead>
                      <TableHead className="text-right">Boni</TableHead>
                      <TableHead className="text-right">IGSS</TableHead>
                      <TableHead className="text-right">ISR</TableHead>
                      <TableHead className="text-right">Líquido</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell>
                          <p className="font-medium">{e.employee_name}</p>
                          <p className="text-xs text-muted-foreground">{e.employee_position || '—'}</p>
                        </TableCell>
                        <TableCell className="text-right font-mono">{e.base_salary.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono">{e.bonificacion_decreto.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono">{e.igss_laboral.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono">{e.isr_retained.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">{e.net_pay.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                <div className="flex items-center gap-2">
                  <Calculator className="h-4 w-4" />
                  <h3 className="font-semibold">Vista previa de la póliza contable</h3>
                </div>

                {warnings.length > 0 && (
                  <div className="space-y-1">
                    {warnings.map((w, i) => (
                      <p key={i} className="text-xs text-destructive flex items-center gap-2">
                        <AlertCircle className="h-3 w-3" />{w}
                      </p>
                    ))}
                    <p className="text-xs text-muted-foreground">Configure las cuentas en Configuración → Cuentas de Empresa → Nómina</p>
                  </div>
                )}

                {lines.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cuenta</TableHead>
                        <TableHead>Concepto</TableHead>
                        <TableHead className="text-right">Débito</TableHead>
                        <TableHead className="text-right">Crédito</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((l, i) => {
                        const acc = accountsMap.get(l.account_id);
                        return (
                          <TableRow key={i}>
                            <TableCell className="text-xs font-mono">{acc ? `${acc.account_code} ${acc.account_name}` : `#${l.account_id}`}</TableCell>
                            <TableCell className="text-xs">{l.description}</TableCell>
                            <TableCell className="text-right font-mono">{l.debit_amount > 0 ? l.debit_amount.toFixed(2) : '—'}</TableCell>
                            <TableCell className="text-right font-mono">{l.credit_amount > 0 ? l.credit_amount.toFixed(2) : '—'}</TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow className="font-bold border-t-2">
                        <TableCell colSpan={2} className="text-right">Totales</TableCell>
                        <TableCell className="text-right font-mono">{totalDebit.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono">{totalCredit.toFixed(2)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
          {period.status !== 'posted' && entries.length > 0 && warnings.length === 0 && (
            <Button onClick={handlePost} disabled={posting}>
              {posting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
              Contabilizar póliza
            </Button>
          )}
        </DialogFooter>

        <ImportPayrollDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          onImport={async (rows) => {
            const ok = await replaceEntries(period.id, period.enterprise_id, rows);
            if (ok) { await reload(); onUpdated(); }
            return ok;
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
