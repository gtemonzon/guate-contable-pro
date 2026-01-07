import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Trash2, Save, CheckCircle, Check, ChevronsUpDown, XCircle, Clock, ThumbsUp, ThumbsDown } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { Badge } from "@/components/ui/badge";

type EntryStatus = 'borrador' | 'pendiente_revision' | 'aprobado' | 'contabilizado' | 'rechazado';

interface Account {
  id: number;
  account_code: string;
  account_name: string;
  requires_cost_center: boolean;
  balance_type: string;
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
  entryToEdit?: {
    id: number;
    entry_number: string;
    entry_date: string;
    entry_type: string;
    description: string;
    total_debit: number;
    total_credit: number;
    is_posted: boolean;
    status?: EntryStatus;
    rejection_reason?: string | null;
  } | null;
}

export default function JournalEntryDialog({
  open,
  onOpenChange,
  onSuccess,
  entryToEdit = null,
}: JournalEntryDialogProps) {
  const [loading, setLoading] = useState(false);
  const [isLoadingEntry, setIsLoadingEntry] = useState(false);
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
  
  // Estado para búsqueda de cuentas por línea
  const [accountSearch, setAccountSearch] = useState<Record<string, string>>({});
  
  // Estado para el diálogo de confirmación al cerrar
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  
  // Estado para el diálogo de rechazo
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  
  // Estado actual de la partida
  const [entryStatus, setEntryStatus] = useState<EntryStatus>('borrador');

  // Estado para información de auditoría
  const [auditInfo, setAuditInfo] = useState<{
    createdBy: string | null;
    createdAt: string | null;
    updatedBy: string | null;
    updatedAt: string | null;
  } | null>(null);

  const { toast } = useToast();
  const permissions = useUserPermissions();

  // Función para formatear fecha y hora
  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString('es-GT', {
      day: '2-digit',
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Limpiar formulario antes de cargar datos de edición (evita flash de datos anteriores)
  const resetFormForEdit = () => {
    setNextEntryNumber("");
    setEntryDate("");
    setEntryType("");
    setPeriodId(null);
    setDocumentReference("");
    setHeaderDescription("");
    setDetailLines([]);
    setAuditInfo(null);
    setEntryStatus('borrador');
    setAccountSearch({});
  };

  useEffect(() => {
    if (open) {
      if (entryToEdit) {
        // Limpiar formulario y mostrar loading antes de cargar
        resetFormForEdit();
        setIsLoadingEntry(true);
        loadEntryData(entryToEdit.id).finally(() => {
          setIsLoadingEntry(false);
        });
      } else {
        loadInitialData();
        resetForm();
      }
    }
  }, [open, entryToEdit]);

  // Función para propagar la descripción del encabezado a líneas vacías (llamada al perder el foco)
  const propagateDescriptionToLines = useCallback(() => {
    if (headerDescription && !entryToEdit) {
      setDetailLines(lines => 
        lines.map(line => ({
          ...line,
          description: line.description === "" ? headerDescription : line.description
        }))
      );
    }
  }, [headerDescription, entryToEdit]);

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
      // Cargar cuentas que permiten movimiento
      const { data: accountsData, error: accountsError } = await supabase
        .from("tab_accounts")
        .select("id, account_code, account_name, requires_cost_center, balance_type")
        .eq("enterprise_id", parseInt(enterpriseId))
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

      // Obtener siguiente número de partida (solo PD-*) y evitar duplicados
      const { data: pdEntries, error: pdError } = await supabase
        .from("tab_journal_entries")
        .select("entry_number")
        .eq("enterprise_id", parseInt(enterpriseId))
        .ilike("entry_number", "PD-%")
        .order("id", { ascending: false })
        .limit(300);

      if (pdError) throw pdError;

      const maxPdNumber = (pdEntries || []).reduce((max, row) => {
        const match = String(row.entry_number || "").match(/^PD-(\d+)/i);
        const n = match ? Number(match[1]) : NaN;
        return Number.isFinite(n) ? Math.max(max, n) : max;
      }, 0);

      let candidate = maxPdNumber > 0 ? maxPdNumber + 1 : 1;
      let found = false;
      // Evitar sugerir un número ya tomado (por si hay huecos/duplicados)
      for (let i = 0; i < 50; i++) {
        const candidateStr = `PD-${String(candidate).padStart(6, "0")}`;
        const { data: existing } = await supabase
          .from("tab_journal_entries")
          .select("id")
          .eq("enterprise_id", parseInt(enterpriseId))
          .eq("entry_number", candidateStr)
          .maybeSingle();

        if (!existing) {
          setNextEntryNumber(candidateStr);
          found = true;
          break;
        }
        candidate++;
      }

      if (!found) {
        // Fallback (muy improbable): sugerir el siguiente correlativo
        setNextEntryNumber(`PD-${String(candidate).padStart(6, "0")}`);
      }
    } catch (error: any) {
      toast({
        title: "Error al cargar datos",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  // Snapshot inicial para detectar cambios reales (evita falsos positivos al cargar borradores)
  const initialSnapshotRef = useRef<string>("");

  const serializeForDirtyCheck = useCallback(
    (state: {
      entryDate: string;
      entryType: string;
      periodId: number | null;
      documentReference: string;
      headerDescription: string;
      detailLines: Array<Omit<DetailLine, "id">>;
    }) => {
      return JSON.stringify({
        entryDate: state.entryDate,
        entryType: state.entryType,
        periodId: state.periodId,
        documentReference: state.documentReference,
        headerDescription: state.headerDescription,
        detailLines: state.detailLines.map((l) => ({
          account_id: l.account_id,
          description: l.description,
          bank_reference: l.bank_reference,
          cost_center: l.cost_center,
          debit_amount: Number(l.debit_amount || 0),
          credit_amount: Number(l.credit_amount || 0),
        })),
      });
    },
    [],
  );

  const resetForm = () => {
    const freshEntryDate = new Date().toISOString().split("T")[0];
    const freshLines: DetailLine[] = [
      {
        id: crypto.randomUUID(),
        account_id: null,
        description: "",
        bank_reference: "",
        cost_center: "",
        debit_amount: 0,
        credit_amount: 0,
      },
      {
        id: crypto.randomUUID(),
        account_id: null,
        description: "",
        bank_reference: "",
        cost_center: "",
        debit_amount: 0,
        credit_amount: 0,
      },
    ];

    // Guardar snapshot inicial (nuevo)
    initialSnapshotRef.current = serializeForDirtyCheck({
      entryDate: freshEntryDate,
      entryType: "diario",
      periodId: null,
      documentReference: "",
      headerDescription: "",
      detailLines: freshLines.map(({ id, ...rest }) => rest),
    });

    setEntryDate(freshEntryDate);
    setEntryType("diario");
    setPeriodId(null);
    setDocumentReference("");
    setHeaderDescription("");
    setDetailLines(freshLines);
    setShowCloseConfirm(false);
    setShowRejectDialog(false);
    setRejectionReason("");
    setEntryStatus('borrador');
  };

  // Verificar si hay cambios sin guardar (comparando contra snapshot inicial)
  const hasUnsavedChanges = useCallback(() => {
    if (!initialSnapshotRef.current) return false;

    const currentSnapshot = serializeForDirtyCheck({
      entryDate,
      entryType,
      periodId,
      documentReference,
      headerDescription,
      detailLines: detailLines.map(({ id, ...rest }) => rest),
    });

    return currentSnapshot !== initialSnapshotRef.current;
  }, [
    detailLines,
    documentReference,
    entryDate,
    entryType,
    headerDescription,
    periodId,
    serializeForDirtyCheck,
  ]);

  // Manejar intento de cerrar el modal
  const handleCloseAttempt = useCallback((newOpen: boolean) => {
    if (!newOpen && hasUnsavedChanges()) {
      setShowCloseConfirm(true);
    } else {
      onOpenChange(newOpen);
    }
  }, [hasUnsavedChanges, onOpenChange]);

  // Cerrar sin guardar
  const handleDiscardAndClose = () => {
    setShowCloseConfirm(false);
    resetForm();
    onOpenChange(false);
  };

  // Guardar como borrador y cerrar
  const handleSaveDraftAndClose = async () => {
    setShowCloseConfirm(false);
    await saveEntry(false);
  };

  const loadEntryData = async (entryId: number) => {
    const enterpriseId = localStorage.getItem("currentEnterpriseId");
    if (!enterpriseId) return;

    try {
      // Cargar datos comunes (cuentas y períodos)
      await loadInitialData();

      // Cargar datos de la partida con información de auditoría
      const { data: entry, error: entryError } = await supabase
        .from("tab_journal_entries")
        .select(`
          *,
          creator:tab_users!tab_journal_entries_created_by_fkey(full_name),
          modifier:tab_users!tab_journal_entries_updated_by_fkey(full_name)
        `)
        .eq("id", entryId)
        .single();

      if (entryError) throw entryError;

      // Cargar líneas de detalle
      const { data: details, error: detailsError } = await supabase
        .from("tab_journal_entry_details")
        .select("*")
        .eq("journal_entry_id", entryId)
        .order("line_number");

      if (detailsError) throw detailsError;

      // Llenar formulario
      setNextEntryNumber(entry.entry_number);
      setEntryDate(entry.entry_date);
      setEntryType(entry.entry_type);
      setPeriodId(entry.accounting_period_id);
      setDocumentReference(entry.document_reference || "");
      setHeaderDescription(entry.description);

      // Establecer información de auditoría
      setAuditInfo({
        createdBy: entry.creator?.full_name || null,
        createdAt: entry.created_at,
        updatedBy: entry.modifier?.full_name || null,
        updatedAt: entry.updated_at,
      });
      
      // Establecer estado de la partida
      setEntryStatus((entry.status || (entry.is_posted ? 'contabilizado' : 'borrador')) as EntryStatus);

      // Convertir detalles a formato de líneas
      const lines: DetailLine[] = details.map((d) => ({
        id: crypto.randomUUID(),
        account_id: d.account_id,
        description: d.description || "",
        bank_reference: d.bank_reference || "",
        cost_center: d.cost_center || "",
        debit_amount: d.debit_amount,
        credit_amount: d.credit_amount,
      }));

      // Guardar snapshot inicial (editar / borrador)
      initialSnapshotRef.current = serializeForDirtyCheck({
        entryDate: entry.entry_date,
        entryType: entry.entry_type,
        periodId: entry.accounting_period_id,
        documentReference: entry.document_reference || "",
        headerDescription: entry.description,
        detailLines: lines.map(({ id, ...rest }) => rest),
      });

      setDetailLines(lines);
    } catch (error: any) {
      toast({
        title: "Error al cargar partida",
        description: getSafeErrorMessage(error),
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
    setDetailLines(lines => {
      const updatedLines = lines.map(line =>
        line.id === id ? { ...line, [field]: value } : line
      );
      
      // Auto-agregar nueva línea si se ingresó un monto en la última línea
      const lineIndex = updatedLines.findIndex(l => l.id === id);
      const isLastLine = lineIndex === updatedLines.length - 1;
      
      if (isLastLine && (field === "debit_amount" || field === "credit_amount") && value > 0) {
        // Agregar nueva línea
        updatedLines.push({
          id: crypto.randomUUID(),
          account_id: null,
          description: headerDescription,
          bank_reference: "",
          cost_center: "",
          debit_amount: 0,
          credit_amount: 0
        });
      }
      
      return updatedLines;
    });
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

    // Filtrar líneas vacías - solo mantener líneas con cuenta o monto
    const validLines = detailLines.filter(line => {
      const hasAccount = line.account_id !== null;
      const hasAmount = line.debit_amount > 0 || line.credit_amount > 0;
      
      // Mantener si tiene cuenta o monto
      return hasAccount || hasAmount;
    });

    // Actualizar las líneas eliminando las vacías
    setDetailLines(validLines.length >= 2 ? validLines : detailLines);

    if (validLines.length < 2) {
      toast({
        title: "Líneas insuficientes",
        description: "Una partida debe tener al menos 2 líneas de detalle",
        variant: "destructive",
      });
      return false;
    }

    for (const line of validLines) {
      // Error si tiene monto pero no tiene cuenta
      if (!line.account_id && (line.debit_amount > 0 || line.credit_amount > 0)) {
        toast({
          title: "Cuenta requerida",
          description: "Hay líneas con monto que no tienen cuenta asignada",
          variant: "destructive",
        });
        return false;
      }

      // Error si tiene cuenta pero no tiene monto
      if (line.account_id && line.debit_amount === 0 && line.credit_amount === 0) {
        toast({
          title: "Monto requerido",
          description: "Hay líneas con cuenta asignada que no tienen monto",
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

    // Validar sobregiros antes de guardar
    const validLines = detailLines.filter(line => line.account_id !== null);
    
    for (const line of validLines) {
      const account = accounts.find(a => a.id === line.account_id);
      if (!account) continue;

      // Obtener saldo actual de la cuenta (excluyendo la póliza que se está editando)
      let query = supabase
        .from("tab_journal_entry_details")
        .select("debit_amount, credit_amount")
        .eq("account_id", line.account_id);
      
      // Si estamos editando una póliza existente, excluir sus movimientos del cálculo
      if (entryToEdit?.id) {
        query = query.neq("journal_entry_id", entryToEdit.id);
      }
      
      const { data: movements, error: movError } = await query;

      if (movError) {
        console.error("Error al obtener movimientos:", movError);
        continue;
      }

      // Calcular saldo actual (sin incluir la póliza en edición)
      const currentBalance = (movements || []).reduce((acc, mov) => {
        return acc + (Number(mov.debit_amount) || 0) - (Number(mov.credit_amount) || 0);
      }, 0);

      // Calcular nuevo saldo después de este movimiento
      // Redondear a 2 decimales para evitar errores de precisión de punto flotante
      const rawNewBalance = currentBalance + (Number(line.debit_amount) || 0) - (Number(line.credit_amount) || 0);
      const newBalance = Math.round(rawNewBalance * 100) / 100;

      // Validar según tipo de saldo (omitir validación para cuentas con saldo indiferente)
      if (account.balance_type === 'indiferente') {
        continue; // Permitir cualquier saldo para cuentas indiferentes
      }

      if (account.balance_type === 'deudor' && newBalance < 0) {
        toast({
          title: "Sobregiro detectado",
          description: `La cuenta ${account.account_code} - ${account.account_name} no tiene saldos suficientes para este registro. Saldo actual: ${formatCurrency(currentBalance)}. No se pueden crear sobregiros en la cuenta.`,
          variant: "destructive",
        });
        return;
      }

      if (account.balance_type === 'acreedor' && newBalance > 0) {
        toast({
          title: "Sobregiro detectado",
          description: `La cuenta ${account.account_code} - ${account.account_name} no tiene saldos suficientes para este registro. Saldo actual: ${formatCurrency(Math.abs(currentBalance))}. No se pueden crear sobregiros en la cuenta.`,
          variant: "destructive",
        });
        return;
      }
    }

    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuario no autenticado");

      if (entryToEdit) {
        // Actualizar partida existente
      const { error: updateError } = await supabase
        .from("tab_journal_entries")
        .update({
          entry_date: entryDate,
          entry_type: entryType,
          accounting_period_id: periodId,
          document_reference: documentReference || null,
          description: headerDescription,
          total_debit: getTotalDebit(),
          total_credit: getTotalCredit(),
          is_posted: post,
          posted_at: post ? new Date().toISOString() : null,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
          status: post ? 'contabilizado' : 'borrador',
        })
        .eq("id", entryToEdit.id);

        if (updateError) throw updateError;

        // Eliminar líneas antiguas
        const { error: deleteError } = await supabase
          .from("tab_journal_entry_details")
          .delete()
          .eq("journal_entry_id", entryToEdit.id);

        if (deleteError) throw deleteError;

        // Insertar nuevas líneas
        const detailsToInsert = detailLines.map((line, index) => ({
          journal_entry_id: entryToEdit.id,
          line_number: index + 1,
          account_id: line.account_id,
          description: line.description || headerDescription,
          bank_reference: line.bank_reference || null,
          cost_center: line.cost_center || null,
          debit_amount: line.debit_amount,
          credit_amount: line.credit_amount,
        }));

        const { error: insertError } = await supabase
          .from("tab_journal_entry_details")
          .insert(detailsToInsert);

        if (insertError) throw insertError;

        toast({
          title: "Partida actualizada",
          description: `Partida ${nextEntryNumber} actualizada exitosamente`,
        });
      } else {
        // Verificar si el número de partida ya existe
        const { data: existingEntry } = await supabase
          .from("tab_journal_entries")
          .select("id")
          .eq("enterprise_id", parseInt(enterpriseId))
          .eq("entry_number", nextEntryNumber)
          .maybeSingle();

        if (existingEntry) {
          toast({
            title: "Número de partida duplicado",
            description: `Ya existe una partida con el número ${nextEntryNumber}. Por favor, use un número diferente.`,
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        // Insertar nueva partida
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
          is_posted: post,
          posted_at: post ? new Date().toISOString() : null,
          created_by: user.id,
          status: post ? 'contabilizado' : 'borrador',
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
      }

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
    <>
      <Dialog open={open} onOpenChange={handleCloseAttempt}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{entryToEdit ? 'Editar' : 'Nueva'} Partida Contable</DialogTitle>
        </DialogHeader>

        {isLoadingEntry ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            <p className="text-muted-foreground">Cargando partida...</p>
          </div>
        ) : (
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
                  {periods.map((period) => {
                    const startDate = new Date(period.start_date + 'T00:00:00');
                    const endDate = new Date(period.end_date + 'T00:00:00');
                    return (
                      <SelectItem key={period.id} value={period.id.toString()}>
                        {period.year} ({startDate.toLocaleDateString('es-GT')} - {endDate.toLocaleDateString('es-GT')})
                      </SelectItem>
                    );
                  })}
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
                onBlur={propagateDescriptionToLines}
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
                          <Popover onOpenChange={(open) => {
                            if (!open) {
                              setAccountSearch(prev => ({ ...prev, [line.id]: "" }));
                            }
                          }}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                className="w-full justify-between font-normal"
                              >
                                {line.account_id
                                  ? (() => {
                                      const acc = accounts.find(a => a.id === line.account_id);
                                      return acc ? `${acc.account_code} - ${acc.account_name}` : "Seleccionar";
                                    })()
                                  : "Seleccionar"}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[400px] p-0" align="start">
                              <Command shouldFilter={false}>
                                <CommandInput 
                                  placeholder="Buscar cuenta..." 
                                  value={accountSearch[line.id] || ""}
                                  onValueChange={(value) => {
                                    setAccountSearch(prev => ({ ...prev, [line.id]: value }));
                                  }}
                                />
                                <CommandList>
                                  <CommandEmpty>No se encontró la cuenta.</CommandEmpty>
                                  <CommandGroup>
                                    <ScrollArea className="h-[300px]">
                                      {accounts
                                        .filter(acc => {
                                          const search = (accountSearch[line.id] || "").toLowerCase();
                                          if (!search) return true;
                                          return `${acc.account_code} ${acc.account_name}`.toLowerCase().includes(search);
                                        })
                                        .map((acc) => (
                                          <CommandItem
                                            key={acc.id}
                                            value={`${acc.account_code} ${acc.account_name}`}
                                            onSelect={() => {
                                              updateLine(line.id, "account_id" as keyof DetailLine, acc.id as any);
                                              setAccountSearch(prev => ({ ...prev, [line.id]: "" }));
                                            }}
                                          >
                                            <Check
                                              className={cn(
                                                "mr-2 h-4 w-4",
                                                line.account_id === acc.id ? "opacity-100" : "opacity-0"
                                              )}
                                            />
                                            {acc.account_code} - {acc.account_name}
                                          </CommandItem>
                                        ))}
                                    </ScrollArea>
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
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
                            disabled={line.credit_amount > 0}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.credit_amount || ""}
                            onChange={(e) => updateLine(line.id, "credit_amount" as keyof DetailLine, (parseFloat(e.target.value) || 0) as any)}
                            disabled={line.debit_amount > 0}
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
                      {formatCurrency(getTotalDebit())}
                    </TableCell>
                    <TableCell className="font-semibold">
                      {formatCurrency(getTotalCredit())}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {!isBalanced() && (
              <p className="text-sm text-destructive mt-2">
                ⚠️ La partida no está balanceada. Diferencia: {formatCurrency(Math.abs(getTotalDebit() - getTotalCredit()))}
              </p>
            )}
            {isBalanced() && getTotalDebit() > 0 && (
              <p className="text-sm text-green-600 mt-2">
                ✓ Partida balanceada correctamente
              </p>
            )}
          </div>

          {/* Información de Auditoría */}
          {entryToEdit && auditInfo && (
            <div className="text-xs text-muted-foreground border-t pt-3 space-y-1">
              {auditInfo.createdBy && (
                <p>
                  <span className="font-medium">Creado por:</span> {auditInfo.createdBy} - {formatDateTime(auditInfo.createdAt)}
                </p>
              )}
              {auditInfo.updatedBy && auditInfo.updatedAt && (
                <p>
                  <span className="font-medium">Modificado por:</span> {auditInfo.updatedBy} - {formatDateTime(auditInfo.updatedAt)}
                </p>
              )}
            </div>
          )}

          {/* Acciones */}
          <div className="flex justify-between gap-2">
            <div className="flex items-center gap-2">
              {/* Mostrar estado actual */}
              {entryToEdit && (
                <Badge variant={entryStatus === 'contabilizado' ? 'default' : entryStatus === 'rechazado' ? 'destructive' : 'secondary'}>
                  {entryStatus === 'borrador' && 'Borrador'}
                  {entryStatus === 'pendiente_revision' && 'Pendiente de Revisión'}
                  {entryStatus === 'aprobado' && 'Aprobado'}
                  {entryStatus === 'contabilizado' && 'Contabilizado'}
                  {entryStatus === 'rechazado' && 'Rechazado'}
                </Badge>
              )}
            </div>
            
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => handleCloseAttempt(false)} disabled={loading}>
                Cancelar
              </Button>
              
              {/* Botones según permisos y estado */}
              {entryStatus !== 'contabilizado' && permissions.canCreateEntries && (
                <Button 
                  variant="secondary" 
                  onClick={() => saveEntry(false)} 
                  disabled={loading}
                >
                  <Save className="mr-2 h-4 w-4" />
                  Guardar
                </Button>
              )}
              
              {entryStatus !== 'contabilizado' && permissions.canPostEntries && (
                <Button 
                  onClick={() => saveEntry(true)} 
                  disabled={loading || !isBalanced()}
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Contabilizar
                </Button>
              )}
            </div>
          </div>
        </div>
        )}
      </DialogContent>
    </Dialog>

    <AlertDialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Guardar borrador?</AlertDialogTitle>
          <AlertDialogDescription>
            Tiene cambios sin guardar. ¿Desea guardar la partida como borrador antes de salir?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={() => {
              setShowCloseConfirm(false);
            }}
          >
            Cancelar
          </AlertDialogCancel>
          <AlertDialogCancel onClick={handleDiscardAndClose}>No, descartar</AlertDialogCancel>
          <AlertDialogAction onClick={handleSaveDraftAndClose}>
            Sí, guardar borrador
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
