import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, FileSpreadsheet, Download, Loader2, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import type { PayrollEntry } from '@/hooks/usePayrollPeriods';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onImport: (rows: Omit<PayrollEntry, 'id' | 'payroll_period_id' | 'enterprise_id'>[]) => Promise<boolean>;
}

type RawRow = Omit<PayrollEntry, 'id' | 'payroll_period_id' | 'enterprise_id'>;

const HEADERS = ['DPI', 'Nombre', 'Puesto', 'Sueldo Base', 'Bonificación', 'Horas Extra', 'Comisiones', 'Otros Ingresos', 'IGSS Laboral', 'ISR', 'Préstamos', 'Otros Descuentos', 'Líquido'];

export function ImportPayrollDialog({ open, onOpenChange, onImport }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<RawRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!open) { setFile(null); setRows([]); setErrors([]); }
  }, [open]);

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      HEADERS,
      ['1234567890101', 'Juan Pérez', 'Contador', 5000, 250, 0, 0, 0, 240.25, 0, 0, 0, 5009.75],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Nómina');
    XLSX.writeFile(wb, 'plantilla-nomina.xlsx');
  };

  const handleFile = async (f: File) => {
    setFile(f);
    setLoading(true);
    setErrors([]);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

      const errs: string[] = [];
      const parsed: RawRow[] = json.map((r, idx) => {
        const name = String(r['Nombre'] || r['nombre'] || '').trim();
        if (!name) errs.push(`Fila ${idx + 2}: nombre vacío`);
        const num = (k: string) => parseFloat(String(r[k] || 0)) || 0;
        const base = num('Sueldo Base');
        const boni = num('Bonificación');
        const oti = num('Horas Extra');
        const com = num('Comisiones');
        const otherInc = num('Otros Ingresos');
        const igss = num('IGSS Laboral');
        const isr = num('ISR');
        const loans = num('Préstamos');
        const otherDed = num('Otros Descuentos');
        let net = num('Líquido');
        if (net === 0) net = base + boni + oti + com + otherInc - igss - isr - loans - otherDed;
        return {
          employee_dpi: String(r['DPI'] || '').trim() || null,
          employee_name: name,
          employee_position: String(r['Puesto'] || '').trim() || null,
          base_salary: base,
          bonificacion_decreto: boni,
          overtime: oti,
          commissions: com,
          other_income: otherInc,
          igss_laboral: igss,
          isr_retained: isr,
          loans_deduction: loans,
          other_deductions: otherDed,
          net_pay: net,
        };
      });

      setRows(parsed);
      setErrors(errs);
      if (errs.length === 0) toast.success(`${parsed.length} filas leídas`);
    } catch (err) {
      console.error(err);
      toast.error('Error al leer Excel');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (rows.length === 0) return;
    setLoading(true);
    const ok = await onImport(rows);
    setLoading(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar Nómina desde Excel</DialogTitle>
          <DialogDescription>Suba el archivo .xlsx con los datos de los empleados. Los registros previos del período serán reemplazados.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Button variant="outline" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-2" />Descargar plantilla
            </Button>
            <Label className="flex-1">
              <Input type="file" accept=".xlsx,.xls" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            </Label>
          </div>

          {file && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" />{file.name}
            </div>
          )}

          {errors.length > 0 && (
            <div className="p-3 border border-destructive rounded-lg space-y-1">
              {errors.map((e, i) => (
                <p key={i} className="text-xs text-destructive flex items-center gap-2">
                  <AlertCircle className="h-3 w-3" />{e}
                </p>
              ))}
            </div>
          )}

          {rows.length > 0 && (
            <div className="border rounded-lg overflow-x-auto max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>DPI</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Puesto</TableHead>
                    <TableHead className="text-right">Base</TableHead>
                    <TableHead className="text-right">Boni</TableHead>
                    <TableHead className="text-right">IGSS</TableHead>
                    <TableHead className="text-right">ISR</TableHead>
                    <TableHead className="text-right">Líquido</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs">{r.employee_dpi || '—'}</TableCell>
                      <TableCell>{r.employee_name}</TableCell>
                      <TableCell className="text-xs">{r.employee_position || '—'}</TableCell>
                      <TableCell className="text-right font-mono">{r.base_salary.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono">{r.bonificacion_decreto.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono">{r.igss_laboral.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono">{r.isr_retained.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono font-semibold">{r.net_pay.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={loading || rows.length === 0 || errors.length > 0}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Importar {rows.length} empleados
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
