import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Eye, Trash2, Building2, Users } from 'lucide-react';
import { useEnterprise } from '@/contexts/EnterpriseContext';
import { usePayrollPeriods, type PayrollPeriod } from '@/hooks/usePayrollPeriods';
import { PayrollDetailDialog } from '@/components/nomina/PayrollDetailDialog';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function Nomina() {
  const { selectedEnterprise } = useEnterprise();
  const enterpriseId = selectedEnterprise?.id || null;
  const { periods, loading, createPeriod, deletePeriod, reload } = usePayrollPeriods(enterpriseId);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<PayrollPeriod | null>(null);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear().toString());
  const [month, setMonth] = useState((now.getMonth() + 1).toString());
  const [paymentDate, setPaymentDate] = useState(new Date(now.getFullYear(), now.getMonth(), 28).toISOString().slice(0, 10));

  const handleCreate = async () => {
    const p = await createPeriod(parseInt(year), parseInt(month), paymentDate);
    if (p) { setCreateOpen(false); setSelectedPeriod(p); }
  };

  if (!enterpriseId) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Seleccione una empresa para gestionar nóminas.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-7 w-7" />Nómina
          </h1>
          <p className="text-muted-foreground">Importe la nómina mensual desde Excel y genere la póliza contable automáticamente.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" />Nuevo período</Button>
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground py-8">Cargando...</p>
      ) : periods.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No hay períodos de nómina. Cree el primero con el botón "Nuevo período".
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {periods.map((p) => (
            <Card key={p.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{MONTHS[p.period_month - 1]} {p.period_year}</CardTitle>
                  <Badge variant={p.status === 'posted' ? 'default' : p.status === 'imported' ? 'secondary' : 'outline'}>
                    {p.status}
                  </Badge>
                </div>
                <CardDescription>Pago: {p.payment_date}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Bruto</p>
                    <p className="font-mono font-semibold">Q{p.total_gross.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Desc.</p>
                    <p className="font-mono font-semibold">Q{p.total_deductions.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Líquido</p>
                    <p className="font-mono font-semibold">Q{p.total_net.toFixed(2)}</p>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => setSelectedPeriod(p)}>
                    <Eye className="h-3 w-3 mr-1" />Ver detalle
                  </Button>
                  {p.status === 'draft' && (
                    <Button size="sm" variant="ghost" onClick={() => deletePeriod(p.id)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo período de nómina</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Año</Label>
                <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} />
              </div>
              <div>
                <Label>Mes</Label>
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => <SelectItem key={i} value={(i + 1).toString()}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Fecha de pago</Label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate}>Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedPeriod && (
        <PayrollDetailDialog
          open={!!selectedPeriod}
          onOpenChange={(o) => !o && setSelectedPeriod(null)}
          period={selectedPeriod}
          onUpdated={reload}
        />
      )}
    </div>
  );
}
