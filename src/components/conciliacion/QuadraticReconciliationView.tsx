import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useBankReconciliationQuadratic } from '@/hooks/useBankReconciliationQuadratic';
import { AdjustmentsManager } from './AdjustmentsManager';
import { generateQuadraticPDF } from './QuadraticReconciliationPDF';
import { supabase } from '@/integrations/supabase/client';
import { Save, FileDown, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface Reconciliation {
  id: number;
  reconciliation_date: string;
  bank_statement_balance: number;
  book_balance: number;
  bank_account_id: number;
}

interface Props {
  enterpriseId: number;
}

export function QuadraticReconciliationView({ enterpriseId }: Props) {
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [enterpriseInfo, setEnterpriseInfo] = useState<{ name: string; nit: string; auditor: string; colegiado: string } | null>(null);
  const [bankInfo, setBankInfo] = useState<{ name: string; code: string } | null>(null);

  const { data, adjustments, loading, save, addAdjustment, deleteAdjustment } = useBankReconciliationQuadratic(selectedId);

  const [form, setForm] = useState({
    initial_balance_bank: 0, initial_balance_books: 0,
    final_balance_bank: 0, final_balance_books: 0,
    total_income_bank: 0, total_income_books: 0,
    total_expenses_bank: 0, total_expenses_books: 0,
    auditor_name: '', auditor_colegiado_number: '',
    auditor_signature_date: new Date().toISOString().slice(0, 10),
  });

  useEffect(() => {
    (async () => {
      const [recResp, entResp] = await Promise.all([
        supabase.from('tab_bank_reconciliations').select('id,reconciliation_date,bank_statement_balance,book_balance,bank_account_id,tab_bank_accounts!inner(enterprise_id)').eq('tab_bank_accounts.enterprise_id', enterpriseId).order('reconciliation_date', { ascending: false }).limit(50),
        supabase.from('tab_enterprises').select('enterprise_name,nit').eq('id', enterpriseId).maybeSingle(),
      ]);
      const recs = (recResp.data as unknown as Reconciliation[]) || [];
      setReconciliations(recs);
      const cfg = await supabase.from('tab_enterprise_config').select('default_auditor_name,default_auditor_colegiado').eq('enterprise_id', enterpriseId).maybeSingle();
      setEnterpriseInfo({
        name: (entResp.data as { enterprise_name?: string } | null)?.enterprise_name || 'Empresa',
        nit: (entResp.data as { nit?: string } | null)?.nit || '',
        auditor: (cfg.data as { default_auditor_name?: string } | null)?.default_auditor_name || '',
        colegiado: (cfg.data as { default_auditor_colegiado?: string } | null)?.default_auditor_colegiado || '',
      });
    })();
  }, [enterpriseId]);

  useEffect(() => {
    if (data) {
      setForm({
        initial_balance_bank: data.initial_balance_bank,
        initial_balance_books: data.initial_balance_books,
        final_balance_bank: data.final_balance_bank,
        final_balance_books: data.final_balance_books,
        total_income_bank: data.total_income_bank,
        total_income_books: data.total_income_books,
        total_expenses_bank: data.total_expenses_bank,
        total_expenses_books: data.total_expenses_books,
        auditor_name: data.auditor_name || enterpriseInfo?.auditor || '',
        auditor_colegiado_number: data.auditor_colegiado_number || enterpriseInfo?.colegiado || '',
        auditor_signature_date: data.auditor_signature_date || new Date().toISOString().slice(0, 10),
      });
    } else if (selectedId) {
      const rec = reconciliations.find((r) => r.id === selectedId);
      if (rec) {
        setForm((f) => ({
          ...f,
          final_balance_bank: rec.bank_statement_balance,
          final_balance_books: rec.book_balance,
          auditor_name: enterpriseInfo?.auditor || '',
          auditor_colegiado_number: enterpriseInfo?.colegiado || '',
        }));
      }
    }
  }, [data, selectedId, reconciliations, enterpriseInfo]);

  useEffect(() => {
    if (!selectedId) return;
    const rec = reconciliations.find((r) => r.id === selectedId);
    if (rec) {
      supabase.from('tab_bank_accounts').select('bank_name,account_number').eq('id', rec.bank_account_id).maybeSingle().then(({ data: b }) => {
        setBankInfo(b ? { name: b.bank_name, code: b.account_number } : null);
      });
    }
  }, [selectedId, reconciliations]);

  if (reconciliations.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <AlertCircle className="h-10 w-10 mx-auto mb-2" />
          No hay conciliaciones registradas. Realice primero una conciliación bancaria en la pestaña "Conciliación".
        </CardContent>
      </Card>
    );
  }

  const adjBank = adjustments.filter((a) => a.affects_side === 'banco').reduce((s, a) => s + a.amount, 0);
  const adjBooks = adjustments.filter((a) => a.affects_side === 'libros').reduce((s, a) => s + a.amount, 0);
  const reconciledBank = form.final_balance_bank + adjBank;
  const reconciledBooks = form.final_balance_books + adjBooks;
  const difference = Math.abs(reconciledBank - reconciledBooks);
  const isBalanced = difference < 0.01;

  const rec = reconciliations.find((r) => r.id === selectedId);

  const handleSave = async () => {
    if (!selectedId || !rec) return;
    await save({
      reconciliation_id: selectedId,
      enterprise_id: enterpriseId,
      bank_account_id: rec.bank_account_id,
      ...form,
      auditor_name: form.auditor_name || null,
      auditor_colegiado_number: form.auditor_colegiado_number || null,
      auditor_signature_date: form.auditor_signature_date || null,
    });
  };

  const handleExport = () => {
    if (!enterpriseInfo || !bankInfo || !rec) {
      toast.error('Faltan datos para exportar');
      return;
    }
    generateQuadraticPDF({
      enterpriseName: enterpriseInfo.name,
      enterpriseNit: enterpriseInfo.nit,
      bankName: bankInfo.name,
      accountNumber: bankInfo.code,
      reconciliationDate: rec.reconciliation_date,
      data: form,
      adjustments,
      reconciledBank,
      reconciledBooks,
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Conciliación Cuadrática (formato SAT)</CardTitle>
          <CardDescription>Seleccione una conciliación previa y complete los 4 cuadrantes con saldos y movimientos del banco vs libros.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Conciliación base</Label>
              <Select value={selectedId?.toString() || ''} onValueChange={(v) => setSelectedId(parseInt(v))}>
                <SelectTrigger><SelectValue placeholder="Seleccione una conciliación" /></SelectTrigger>
                <SelectContent>
                  {reconciliations.map((r) => (
                    <SelectItem key={r.id} value={r.id.toString()}>
                      {r.reconciliation_date} — Saldo banco Q{r.bank_statement_balance.toFixed(2)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedId && (
              <div className="flex items-end gap-2">
                <Button onClick={handleSave} disabled={loading}><Save className="h-4 w-4 mr-2" />Guardar</Button>
                <Button variant="outline" onClick={handleExport}><FileDown className="h-4 w-4 mr-2" />PDF SAT</Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedId && (
        <>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              { title: 'Saldo Inicial', bankKey: 'initial_balance_bank', booksKey: 'initial_balance_books' },
              { title: 'Total Ingresos del período', bankKey: 'total_income_bank', booksKey: 'total_income_books' },
              { title: 'Total Egresos del período', bankKey: 'total_expenses_bank', booksKey: 'total_expenses_books' },
              { title: 'Saldo Final', bankKey: 'final_balance_bank', booksKey: 'final_balance_books' },
            ].map((q) => (
              <Card key={q.title}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{q.title}</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Banco</Label>
                    <Input type="number" step="0.01" value={form[q.bankKey as keyof typeof form] as number}
                      onChange={(e) => setForm({ ...form, [q.bankKey]: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <Label className="text-xs">Libros</Label>
                    <Input type="number" step="0.01" value={form[q.booksKey as keyof typeof form] as number}
                      onChange={(e) => setForm({ ...form, [q.booksKey]: parseFloat(e.target.value) || 0 })} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ajustes / Partidas conciliatorias</CardTitle>
            </CardHeader>
            <CardContent>
              <AdjustmentsManager
                adjustments={adjustments}
                reconciliationId={selectedId}
                enterpriseId={enterpriseId}
                onAdd={addAdjustment}
                onDelete={deleteAdjustment}
              />
            </CardContent>
          </Card>

          <Card className={isBalanced ? 'border-green-500/50' : 'border-destructive/50'}>
            <CardContent className="py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isBalanced ? <CheckCircle2 className="h-6 w-6 text-green-600" /> : <AlertCircle className="h-6 w-6 text-destructive" />}
                <div>
                  <p className="font-semibold">{isBalanced ? 'Cuadre verificado' : 'Diferencia detectada'}</p>
                  <p className="text-sm text-muted-foreground">
                    Banco ajustado: Q{reconciledBank.toFixed(2)} | Libros ajustados: Q{reconciledBooks.toFixed(2)}
                  </p>
                </div>
              </div>
              <Badge variant={isBalanced ? 'default' : 'destructive'}>Diferencia: Q{difference.toFixed(2)}</Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Datos del Auditor (CPA)</CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-3 gap-4">
              <div>
                <Label>Nombre del CPA</Label>
                <Input value={form.auditor_name} onChange={(e) => setForm({ ...form, auditor_name: e.target.value })} />
              </div>
              <div>
                <Label>Número de colegiado</Label>
                <Input value={form.auditor_colegiado_number} onChange={(e) => setForm({ ...form, auditor_colegiado_number: e.target.value })} />
              </div>
              <div>
                <Label>Fecha de firma</Label>
                <Input type="date" value={form.auditor_signature_date} onChange={(e) => setForm({ ...form, auditor_signature_date: e.target.value })} />
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
