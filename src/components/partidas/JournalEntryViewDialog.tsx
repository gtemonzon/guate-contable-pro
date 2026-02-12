import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import JournalEntryHistoryTimeline from "./JournalEntryHistoryTimeline";

interface JournalEntryDetail {
  line_number: number;
  account_code: string;
  account_name: string;
  description: string | null;
  debit_amount: number;
  credit_amount: number;
}

interface JournalEntryFull {
  id: number;
  entry_number: string;
  entry_date: string;
  entry_type: string;
  description: string;
  total_debit: number;
  total_credit: number;
  status: string;
  is_posted: boolean;
  created_by_name?: string;
  created_at?: string;
  updated_by_name?: string;
  updated_at?: string;
  details: JournalEntryDetail[];
}

interface JournalEntryViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryId: number | null;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("es-GT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatDateTime = (dateString?: string) => {
  if (!dateString) return "";
  return format(new Date(dateString), "dd/MM/yyyy HH:mm", { locale: es });
};

const STATUS_LABELS: Record<string, string> = {
  borrador: "Borrador",
  pendiente_revision: "Pendiente Revisión",
  aprobado: "Aprobado",
  contabilizado: "Contabilizado",
  rechazado: "Rechazado",
};

export default function JournalEntryViewDialog({
  open,
  onOpenChange,
  entryId,
}: JournalEntryViewDialogProps) {
  const [loading, setLoading] = useState(false);
  const [entry, setEntry] = useState<JournalEntryFull | null>(null);
  const [activeTab, setActiveTab] = useState("detalle");

  useEffect(() => {
    if (open && entryId) {
      fetchEntry(entryId);
    } else {
      setEntry(null);
    }
  }, [open, entryId]);

  const fetchEntry = async (id: number) => {
    try {
      setLoading(true);

      // Fetch entry with audit info
      const { data: entryData, error: entryError } = await supabase
        .from("tab_journal_entries")
        .select(`
          *,
          creator:tab_users!tab_journal_entries_created_by_fkey(full_name),
          modifier:tab_users!tab_journal_entries_updated_by_fkey(full_name)
        `)
        .eq("id", id)
        .single();

      if (entryError) throw entryError;

      // Fetch details with account info
      const { data: details, error: detailsError } = await supabase
        .from("tab_journal_entry_details")
        .select(`
          *,
          tab_accounts!inner (
            account_code,
            account_name
          )
        `)
        .eq("journal_entry_id", id)
        .is("deleted_at", null)
        .order("line_number");

      if (detailsError) throw detailsError;

      const journalEntry: JournalEntryFull = {
        ...entryData,
        created_by_name: entryData.creator?.full_name,
        updated_by_name: entryData.modifier?.full_name,
        details: (details || []).map((d: any) => ({
          line_number: d.line_number,
          account_code: d.tab_accounts.account_code,
          account_name: d.tab_accounts.account_name,
          description: d.description,
          debit_amount: Number(d.debit_amount) || 0,
          credit_amount: Number(d.credit_amount) || 0,
        })),
      };

      setEntry(journalEntry);
    } catch (error) {
      console.error("Error fetching journal entry:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalle de Partida</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-center text-muted-foreground py-8">
            Cargando partida...
          </p>
        ) : entry ? (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="detalle">Detalle</TabsTrigger>
              <TabsTrigger value="historial">Historial</TabsTrigger>
            </TabsList>

            <TabsContent value="detalle">
              <div className="space-y-4">
                {/* Header Info */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted rounded-lg">
                  <div>
                    <p className="text-sm text-muted-foreground">No. Partida</p>
                    <p className="font-semibold">{entry.entry_number}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Fecha</p>
                    <p className="font-semibold">{entry.entry_date}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Tipo</p>
                    <p className="font-semibold capitalize">{entry.entry_type}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Estado</p>
                    <Badge
                      variant={
                        entry.status === "contabilizado"
                          ? "default"
                          : entry.status === "rechazado"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {STATUS_LABELS[entry.status] || entry.status}
                    </Badge>
                  </div>
                  <div className="col-span-2 md:col-span-4">
                    <p className="text-sm text-muted-foreground">Descripción</p>
                    <p className="font-semibold">{entry.description}</p>
                  </div>
                </div>

                {/* Details Table */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">Línea</TableHead>
                      <TableHead className="w-[120px]">Código</TableHead>
                      <TableHead>Cuenta</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead className="text-right w-[120px]">Debe</TableHead>
                      <TableHead className="text-right w-[120px]">Haber</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entry.details.map((detail) => (
                      <TableRow key={detail.line_number}>
                        <TableCell>{detail.line_number}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {detail.account_code}
                        </TableCell>
                        <TableCell>{detail.account_name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {detail.description || "-"}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {detail.debit_amount > 0
                            ? formatCurrency(detail.debit_amount)
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {detail.credit_amount > 0
                            ? formatCurrency(detail.credit_amount)
                            : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Totals Row */}
                    <TableRow className="font-semibold bg-muted">
                      <TableCell colSpan={4} className="text-right">
                        Total
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(entry.total_debit)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(entry.total_credit)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>

                {/* Audit Info */}
                <div className="text-xs text-muted-foreground border-t pt-3 mt-4 space-y-1">
                  {entry.created_by_name && (
                    <p>
                      <span className="font-medium">Creado por:</span>{" "}
                      {entry.created_by_name} - {formatDateTime(entry.created_at)}
                    </p>
                  )}
                  {entry.updated_by_name && entry.updated_at && (
                    <p>
                      <span className="font-medium">Modificado por:</span>{" "}
                      {entry.updated_by_name} - {formatDateTime(entry.updated_at)}
                    </p>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="historial">
              <JournalEntryHistoryTimeline
                entryId={entryId}
                visible={activeTab === "historial"}
              />
            </TabsContent>
          </Tabs>
        ) : (
          <p className="text-center text-muted-foreground py-8">
            No se encontró la partida
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
