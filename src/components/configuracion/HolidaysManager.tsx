import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, CalendarIcon, Download } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface Holiday {
  id?: number;
  holiday_date: string;
  description: string;
  is_recurring: boolean;
}

export function HolidaysManager() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newHoliday, setNewHoliday] = useState<Partial<Holiday>>({
    description: '',
    is_recurring: false,
  });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const enterpriseId = localStorage.getItem('currentEnterpriseId');

  const fetchHolidays = async () => {
    try {
      let query = supabase
        .from('tab_holidays')
        .select('*')
        .order('holiday_date');

      if (enterpriseId) {
        query = query.or(`enterprise_id.eq.${enterpriseId},enterprise_id.is.null`);
      } else {
        query = query.is('enterprise_id', null);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Filter by year
      const filtered = (data || []).filter((h: Holiday) => {
        const date = new Date(h.holiday_date);
        return date.getFullYear() === selectedYear || h.is_recurring;
      });

      setHolidays(filtered);
    } catch (error) {
      console.error('Error fetching holidays:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHolidays();
  }, [enterpriseId, selectedYear]);

  const handleAddHoliday = async () => {
    if (!newHoliday.holiday_date || !newHoliday.description) {
      toast({
        title: 'Error',
        description: 'Completa todos los campos.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('tab_holidays')
        .insert({
          enterprise_id: enterpriseId ? parseInt(enterpriseId) : null,
          holiday_date: newHoliday.holiday_date,
          description: newHoliday.description,
          is_recurring: newHoliday.is_recurring || false,
        });

      if (error) throw error;

      toast({
        title: 'Feriado agregado',
        description: 'El feriado se ha agregado exitosamente.',
      });

      setDialogOpen(false);
      setNewHoliday({ description: '', is_recurring: false });
      fetchHolidays();
    } catch (error) {
      console.error('Error adding holiday:', error);
      toast({
        title: 'Error',
        description: 'No se pudo agregar el feriado.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteHoliday = async (id: number) => {
    try {
      const { error } = await supabase
        .from('tab_holidays')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Feriado eliminado',
        description: 'El feriado se ha eliminado.',
      });

      fetchHolidays();
    } catch (error) {
      console.error('Error deleting holiday:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el feriado.',
        variant: 'destructive',
      });
    }
  };

  const loadDefaultHolidays = async (year: number) => {
    const defaultHolidays = [
      { date: `${year}-01-01`, description: 'Año Nuevo', recurring: true },
      { date: `${year}-05-01`, description: 'Día del Trabajo', recurring: true },
      { date: `${year}-06-30`, description: 'Día del Ejército', recurring: true },
      { date: `${year}-09-15`, description: 'Día de la Independencia', recurring: true },
      { date: `${year}-10-20`, description: 'Día de la Revolución', recurring: true },
      { date: `${year}-11-01`, description: 'Día de Todos los Santos', recurring: true },
      { date: `${year}-12-24`, description: 'Nochebuena', recurring: true },
      { date: `${year}-12-25`, description: 'Navidad', recurring: true },
      { date: `${year}-12-31`, description: 'Fin de Año', recurring: true },
    ];

    setSaving(true);
    try {
      for (const h of defaultHolidays) {
        // Check if already exists
        const { data: existing } = await supabase
          .from('tab_holidays')
          .select('id')
          .eq('holiday_date', h.date)
          .or(`enterprise_id.eq.${enterpriseId || 0},enterprise_id.is.null`)
          .limit(1);

        if (!existing || existing.length === 0) {
          await supabase
            .from('tab_holidays')
            .insert({
              enterprise_id: enterpriseId ? parseInt(enterpriseId) : null,
              holiday_date: h.date,
              description: h.description,
              is_recurring: h.recurring,
            });
        }
      }

      toast({
        title: 'Feriados cargados',
        description: `Los feriados de Guatemala ${year} se han cargado.`,
      });

      fetchHolidays();
    } catch (error) {
      console.error('Error loading default holidays:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los feriados.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() + i - 1);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Feriados Oficiales</CardTitle>
        <CardDescription>
          Gestiona los feriados que se consideran para el cálculo de días hábiles.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <Label>Año:</Label>
            <Select
              value={selectedYear.toString()}
              onValueChange={(v) => setSelectedYear(parseInt(v))}
            >
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => loadDefaultHolidays(selectedYear)}
              disabled={saving}
            >
              <Download className="h-4 w-4 mr-2" />
              Cargar Guatemala {selectedYear}
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar Feriado
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Agregar Feriado</DialogTitle>
                  <DialogDescription>
                    Agrega un nuevo feriado al calendario.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Fecha</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal',
                            !newHoliday.holiday_date && 'text-muted-foreground'
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {newHoliday.holiday_date
                            ? format(new Date(newHoliday.holiday_date), 'PPP', { locale: es })
                            : 'Selecciona fecha'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={newHoliday.holiday_date ? new Date(newHoliday.holiday_date) : undefined}
                          onSelect={(date) =>
                            setNewHoliday(prev => ({
                              ...prev,
                              holiday_date: date?.toISOString().split('T')[0],
                            }))
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label>Descripción</Label>
                    <Input
                      value={newHoliday.description || ''}
                      onChange={(e) =>
                        setNewHoliday(prev => ({ ...prev, description: e.target.value }))
                      }
                      placeholder="Ej: Día de la Independencia"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={newHoliday.is_recurring || false}
                      onCheckedChange={(checked) =>
                        setNewHoliday(prev => ({ ...prev, is_recurring: checked }))
                      }
                    />
                    <Label>Feriado recurrente (se repite cada año)</Label>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleAddHoliday} disabled={saving}>
                    {saving ? 'Guardando...' : 'Agregar'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="w-[100px] text-center">Tipo</TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {holidays.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  No hay feriados registrados para {selectedYear}.
                </TableCell>
              </TableRow>
            ) : (
              holidays.map((holiday) => (
                <TableRow key={holiday.id || holiday.holiday_date}>
                  <TableCell>
                    {format(new Date(holiday.holiday_date), "dd 'de' MMMM yyyy", { locale: es })}
                  </TableCell>
                  <TableCell>{holiday.description}</TableCell>
                  <TableCell className="text-center">
                    <span
                      className={cn(
                        'px-2 py-1 rounded-full text-xs',
                        holiday.is_recurring
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {holiday.is_recurring ? 'Fijo' : 'Variable'}
                    </span>
                  </TableCell>
                  <TableCell>
                    {holiday.id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteHoliday(holiday.id!)}
                        className="h-8 w-8 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
