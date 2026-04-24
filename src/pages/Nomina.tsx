import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Eye, Trash2, Building2, Users, LayoutGrid, List, Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useEnterprise } from '@/contexts/EnterpriseContext';
import { usePayrollPeriods, type PayrollPeriod } from '@/hooks/usePayrollPeriods';
import { PayrollDetailDialog } from '@/components/nomina/PayrollDetailDialog';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

type ViewMode = 'cards' | 'table';
type SortKey = 'period' | 'payment_date' | 'status' | 'total_gross' | 'total_net';
type SortDir = 'asc' | 'desc';

export default function Nomina() {
  const { selectedEnterprise } = useEnterprise();
  const enterpriseId = selectedEnterprise?.id || null;
  const { periods, loading, createPeriod, deletePeriod, reload } = usePayrollPeriods(enterpriseId);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<PayrollPeriod | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('period');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear().toString());
  const [month, setMonth] = useState((now.getMonth() + 1).toString());
  const [paymentDate, setPaymentDate] = useState(new Date(now.getFullYear(), now.getMonth(), 28).toISOString().slice(0, 10));

  const handleCreate = async () => {
    const p = await createPeriod(parseInt(year), parseInt(month), paymentDate);
    if (p) { setCreateOpen(false); setSelectedPeriod(p); }
  };

  const filteredSorted = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = periods;
    if (term) {
      list = list.filter((p) => {
        const monthName = MONTHS[p.period_month - 1].toLowerCase();
        const yearStr = p.period_year.toString();
        const monthStr = String(p.period_month).padStart(2, '0');
        return (
          monthName.includes(term) ||
          yearStr.includes(term) ||
          `${monthStr}/${yearStr}`.includes(term) ||
          `${monthName} ${yearStr}`.includes(term) ||
          (p.payment_date || '').includes(term) ||
          (p.status || '').toLowerCase().includes(term)
        );
      });
    }
    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'period':
          cmp = a.period_year - b.period_year || a.period_month - b.period_month;
          break;
        case 'payment_date':
          cmp = (a.payment_date || '').localeCompare(b.payment_date || '');
          break;
        case 'status':
          cmp = (a.status || '').localeCompare(b.status || '');
          break;
        case 'total_gross':
          cmp = a.total_gross - b.total_gross;
          break;
        case 'total_net':
          cmp = a.total_net - b.total_net;
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [periods, search, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="h-3 w-3 ml-1 inline opacity-50" />;
    return sortDir === 'asc'
      ? <ArrowUp className="h-3 w-3 ml-1 inline" />
      : <ArrowDown className="h-3 w-3 ml-1 inline" />;
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

      {periods.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por mes, año o estado..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            {viewMode === 'cards' && (
              <Select value={`${sortKey}:${sortDir}`} onValueChange={(v) => {
                const [k, d] = v.split(':') as [SortKey, SortDir];
                setSortKey(k); setSortDir(d);
              }}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="period:desc">Período (más reciente)</SelectItem>
                  <SelectItem value="period:asc">Período (más antiguo)</SelectItem>
                  <SelectItem value="payment_date:desc">Fecha pago (Z-A)</SelectItem>
                  <SelectItem value="payment_date:asc">Fecha pago (A-Z)</SelectItem>
                  <SelectItem value="status:asc">Estado (A-Z)</SelectItem>
                  <SelectItem value="total_net:desc">Líquido (mayor)</SelectItem>
                  <SelectItem value="total_net:asc">Líquido (menor)</SelectItem>
                </SelectContent>
              </Select>
            )}
            <div className="flex border rounded-md">
              <Button
                variant={viewMode === 'cards' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('cards')}
                className="rounded-r-none"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'table' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('table')}
                className="rounded-l-none"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-center text-muted-foreground py-8">Cargando...</p>
      ) : periods.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No hay períodos de nómina. Cree el primero con el botón "Nuevo período".
          </CardContent>
        </Card>
      ) : filteredSorted.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No se encontraron períodos con "{search}".
          </CardContent>
        </Card>
      ) : viewMode === 'cards' ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSorted.map((p) => (
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
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('period')}>
                    Período<SortIcon k="period" />
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('payment_date')}>
                    Fecha de pago<SortIcon k="payment_date" />
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('status')}>
                    Estado<SortIcon k="status" />
                  </TableHead>
                  <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort('total_gross')}>
                    Bruto<SortIcon k="total_gross" />
                  </TableHead>
                  <TableHead className="text-right">Descuentos</TableHead>
                  <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort('total_net')}>
                    Líquido<SortIcon k="total_net" />
                  </TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSorted.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{MONTHS[p.period_month - 1]} {p.period_year}</TableCell>
                    <TableCell>{p.payment_date}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === 'posted' ? 'default' : p.status === 'imported' ? 'secondary' : 'outline'}>
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">Q{p.total_gross.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono">Q{p.total_deductions.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">Q{p.total_net.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setSelectedPeriod(p)}>
                          <Eye className="h-3 w-3 mr-1" />Ver
                        </Button>
                        {p.status === 'draft' && (
                          <Button size="sm" variant="ghost" onClick={() => deletePeriod(p.id)}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
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
