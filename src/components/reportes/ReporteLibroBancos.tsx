import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRecords } from "@/utils/supabaseHelpers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Loader2, Landmark } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { exportToExcel, exportToPDF } from "@/utils/reportExport";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { formatCurrency, cn } from "@/lib/utils";
import { FolioExportDialog, type FolioExportOptions } from "./FolioExportDialog";
import EntityLink from "@/components/ui/entity-link";

interface BankAccount {
  id: number;
  account_name: string;
  account_code: string;
}

interface BankDocRow {
  date: string;
  document_number: string;
  beneficiary: string;
  concept: string;
  direction: string;
  debit: number;
  credit: number;
  status: string;
  journal_entry_number: string | null;
  journal_entry_id: number | null;
  source: "document" | "journal";
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  ISSUED: "Emitido",
  POSTED: "Contabilizado",
  VOID: "Anulado",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "secondary",
  ISSUED: "outline",
  POSTED: "default",
  VOID: "destructive",
};

export default function ReporteLibroBancos() {
  const [searchParams] = useSearchParams();
  const [enterpriseId, setEnterpriseId] = useState<string | null>(null);
  const [enterpriseName, setEnterpriseName] = useState("");
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [openingBalance, setOpeningBalance] = useState(0);
  const [rows, setRows] = useState<BankDocRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const { toast } = useToast();

  // Load enterprise + bank accounts + URL params
  useEffect(() => {
    const eid = localStorage.getItem("currentEnterpriseId");
    setEnterpriseId(eid);
    if (!eid) return;

    const urlDateFrom = searchParams.get("dateFrom");
    const urlDateTo = searchParams.get("dateTo");
    const urlBankId = searchParams.get("bankAccountId");

    if (urlDateFrom) setDateFrom(urlDateFrom);
    else if (!dateFrom) {
      const d = new Date();
      setDateFrom(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
    }
    if (urlDateTo) setDateTo(urlDateTo);
    else if (!dateTo) setDateTo(new Date().toISOString().split("T")[0]);

    (async () => {
      const [{ data: enterprise }, { data: banks }] = await Promise.all([
        supabase.from("tab_enterprises").select("business_name").eq("id", parseInt(eid)).single(),
        supabase.from("tab_accounts").select("id, account_name, account_code").eq("enterprise_id", parseInt(eid)).eq("is_bank_account", true).eq("is_active", true).is("deleted_at", null).order("account_code"),
      ]);
      setEnterpriseName(enterprise?.business_name || "");
      setBankAccounts(banks || []);

      // Pre-select bank from URL param
      if (urlBankId && banks) {
        const bankId = parseInt(urlBankId);
        if (banks.some(b => b.id === bankId)) {
          setSelectedBankId(bankId);
        }
      }
    })();
  }, [searchParams]);

  const loadReport = async () => {
    if (!enterpriseId || !selectedBankId) {
      toast({ title: "Seleccione cuenta bancaria", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      const bank = bankAccounts.find(b => b.id === selectedBankId);
      const allRows: BankDocRow[] = [];

      // Resolve tab_bank_accounts record linked to this GL account (if any)
      const { data: linkedBankAcct } = await supabase
        .from("tab_bank_accounts")
        .select("id")
        .eq("account_id", selectedBankId)
        .eq("enterprise_id", parseInt(enterpriseId))
        .maybeSingle();

      // 1. Fetch bank documents (only if a tab_bank_accounts record exists)
      if (linkedBankAcct) {
        let docQuery = supabase
          .from("tab_bank_documents")
          .select("*, journal_entry:tab_journal_entries!tab_bank_documents_journal_entry_id_fkey(entry_number)")
          .eq("enterprise_id", parseInt(enterpriseId))
          .eq("bank_account_id", linkedBankAcct.id)
          .gte("document_date", dateFrom)
          .lte("document_date", dateTo)
          .order("document_date")
          .order("created_at");

        if (statusFilter !== "ALL") {
          docQuery = docQuery.eq("status", statusFilter);
        }

        const docs = await fetchAllRecords<any>(docQuery);

        for (const doc of docs) {
          const isVoid = doc.status === "VOID";
          allRows.push({
            date: doc.document_date,
            document_number: doc.document_number,
            beneficiary: doc.beneficiary_name || "",
            concept: doc.concept || "",
            direction: doc.direction,
            debit: isVoid ? 0 : 0,
            credit: isVoid ? 0 : 0,
            status: doc.status,
            journal_entry_number: doc.journal_entry?.entry_number || null,
            journal_entry_id: doc.journal_entry_id || null,
            source: "document",
          });
        }
      }


      // 2. Fetch journal entry movements affecting this bank's GL account
      if (bank) {
        const jeQuery = supabase
          .from("tab_journal_entry_details")
          .select(`
            debit_amount, credit_amount, description,
            journal_entry:tab_journal_entries!inner(
              id, entry_number, entry_date, description, is_posted, status,
              bank_reference, beneficiary_name, bank_direction, enterprise_id
            )
          `)
          .eq("account_id", bank.id)
          .eq("journal_entry.enterprise_id", parseInt(enterpriseId))
          .eq("journal_entry.is_posted", true)
          .gte("journal_entry.entry_date", dateFrom)
          .lte("journal_entry.entry_date", dateTo)
          .order("journal_entry(entry_date)");

        const movements = await fetchAllRecords<any>(jeQuery);

        // Track which journal entries are already represented by documents
        const docEntryNumbers = new Set(allRows.filter(r => r.journal_entry_number).map(r => r.journal_entry_number));

        for (const mov of movements) {
          const je = mov.journal_entry;
          if (!je) continue;

          // If this entry is already covered by a bank document, update amounts
          const existingIdx = allRows.findIndex(r => r.journal_entry_number === je.entry_number && r.source === "document");
          if (existingIdx !== -1) {
            allRows[existingIdx].debit = Number(mov.debit_amount) || 0;
            allRows[existingIdx].credit = Number(mov.credit_amount) || 0;
            continue;
          }

          // Add as journal-sourced row
          allRows.push({
            date: je.entry_date,
            document_number: je.bank_reference || je.entry_number,
            beneficiary: je.beneficiary_name || "",
            concept: je.description || mov.description || "",
            direction: je.bank_direction || (Number(mov.debit_amount) > 0 ? "IN" : "OUT"),
            debit: Number(mov.debit_amount) || 0,
            credit: Number(mov.credit_amount) || 0,
            status: "POSTED",
            journal_entry_number: je.entry_number,
            journal_entry_id: je.id,
            source: "journal",
          });
        }
      }

      // Apply status filter to journal-sourced rows too
      const filtered = statusFilter === "ALL"
        ? allRows
        : allRows.filter(r => r.status === statusFilter);

      // Sort by date, then by document number
      filtered.sort((a, b) => {
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) return dateCompare;
        return a.document_number.localeCompare(b.document_number);
      });

      setRows(filtered);
    } catch (error: any) {
      toast({ title: "Error al cargar libro de bancos", description: getSafeErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Compute running balance
  const rowsWithBalance = useMemo(() => {
    let balance = openingBalance;
    return rows.map(r => {
      balance = balance + r.debit - r.credit;
      return { ...r, runningBalance: balance };
    });
  }, [rows, openingBalance]);

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const finalBalance = openingBalance + totalDebit - totalCredit;

  const selectedBank = bankAccounts.find(b => b.id === selectedBankId);
  const reportTitle = selectedBank
    ? `Libro de Bancos — ${selectedBank.account_name} (${selectedBank.account_code})`
    : "Libro de Bancos";

  const handleExport = (options: FolioExportOptions) => {
    const headers = ["Fecha", "Doc #", "Beneficiario", "Concepto", "Dir.", "Debe", "Haber", "Saldo", "Estado", "Partida"];
    const data = rowsWithBalance.map(r => [
      new Date(r.date + "T00:00:00").toLocaleDateString("es-GT"),
      r.document_number,
      r.beneficiary,
      r.concept,
      r.direction === "IN" ? "Ingreso" : "Egreso",
      r.debit > 0 ? formatCurrency(r.debit) : "",
      r.credit > 0 ? formatCurrency(r.credit) : "",
      formatCurrency(r.runningBalance),
      STATUS_LABELS[r.status] || r.status,
      r.journal_entry_number || "",
    ]);

    const exportOpts = {
      filename: `libro-bancos-${selectedBank?.account_code || ""}`,
      title: reportTitle,
      enterpriseName,
      headers,
      data,
      totals: [
        { label: "Saldo Inicial", value: `Q${formatCurrency(openingBalance)}` },
        { label: "Total Debe", value: `Q${formatCurrency(totalDebit)}` },
        { label: "Total Haber", value: `Q${formatCurrency(totalCredit)}` },
        { label: "Saldo Final", value: `Q${formatCurrency(finalBalance)}` },
      ],
      folioOptions: options.includeFolio ? { includeFolio: true, startingFolio: options.startingFolio } : undefined,
    };

    if (options.format === "excel") {
      exportToExcel(exportOpts);
    } else {
      exportToPDF(exportOpts);
    }
    toast({ title: "Reporte exportado" });
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 items-end">
        <div>
          <Label>Cuenta Bancaria</Label>
          <Select value={selectedBankId?.toString() || ""} onValueChange={v => setSelectedBankId(parseInt(v))}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar..." />
            </SelectTrigger>
            <SelectContent>
              {bankAccounts.map(b => (
                <SelectItem key={b.id} value={b.id.toString()}>
                  {b.account_code} — {b.account_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Desde</Label>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>

        <div>
          <Label>Hasta</Label>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>

        <div>
          <Label>Estado</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              <SelectItem value="POSTED">Contabilizado</SelectItem>
              <SelectItem value="ISSUED">Emitido</SelectItem>
              <SelectItem value="VOID">Anulado</SelectItem>
              <SelectItem value="DRAFT">Borrador</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button onClick={loadReport} disabled={loading || !selectedBankId}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Landmark className="mr-2 h-4 w-4" />}
            Generar
          </Button>
          {rows.length > 0 && (
            <Button variant="outline" size="icon" onClick={() => setExportDialogOpen(true)}>
              <Download className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Opening Balance */}
      <div className="flex items-center gap-4">
        <Label className="whitespace-nowrap">Saldo Inicial (Q)</Label>
        <Input
          type="number"
          step="0.01"
          value={openingBalance || ""}
          onChange={e => setOpeningBalance(parseFloat(e.target.value) || 0)}
          className="w-48 font-mono"
          placeholder="0.00"
        />
        <span className="text-xs text-muted-foreground">
          Ingrese el saldo de apertura del período o el saldo del extracto anterior.
        </span>
      </div>

      {/* Results Table */}
      {rows.length > 0 && (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[90px]">Fecha</TableHead>
                <TableHead className="w-[100px]">Doc #</TableHead>
                <TableHead>Beneficiario</TableHead>
                <TableHead>Concepto</TableHead>
                <TableHead className="w-[60px] text-center">Dir.</TableHead>
                <TableHead className="w-[110px] text-right">Debe</TableHead>
                <TableHead className="w-[110px] text-right">Haber</TableHead>
                <TableHead className="w-[110px] text-right">Saldo</TableHead>
                <TableHead className="w-[100px] text-center">Estado</TableHead>
                <TableHead className="w-[100px]">Partida</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Opening balance row */}
              <TableRow className="bg-muted/50 font-medium">
                <TableCell colSpan={7} className="text-right">Saldo Inicial</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(openingBalance)}</TableCell>
                <TableCell colSpan={2}></TableCell>
              </TableRow>

              {rowsWithBalance.map((r, i) => (
                <TableRow key={i} className={cn(r.status === "VOID" && "opacity-60 line-through decoration-destructive/40")}>
                  <TableCell className="text-sm">{new Date(r.date + "T00:00:00").toLocaleDateString("es-GT")}</TableCell>
                  <TableCell className="font-mono text-sm">{r.document_number}</TableCell>
                  <TableCell className="text-sm truncate max-w-[150px]" title={r.beneficiary}>{r.beneficiary || "—"}</TableCell>
                  <TableCell className="text-sm truncate max-w-[200px]" title={r.concept}>{r.concept || "—"}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className={cn("text-[10px]", r.direction === "IN" ? "border-green-500 text-green-600" : "border-orange-500 text-orange-600")}>
                      {r.direction === "IN" ? "Ingreso" : "Egreso"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{r.debit > 0 ? formatCurrency(r.debit) : "—"}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{r.credit > 0 ? formatCurrency(r.credit) : "—"}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-medium">{formatCurrency(r.runningBalance)}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={STATUS_VARIANT[r.status] || "secondary"} className="text-[10px]">
                      {STATUS_LABELS[r.status] || r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.journal_entry_number ? (
                      <EntityLink
                        type="journal_entry"
                        label={r.journal_entry_number}
                        id={r.journal_entry_id ?? undefined}
                        secondaryLabel={r.concept}
                      />
                    ) : "—"}
                  </TableCell>
                </TableRow>
              ))}

              {/* Totals */}
              <TableRow className="font-semibold bg-muted/50">
                <TableCell colSpan={5} className="text-right">Totales:</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(totalDebit)}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(totalCredit)}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(finalBalance)}</TableCell>
                <TableCell colSpan={2}></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}

      {!loading && rows.length === 0 && selectedBankId && (
        <div className="text-center py-12 text-muted-foreground">
          <Landmark className="mx-auto h-12 w-12 mb-4 opacity-30" />
          <p>Seleccione los filtros y presione <strong>Generar</strong> para ver el libro de bancos.</p>
        </div>
      )}

      <FolioExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        onExport={handleExport}
        title="Exportar Libro de Bancos"
      />
    </div>
  );
}
