/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Download, Loader2, ChevronsUpDown, ChevronDown, ChevronRight, FileSpreadsheet, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { formatCurrency } from "@/lib/utils";
import { exportToExcel, exportToPDF } from "@/utils/reportExport";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import EntityLink from "@/components/ui/entity-link";

interface Account {
  id: number;
  account_code: string;
  account_name: string;
}

interface InvoiceRow {
  detail_id: number;
  journal_entry_id: number;
  entry_number: string;
  entry_date: string;
  entry_description: string;
  line_description: string | null;
  amount: number; // debit - credit (positive for expense)
  purchase_id: number;
  invoice_date: string;
  invoice_series: string | null;
  invoice_number: string;
  supplier_nit: string;
  supplier_name: string;
}

interface AccountGroup {
  account: Account;
  rows: InvoiceRow[];
  total: number;
}

export default function ReporteFacturasPorCuenta() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<number[]>([]);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [enterpriseId, setEnterpriseId] = useState<string | null>(null);
  const [enterpriseName, setEnterpriseName] = useState<string>("");
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [reportGenerated, setReportGenerated] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [accountSearch, setAccountSearch] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    const eid = localStorage.getItem("currentEnterpriseId");
    setEnterpriseId(eid);
    if (eid) {
      void loadAccounts(eid);
      void loadEnterpriseName(eid);
      const periodId = localStorage.getItem(`currentPeriodId_${eid}`);
      if (periodId) {
        supabase.from("tab_accounting_periods").select("start_date, end_date").eq("id", parseInt(periodId)).single()
          .then(({ data }) => {
            if (data) { setStartDate(data.start_date); setEndDate(data.end_date); }
            else setDefaultDates();
          });
      } else setDefaultDates();
    }
    const handler = () => {
      const newId = localStorage.getItem("currentEnterpriseId");
      setEnterpriseId(newId);
      if (newId) { void loadAccounts(newId); void loadEnterpriseName(newId); }
      else { setAccounts([]); setGroups([]); }
    };
    window.addEventListener("enterpriseChanged", handler);
    return () => window.removeEventListener("enterpriseChanged", handler);
  }, []);

  const setDefaultDates = () => {
    const today = new Date();
    setStartDate(`${today.getFullYear()}-01-01`);
    setEndDate(today.toISOString().split("T")[0]);
  };

  const loadEnterpriseName = async (eid: string) => {
    const { data } = await supabase.from("tab_enterprises").select("business_name").eq("id", parseInt(eid)).single();
    setEnterpriseName(data?.business_name || "");
  };

  const loadAccounts = async (eid: string) => {
    const { data, error } = await supabase
      .from("tab_accounts")
      .select("id, account_code, account_name")
      .eq("enterprise_id", parseInt(eid))
      .eq("is_active", true)
      .order("account_code");
    if (error) {
      toast({ title: "Error", description: getSafeErrorMessage(error), variant: "destructive" });
      return;
    }
    setAccounts(data || []);
  };

  const filteredAccounts = useMemo(() => {
    const q = accountSearch.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(a =>
      a.account_code.toLowerCase().includes(q) ||
      a.account_name.toLowerCase().includes(q)
    );
  }, [accounts, accountSearch]);

  const toggleAccount = (id: number) => {
    setSelectedAccounts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selectAllFiltered = () => {
    const allSelected = filteredAccounts.every(a => selectedAccounts.includes(a.id));
    if (allSelected) {
      setSelectedAccounts(prev => prev.filter(id => !filteredAccounts.find(a => a.id === id)));
    } else {
      const ids = filteredAccounts.map(a => a.id);
      setSelectedAccounts(prev => Array.from(new Set([...prev, ...ids])));
    }
  };

  const clearSelection = () => setSelectedAccounts([]);

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const expandAll = () => setExpanded(new Set(groups.map(g => g.account.id)));
  const collapseAll = () => setExpanded(new Set());

  const generate = async () => {
    if (!enterpriseId || selectedAccounts.length === 0 || !startDate || !endDate) {
      toast({ title: "Faltan datos", description: "Selecciona al menos una cuenta y un rango de fechas", variant: "destructive" });
      return;
    }
    setLoading(true);
    setReportGenerated(false);
    try {
      // 1. Get journal entries (posted, not deleted) in range for this enterprise that are linked to a purchase invoice
      const { data: links, error: linksErr } = await supabase
        .from("tab_purchase_journal_links")
        .select(`
          purchase_id,
          journal_entry_id,
          journal_entry:tab_journal_entries!inner(id, entry_number, entry_date, description, is_posted, deleted_at, enterprise_id),
          purchase:tab_purchase_ledger!inner(id, invoice_date, invoice_series, invoice_number, supplier_nit, supplier_name, deleted_at)
        `)
        .eq("enterprise_id", parseInt(enterpriseId))
        .gte("journal_entry.entry_date", startDate)
        .lte("journal_entry.entry_date", endDate)
        .eq("journal_entry.is_posted", true)
        .is("journal_entry.deleted_at", null)
        .is("purchase.deleted_at", null);

      if (linksErr) throw linksErr;
      const validLinks = (links || []).filter((l: any) => l.journal_entry && l.purchase);

      if (validLinks.length === 0) {
        setGroups([]);
        setReportGenerated(true);
        toast({ title: "Sin resultados", description: "No se encontraron facturas para los criterios seleccionados" });
        return;
      }

      const jeIds = Array.from(new Set(validLinks.map((l: any) => Number(l.journal_entry_id))));
      const linkByJe = new Map<number, any>();
      for (const l of validLinks) linkByJe.set(Number(l.journal_entry_id), l);

      // 2. Fetch journal entry details for those JE ids and selected accounts
      const { data: details, error: detErr } = await supabase
        .from("tab_journal_entry_details")
        .select("id, journal_entry_id, account_id, debit_amount, credit_amount, description")
        .in("journal_entry_id", jeIds)
        .in("account_id", selectedAccounts)
        .is("deleted_at", null);

      if (detErr) throw detErr;

      const accountById = new Map(accounts.map(a => [a.id, a]));
      const groupMap = new Map<number, AccountGroup>();

      for (const d of (details || []) as any[]) {
        const link = linkByJe.get(Number(d.journal_entry_id));
        if (!link) continue;
        const acc = accountById.get(Number(d.account_id));
        if (!acc) continue;
        const amount = Number(d.debit_amount || 0) - Number(d.credit_amount || 0);
        const row: InvoiceRow = {
          detail_id: Number(d.id),
          journal_entry_id: Number(d.journal_entry_id),
          entry_number: link.journal_entry.entry_number,
          entry_date: link.journal_entry.entry_date,
          entry_description: link.journal_entry.description,
          line_description: d.description,
          amount,
          purchase_id: Number(link.purchase.id),
          invoice_date: link.purchase.invoice_date,
          invoice_series: link.purchase.invoice_series,
          invoice_number: link.purchase.invoice_number,
          supplier_nit: link.purchase.supplier_nit,
          supplier_name: link.purchase.supplier_name,
        };
        let g = groupMap.get(acc.id);
        if (!g) { g = { account: acc, rows: [], total: 0 }; groupMap.set(acc.id, g); }
        g.rows.push(row);
        g.total += amount;
      }

      const result = Array.from(groupMap.values())
        .map(g => ({ ...g, rows: g.rows.sort((a, b) => a.invoice_date.localeCompare(b.invoice_date)) }))
        .sort((a, b) => a.account.account_code.localeCompare(b.account.account_code));

      setGroups(result);
      setExpanded(new Set()); // collapsed by default
      setReportGenerated(true);
      const totalRows = result.reduce((s, g) => s + g.rows.length, 0);
      toast({ title: "Reporte generado", description: `${totalRows} facturas en ${result.length} cuenta(s)` });
    } catch (err) {
      toast({ title: "Error al generar reporte", description: getSafeErrorMessage(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const buildExportOptions = () => {
    const headers = ["Fecha", "No. Factura", "Proveedor", "No. Partida", "Descripción", "Monto"];
    const data: any[][] = [];
    const boldRows: number[] = [];
    groups.forEach(g => {
      boldRows.push(data.length);
      data.push([
        `${g.account.account_code} - ${g.account.account_name}`, "", "", "", "", formatCurrency(g.total),
      ]);
      g.rows.forEach(r => {
        const invoice = r.invoice_series ? `${r.invoice_series}-${r.invoice_number}` : r.invoice_number;
        data.push([
          r.invoice_date,
          invoice,
          `${r.supplier_nit} - ${r.supplier_name}`,
          r.entry_number,
          r.line_description || r.entry_description,
          formatCurrency(r.amount),
        ]);
      });
      boldRows.push(data.length);
      data.push(["", "", "", "", "Subtotal:", formatCurrency(g.total)]);
      data.push(["", "", "", "", "", ""]);
    });
    const grandTotal = groups.reduce((s, g) => s + g.total, 0);
    return {
      filename: `facturas_por_cuenta_${startDate}_${endDate}`,
      title: `Facturas por Cuenta Contable - Del ${startDate} al ${endDate}`,
      enterpriseName,
      headers,
      data,
      boldRows,
      totals: [{ label: "Total General", value: formatCurrency(grandTotal) }],
    };
  };

  const handleExportExcel = () => {
    if (groups.length === 0) return;
    exportToExcel(buildExportOptions());
    toast({ title: "Excel exportado" });
  };

  const handleExportPDF = () => {
    if (groups.length === 0) return;
    exportToPDF(buildExportOptions());
    toast({ title: "PDF exportado" });
  };

  if (!enterpriseId) {
    return <div className="text-center text-muted-foreground py-8">Selecciona una empresa para generar el reporte</div>;
  }

  const grandTotal = groups.reduce((s, g) => s + g.total, 0);

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pb-4 border-b -mx-6 px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Cuentas Contables</Label>
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between">
                  {selectedAccounts.length === 0
                    ? "Seleccionar cuentas..."
                    : `${selectedAccounts.length} cuenta(s) seleccionada(s)`}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[420px] p-0 bg-popover" align="start">
                <div className="p-2 border-b space-y-2">
                  <Input
                    placeholder="Buscar por código o nombre..."
                    value={accountSearch}
                    onChange={(e) => setAccountSearch(e.target.value)}
                    className="h-8"
                  />
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={selectAllFiltered}>
                      Seleccionar todas
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={clearSelection}>
                      Limpiar
                    </Button>
                  </div>
                </div>
                <div className="max-h-[320px] overflow-y-auto p-2">
                  <div className="space-y-1">
                    {filteredAccounts.map(a => (
                      <div
                        key={a.id}
                        className="flex items-center space-x-2 px-2 py-1.5 hover:bg-accent rounded-sm cursor-pointer"
                        onClick={() => toggleAccount(a.id)}
                      >
                        <Checkbox
                          checked={selectedAccounts.includes(a.id)}
                          onCheckedChange={() => toggleAccount(a.id)}
                        />
                        <label className="text-sm flex-1 cursor-pointer">
                          {a.account_code} - {a.account_name}
                        </label>
                      </div>
                    ))}
                    {filteredAccounts.length === 0 && (
                      <div className="text-sm text-muted-foreground text-center py-4">
                        No hay cuentas coincidentes
                      </div>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <Label htmlFor="fp-start">Desde</Label>
            <Input id="fp-start" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="fp-end">Hasta</Label>
            <Input id="fp-end" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <Button onClick={generate} disabled={loading || selectedAccounts.length === 0}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Generar Reporte
          </Button>
          {reportGenerated && groups.length > 0 && (
            <>
              <Button variant="outline" onClick={handleExportExcel}>
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
              </Button>
              <Button variant="outline" onClick={handleExportPDF}>
                <FileText className="mr-2 h-4 w-4" /> PDF
              </Button>
              <Button variant="outline" size="sm" onClick={expandAll}>Expandir todo</Button>
              <Button variant="outline" size="sm" onClick={collapseAll}>Contraer todo</Button>
            </>
          )}
        </div>
      </div>

      {reportGenerated && groups.length > 0 && (
        <div className="space-y-3">
          <div className="flex justify-end gap-6 text-sm p-4 bg-muted rounded-lg">
            <div>
              <span className="text-muted-foreground">Cuentas: </span>
              <span className="font-semibold">{groups.length}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Facturas: </span>
              <span className="font-semibold">{groups.reduce((s, g) => s + g.rows.length, 0)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Total General: </span>
              <span className="font-bold text-base">{formatCurrency(grandTotal)}</span>
            </div>
          </div>

          {groups.map(g => (
            <Collapsible key={g.account.id} open={expanded.has(g.account.id)} onOpenChange={() => toggleExpand(g.account.id)}>
              <div className="border rounded-lg overflow-hidden">
                <CollapsibleTrigger asChild>
                  <div className="flex justify-between items-center p-4 bg-muted/50 cursor-pointer hover:bg-muted transition-colors">
                    <div className="flex items-center gap-3">
                      {expanded.has(g.account.id) ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                      <div>
                        <h3 className="font-semibold">
                          {g.account.account_code} - {g.account.account_name}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {g.rows.length} factura(s)
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-3 text-sm items-center">
                      <span className="text-muted-foreground">Total Período: </span>
                      <Badge variant={g.total >= 0 ? "default" : "destructive"} className="text-base font-bold">
                        {formatCurrency(g.total)}
                      </Badge>
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[110px]">Fecha</TableHead>
                        <TableHead className="w-[160px]">No. Factura</TableHead>
                        <TableHead>Proveedor</TableHead>
                        <TableHead className="w-[140px]">No. Partida</TableHead>
                        <TableHead className="w-[140px] text-right">Monto</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {g.rows.map(r => {
                        const invoice = r.invoice_series ? `${r.invoice_series}-${r.invoice_number}` : r.invoice_number;
                        return (
                          <TableRow key={r.detail_id}>
                            <TableCell>{r.invoice_date}</TableCell>
                            <TableCell className="font-mono text-xs">{invoice}</TableCell>
                            <TableCell className="text-sm">
                              <span className="font-mono text-xs text-muted-foreground">{r.supplier_nit}</span>
                              {" - "}
                              {r.supplier_name}
                            </TableCell>
                            <TableCell className="text-sm">
                              <EntityLink
                                type="journal_entry"
                                label={r.entry_number}
                                id={r.journal_entry_id}
                                secondaryLabel={r.entry_description}
                              />
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatCurrency(r.amount)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow className="bg-muted/30 font-semibold">
                        <TableCell colSpan={4} className="text-right">Subtotal:</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(g.total)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CollapsibleContent>
              </div>
            </Collapsible>
          ))}
        </div>
      )}

      {reportGenerated && groups.length === 0 && !loading && (
        <div className="text-center text-muted-foreground py-8">
          No se encontraron facturas para los criterios seleccionados
        </div>
      )}
    </div>
  );
}
