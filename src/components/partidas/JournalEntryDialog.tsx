import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Save, CheckCircle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Account {
  id: number;
  account_code: string;
  account_name: string;
  requires_cost_center: boolean;
}

interface Period {
  id: number;
  year: number;
  start_date: string;
  end_date: string;
  status: string;
}

interface DetailLine {
  id: string;
  account_id: number | null;
  description: string;
  bank_reference: string;
  cost_center: string;
  debit_amount: number;
  credit_amount: number;
}

interface JournalEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export default function JournalEntryDialog({
  open,
  onOpenChange,
  onSuccess,
}: JournalEntryDialogProps) {
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [nextEntryNumber, setNextEntryNumber] = useState("");
  
  // Campos del encabezado
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [entryType, setEntryType] = useState("diario");
  const [periodId, setPeriodId] = useState<number | null>(null);
  const [documentReference, setDocumentReference] = useState("");
  const [headerDescription, setHeaderDescription] = useState("");
  
  // Líneas de detalle
  const [detailLines, setDetailLines] = useState<DetailLine[]>([
    { id: crypto.randomUUID(), account_id: null, description: "", bank_reference: "", cost_center: "", debit_amount: 0, credit_amount: 0 },
    { id: crypto.randomUUID(), account_id: null, description: "", bank_reference: "", cost_center: "", debit_amount: 0, credit_amount: 0 },
  ]);

  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      loadInitialData();
    }
  }, [open]);

  useEffect(() => {
    // Auto-llenar descripción de líneas cuando cambia la descripción del encabezado
    if (headerDescription) {
      setDetailLines(lines => 
        lines.map(line => ({
          ...line,
          description: line.description === "" ? headerDescription : line.description
        }))
      );
    }
  }, [headerDescription]);

  const loadInitialData = async () => {
    const enterpriseId = localStorage.getItem("currentEnterpriseId");
    if (!enterpriseId) {
      toast({
        title: "Error",
        description: "No hay empresa seleccionada",
        variant: "destructive",
      });
      return;
    }

    try {
      // Cargar cuentas de detalle
      const { data: accountsData, error: accountsError } = await supabase
        .from("tab_accounts")
        .select("id, account_code, account_name, requires_cost_center")
        .eq("enterprise_id", parseInt(enterpriseId))
        .eq("is_detail_account", true)
        .eq("allows_movement", true)
        .eq("is_active", true)
        .order("account_code");

      if (accountsError) throw accountsError;
      setAccounts(accountsData || []);

      // Cargar períodos abiertos
      const { data: periodsData, error: periodsError } = await supabase
        .from("tab_accounting_periods")
        .select("*")
        .eq("enterprise_id", parseInt(enterpriseId))
        .eq("status", "abierto")
        .order("year", { ascending: false });

      if (periodsError) throw periodsError;
      setPeriods(periodsData || []);

      // Auto-seleccionar período si hay uno que contenga la fecha actual
      if (periodsData && periodsData.length > 0) {
        const currentPeriod = periodsData.find(p => 
          entryDate >= p.start_date && entryDate <= p.end_date
        );
        if (currentPeriod) {
          setPeriodId(currentPeriod.id);
        } else {
          setPeriodId(periodsData[0].id);
        }
      }

      // Obtener siguiente número de partida
      const { data: lastEntry } = await supabase
        .from("tab_journal_entries")
        .select("entry_number")
        .eq("enterprise_id", parseInt(enterpriseId))
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastEntry) {
        const lastNumber = parseInt(lastEntry.entry_number.replace(/\D/g, '')) || 0;
        setNextEntryNumber(`PD-${String(lastNumber + 1).padStart(6, '0')}`);
      } else {
        setNextEntryNumber("PD-000001");
      }
    } catch (error: any) {
      toast({
        title: "Error al cargar datos",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const addLine = () => {
    setDetailLines([
      ...detailLines,
      { 
        id: crypto.randomUUID(), 
        account_id: null, 
        description: headerDescription, 
        bank_reference: "", 
        cost_center: "", 
        debit_amount: 0, 
        credit_amount: 0 
      }
    ]);
  };

  const removeLine = (id: string) => {
    if (detailLines.length <= 2) {
      toast({
        title: "Mínimo 2 líneas",
        description: "Una partida debe tener al menos 2 líneas de detalle",
        variant: "destructive",
      });
      return;
    }
    setDetailLines(detailLines.filter(line => line.id !== id));
  };

  const updateLine = (id: string, field: keyof DetailLine, value: any) => {
    setDetailLines(lines =>
      lines.map(line =>
        line.id === id ? { ...line, [field]: value } : line
      )
    );
  };

  const getTotalDebit = () => {
    return detailLines.reduce((sum, line) => sum + (line.debit_amount || 0), 0);
  };

  const getTotalCredit = () => {
    return detailLines.reduce((sum, line) => sum + (line.credit_amount || 0), 0);
  };

  const isBalanced = () => {
    const debit = getTotalDebit();
    const credit = getTotalCredit();
    return Math.abs(debit - credit) < 0.01 && debit > 0;
  };

  const validateEntry = () => {
    if (!headerDescription.trim()) {
      toast({
        title: "Descripción requerida",
        description: "Debes ingresar una descripción general",
        variant: "destructive",
      });
      return false;
    }

    if (!periodId) {
      toast({
        title: "Período requerido",
        description: "Debes seleccionar un período contable",
        variant: "destructive",
      });
      return false;
    }

    if (detailLines.length < 2) {
      toast({
        title: "Líneas insuficientes",
        description: "Una partida debe tener al menos 2 líneas de detalle",
        variant: "destructive",
      });
      return false;
    }

    for (const line of detailLines) {
      if (!line.account_id) {
        toast({
          title: "Cuenta requerida",
          description: "Todas las líneas deben tener una cuenta asignada",
          variant: "destructive",
        });
        return false;
      }

      const account = accounts.find(a => a.id === line.account_id);
      if (account?.requires_cost_center && !line.cost_center.trim()) {
        toast({
          title: "Centro de costo requerido",
          description: `La cuenta ${account.account_code} requiere centro de costo`,
          variant: "destructive",
        });
        return false;
      }

      if (line.debit_amount === 0 && line.credit_amount === 0) {
        toast({
          title: "Monto requerido",
          description: "Todas las líneas deben tener un monto en debe o haber",
          variant: "destructive",
        });
        return false;
      }

      if (line.debit_amount > 0 && line.credit_amount > 0) {
        toast({
          title: "Debe o haber",
          description: "Una línea no puede tener monto en debe y haber al mismo tiempo",
          variant: "destructive",
        });
        return false;
      }
    }

    return true;
  };

  const saveEntry = async (post: boolean) => {
    if (!validateEntry()) return;

    if (post && !isBalanced()) {
      toast({
        title: "Partida desbalanceada",
        description: "El debe y el haber deben ser iguales para contabilizar",
        variant: "destructive",
      });
      return;
    }

    const enterpriseId = localStorage.getItem("currentEnterpriseId");
    if (!enterpriseId) return;

    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuario no autenticado");

      // Insertar encabezado
      const { data: entry, error: entryError } = await supabase
        .from("tab_journal_entries")
        .insert({
          enterprise_id: parseInt(enterpriseId),
          entry_number: nextEntryNumber,
          entry_date: entryDate,
          entry_type: entryType,
          accounting_period_id: periodId,
          document_reference: documentReference || null,
          description: headerDescription,
          total_debit: getTotalDebit(),
          total_credit: getTotalCredit(),
          is_balanced: isBalanced(),
          is_posted: post,
          posted_at: post ? new Date().toISOString() : null,
          created_by: user.id,
        })
        .select()
        .single();

      if (entryError) throw entryError;

      // Insertar líneas de detalle
      const detailsToInsert = detailLines.map((line, index) => ({
        journal_entry_id: entry.id,
        line_number: index + 1,
        account_id: line.account_id,
        description: line.description || headerDescription,
        bank_reference: line.bank_reference || null,
        cost_center: line.cost_center || null,
        debit_amount: line.debit_amount,
        credit_amount: line.credit_amount,
      }));

      const { error: detailsError } = await supabase
        .from("tab_journal_entry_details")
        .insert(detailsToInsert);

      if (detailsError) throw detailsError;

      toast({
        title: post ? "Partida contabilizada" : "Borrador guardado",
        description: `Partida ${nextEntryNumber} ${post ? 'contabilizada' : 'guardada'} exitosamente`,
      });

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error al guardar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva Partida Contable</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Encabezado */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label>Número de Partida</Label>
              <Input value={nextEntryNumber} disabled />
            </div>

            <div>
              <Label htmlFor="entryDate">Fecha</Label>
              <Input
                id="entryDate"
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="entryType">Tipo</Label>
              <Select value={entryType} onValueChange={setEntryType}>
                <SelectTrigger id="entryType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="apertura">Apertura</SelectItem>
                  <SelectItem value="diario">Diario</SelectItem>
                  <SelectItem value="ajuste">Ajuste</SelectItem>
                  <SelectItem value="cierre">Cierre</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="period">Período Contable</Label>
              <Select 
                value={periodId?.toString() || ""} 
                onValueChange={(v) => setPeriodId(parseInt(v))}
              >
                <SelectTrigger id="period">
                  <SelectValue placeholder="Seleccionar período" />
                </SelectTrigger>
                <SelectContent>
                  {periods.map((period) => (
                    <SelectItem key={period.id} value={period.id.toString()}>
                      {period.year} ({new Date(period.start_date).toLocaleDateString()} - {new Date(period.end_date).toLocaleDateString()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="docRef">Referencia de Documento</Label>
              <Input
                id="docRef"
                placeholder="Opcional"
                value={documentReference}
                onChange={(e) => setDocumentReference(e.target.value)}
              />
            </div>

            <div className="md:col-span-2 lg:col-span-3">
              <Label htmlFor="headerDesc">Descripción General</Label>
              <Textarea
                id="headerDesc"
                placeholder="Descripción de la partida..."
                value={headerDescription}
                onChange={(e) => setHeaderDescription(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          {/* Líneas de Detalle */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Líneas de Detalle</h3>
              <Button onClick={addLine} variant="outline" size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Agregar Línea
              </Button>
            </div>

            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Cuenta</TableHead>
                    <TableHead className="w-[250px]">Descripción</TableHead>
                    <TableHead className="w-[150px]">Ref. Bancaria</TableHead>
                    <TableHead className="w-[120px]">Centro Costo</TableHead>
                    <TableHead className="w-[120px]">Debe</TableHead>
                    <TableHead className="w-[120px]">Haber</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailLines.map((line) => {
                    const account = accounts.find(a => a.id === line.account_id);
                    return (
                      <TableRow key={line.id}>
                        <TableCell>
                          <Select
                            value={line.account_id?.toString() || ""}
                            onValueChange={(v) => updateLine(line.id, "account_id" as keyof DetailLine, parseInt(v) as any)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar" />
                            </SelectTrigger>
                            <SelectContent>
                              {accounts.map((acc) => (
                                <SelectItem key={acc.id} value={acc.id.toString()}>
                                  {acc.account_code} - {acc.account_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            value={line.description}
                            onChange={(e) => updateLine(line.id, "description", e.target.value)}
                            placeholder="Descripción"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={line.bank_reference}
                            onChange={(e) => updateLine(line.id, "bank_reference", e.target.value)}
                            placeholder="# cheque, etc."
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={line.cost_center}
                            onChange={(e) => updateLine(line.id, "cost_center", e.target.value)}
                            placeholder={account?.requires_cost_center ? "Requerido" : "Opcional"}
                            className={account?.requires_cost_center ? "border-orange-500" : ""}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.debit_amount || ""}
                            onChange={(e) => updateLine(line.id, "debit_amount" as keyof DetailLine, (parseFloat(e.target.value) || 0) as any)}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.credit_amount || ""}
                            onChange={(e) => updateLine(line.id, "credit_amount" as keyof DetailLine, (parseFloat(e.target.value) || 0) as any)}
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeLine(line.id)}
                            disabled={detailLines.length <= 2}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow>
                    <TableCell colSpan={4} className="text-right font-semibold">
                      Totales:
                    </TableCell>
                    <TableCell className="font-semibold">
                      Q{getTotalDebit().toFixed(2)}
                    </TableCell>
                    <TableCell className="font-semibold">
                      Q{getTotalCredit().toFixed(2)}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {!isBalanced() && (
              <p className="text-sm text-destructive mt-2">
                ⚠️ La partida no está balanceada. Diferencia: Q{Math.abs(getTotalDebit() - getTotalCredit()).toFixed(2)}
              </p>
            )}
            {isBalanced() && getTotalDebit() > 0 && (
              <p className="text-sm text-green-600 mt-2">
                ✓ Partida balanceada correctamente
              </p>
            )}
          </div>

          {/* Acciones */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button 
              variant="secondary" 
              onClick={() => saveEntry(false)} 
              disabled={loading}
            >
              <Save className="mr-2 h-4 w-4" />
              Guardar Borrador
            </Button>
            <Button 
              onClick={() => saveEntry(true)} 
              disabled={loading || !isBalanced()}
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Contabilizar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
