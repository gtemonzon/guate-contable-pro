import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, Plus } from 'lucide-react';
import { ADJUSTMENT_TYPE_LABELS, type AdjustmentRecord } from '@/hooks/useBankReconciliationQuadratic';

interface Props {
  adjustments: AdjustmentRecord[];
  reconciliationId: number;
  enterpriseId: number;
  onAdd: (adj: Omit<AdjustmentRecord, 'id'>) => Promise<boolean>;
  onDelete: (id: number) => Promise<boolean>;
}

export function AdjustmentsManager({ adjustments, reconciliationId, enterpriseId, onAdd, onDelete }: Props) {
  const [type, setType] = useState<AdjustmentRecord['adjustment_type']>('cheque_no_cobrado');
  const [side, setSide] = useState<'banco' | 'libros'>('banco');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const handleAdd = async () => {
    if (!description.trim() || !amount) return;
    const ok = await onAdd({
      reconciliation_id: reconciliationId,
      enterprise_id: enterpriseId,
      adjustment_type: type,
      affects_side: side,
      description: description.trim(),
      amount: parseFloat(amount),
      document_reference: reference || null,
      adjustment_date: date || null,
    });
    if (ok) { setDescription(''); setAmount(''); setReference(''); }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end p-3 border rounded-lg bg-muted/30">
        <div>
          <Label className="text-xs">Tipo</Label>
          <Select value={type} onValueChange={(v) => setType(v as AdjustmentRecord['adjustment_type'])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(ADJUSTMENT_TYPE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Afecta</Label>
          <Select value={side} onValueChange={(v) => setSide(v as 'banco' | 'libros')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="banco">Banco</SelectItem>
              <SelectItem value="libros">Libros</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs">Descripción</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalle del ajuste" />
        </div>
        <div>
          <Label className="text-xs">Monto</Label>
          <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ref." />
          <Button size="icon" onClick={handleAdd}><Plus className="h-4 w-4" /></Button>
        </div>
      </div>

      {adjustments.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Afecta</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead>Referencia</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {adjustments.map((a) => (
              <TableRow key={a.id}>
                <TableCell>{ADJUSTMENT_TYPE_LABELS[a.adjustment_type]}</TableCell>
                <TableCell className="capitalize">{a.affects_side}</TableCell>
                <TableCell>{a.description}</TableCell>
                <TableCell>{a.document_reference || '—'}</TableCell>
                <TableCell className="text-right font-mono">{a.amount.toFixed(2)}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => a.id && onDelete(a.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
