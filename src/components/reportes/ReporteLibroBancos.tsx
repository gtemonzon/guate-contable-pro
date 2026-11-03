import { useState, useEffect, useMemo } from "react";
import { TruncatedText } from "@/components/ui/truncated-text";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import EntityLink from "@/components/ui/entity-link";
import { ReportCurrencySelector, defaultReportCurrencyState, type ReportCurrencyState } from "./ReportCurrencySelector";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import {
  STATUS_LABELS,
  STATUS_VARIANT,
  fetchBankLedger,
  fetchSuggestedOpeningBalance,
  withRunningBalance,
  type BankDocRow,
} from "@/services/bankLedger";

interface BankAccount {
  id: number;
  account_name: string;
  account_code: string;
}

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
  const [hasGenerated, setHasGenerated] = useState(false);
  const [currencyView, setCurrencyView] = useState<ReportCurrencyState>(defaultReportCurrencyState);
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

  // Reset generated state when switching bank account or date range
  useEffect(() => {
    setHasGenerated(false);
  }, [selectedBankId, dateFrom, dateTo]);


  // Suggest opening balance from posted movements before dateFrom,
  // bounded below by the fiscal floor to avoid double-counting the apertura entry
  useEffect(() => {
    if (!enterpriseId || !selectedBankId || !dateFrom) return;

    (async () => {
      try {
        const suggestedOpening = await fetchSuggestedOpeningBalance({
          enterpriseId: parseInt(enterpriseId),
          bankGlAccountId: selectedBankId,
          dateFrom,
        });
        setOpeningBalance(suggestedOpening);
      } catch {
        // Leave default value on error
      }
    })();
  }, [enterpriseId, selectedBankId, dateFrom]);


  const loadReport = async () => {
    if (!enterpriseId || !selectedBankId) {
      toast({ title: "Seleccione cuenta bancaria", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      const bank = bankAccounts.find(b => b.id === selectedBankId);
      const filtered = await fetchBankLedger({
        enterpriseId: parseInt(enterpriseId),
        bankGlAccountId: selectedBankId,
        dateFrom,
        dateTo,
        statusFilter,
        // Como antes: los movimientos contables solo se consultan si la cuenta está en la lista de bancos.
        includeMovements: !!bank,
      });

      setRows(filtered);
      setHasGenerated(true);
    } catch (error: unknown) {
      toast({ title: "Error al cargar libro de bancos", description: getSafeErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Compute running balance
  const rowsWithBalance = useMemo(() => withRunningBalance(rows, openingBalance), [rows, openingBalance]);

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const finalBalance = openingBalance + totalDebit - totalCredit;

  const selectedBank = bankAccounts.find(b => b.id === selectedBankId);
  const reportTitle = selectedBank
    ? `Libro de Bancos — ${selectedBank.account_name} (${selectedBank.account_code})`
    : "Libro de Bancos";

  const buildExportOptions = () => {
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

    return {
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
    };
  };

  const handleExport = (format: "excel" | "pdf") => {
    const exportOpts = buildExportOptions();

    if (format === "excel") {
      exportToExcel(exportOpts);
    } else {
      exportToPDF({ ...exportOpts, monochrome: true, pageNumbers: true });
    }
    toast({ title: "Reporte exportado" });
  };

  return (
    <div className="space-y-6">
      <ReportCurrencySelector
        enterpriseId={enterpriseId ? parseInt(enterpriseId) : null}
        value={currencyView}
        onChange={setCurrencyView}
      />

      {currencyView.mode !== "FUNCTIONAL" && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Vista multi-moneda en preparación. Los montos se muestran en moneda funcional;
            próximamente se agregarán columnas en {currencyView.foreignCode ?? "—"} para cuentas bancarias en ME.
          </AlertDescription>
        </Alert>
      )}

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
          {hasGenerated && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <Download className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport("excel")}>Exportar a Excel</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("pdf")}>Exportar a PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Results Table */}
      {hasGenerated && (
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

              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    <Info className="mx-auto h-6 w-6 mb-2 opacity-40" />
                    Sin movimientos registrados en este período.
                  </TableCell>
                </TableRow>
              )}

              {rowsWithBalance.map((r, i) => (
                <TableRow key={i} className={cn(r.status === "VOID" && "opacity-60 line-through decoration-destructive/40")}>
                  <TableCell className="text-sm">{new Date(r.date + "T00:00:00").toLocaleDateString("es-GT")}</TableCell>
                  <TableCell className="font-mono text-sm">{r.document_number}</TableCell>
                  <TableCell className="text-sm max-w-[150px]"><TruncatedText text={r.beneficiary || "—"} className="text-sm" inline /></TableCell>
                  <TableCell className="text-sm max-w-[200px]"><TruncatedText text={r.concept || "—"} className="text-sm" inline /></TableCell>
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

      {!loading && !hasGenerated && selectedBankId && (
        <div className="text-center py-12 text-muted-foreground">
          <Landmark className="mx-auto h-12 w-12 mb-4 opacity-30" />
          <p>Seleccione los filtros y presione <strong>Generar</strong> para ver el libro de bancos.</p>
        </div>
      )}
    </div>
  );
}
