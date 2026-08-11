/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Download, FileSpreadsheet, Loader2, Settings2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { exportToExcel, exportToPDF, estimatePdfPageCount } from "@/utils/reportExport";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { useBookAuthorizations } from "@/hooks/useBookAuthorizations";
import { FolioExportDialog, FolioExportOptions } from "./FolioExportDialog";
import type { ReportLine } from "./reportTypes";

type CashFlowCategory = "operacion" | "inversion" | "financiamiento" | "efectivo_equivalente";

interface UnclassifiedAccount {
  id: number;
  code: string;
  name: string;
  delta: number;
}

const formatQ = (value: number) =>
  `Q ${value.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ReporteFlujoEfectivo() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [currentEnterpriseId, setCurrentEnterpriseId] = useState<number | null>(null);
  const [enterpriseName, setEnterpriseName] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [reportLines, setReportLines] = useState<ReportLine[]>([]);
  const [difference, setDifference] = useState(0);
  const [unclassified, setUnclassified] = useState<UnclassifiedAccount[]>([]);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  const { consumePages } = useBookAuthorizations(currentEnterpriseId);

  useEffect(() => {
    const enterpriseId = localStorage.getItem("currentEnterpriseId");
    if (enterpriseId) {
      setCurrentEnterpriseId(parseInt(enterpriseId));
      (async () => {
        const { data } = await supabase
          .from("tab_enterprises")
          .select("business_name")
          .eq("id", parseInt(enterpriseId))
          .single();
        setEnterpriseName(data?.business_name || "");
      })();
    }
    const now = new Date();
    setDateFrom(new Date(now.getFullYear(), 0, 1).toISOString().split("T")[0]);
    setDateTo(now.toISOString().split("T")[0]);
  }, []);

  const generateReport = async () => {
    if (!currentEnterpriseId) {
      toast({ title: "Error", description: "Selecciona una empresa primero", variant: "destructive" });
      return;
    }
    if (!dateFrom || !dateTo) {
      toast({ title: "Error", description: "Debes seleccionar el rango de fechas", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);

      const [pnlRes, trialRes, accountsRes, configRes] = await Promise.all([
        supabase.rpc("get_pnl", {
          p_enterprise_id: currentEnterpriseId,
          p_start_date: dateFrom,
          p_end_date: dateTo,
        }),
        supabase.rpc("get_trial_balance", {
          p_enterprise_id: currentEnterpriseId,
          p_start_date: dateFrom,
          p_end_date: dateTo,
        }),
        (supabase as any)
          .from("tab_accounts")
          .select("id, account_code, account_name, account_type, balance_type, cash_flow_category")
          .eq("enterprise_id", currentEnterpriseId)
          .eq("allows_movement", true),
        (supabase as any)
          .from("tab_enterprise_config")
          .select("period_result_account_id, retained_earnings_account_id")
          .eq("enterprise_id", currentEnterpriseId)
          .maybeSingle(),
      ]);

      if (pnlRes.error) throw pnlRes.error;
      if (trialRes.error) throw trialRes.error;
      if (accountsRes.error) throw accountsRes.error;

      // ---- Efecto de partidas de APERTURA fechadas dentro del rango ----
      const { data: aperturaRows, error: aperturaError } = await (supabase as any)
        .from("tab_journal_entry_details")
        .select(
          "account_id, debit_amount, credit_amount, tab_journal_entries!inner(entry_type, entry_date, enterprise_id, is_posted, deleted_at)"
        )
        .eq("tab_journal_entries.enterprise_id", currentEnterpriseId)
        .eq("tab_journal_entries.entry_type", "apertura")
        .eq("tab_journal_entries.is_posted", true)
        .is("tab_journal_entries.deleted_at", null)
        .is("deleted_at", null)
        .gte("tab_journal_entries.entry_date", dateFrom)
        .lte("tab_journal_entries.entry_date", dateTo);
      if (aperturaError) throw aperturaError;

      // Suma cruda (debe - haber) por cuenta; el signo se normaliza más abajo
      // según el balance_type de cada cuenta (igual que get_trial_balance).
      const aperturaRawByAccount = new Map<number, number>();
      for (const row of (aperturaRows || []) as any[]) {
        const accId = Number(row.account_id);
        const effect = Number(row.debit_amount ?? 0) - Number(row.credit_amount ?? 0);
        aperturaRawByAccount.set(accId, (aperturaRawByAccount.get(accId) ?? 0) + effect);
      }


      // ---- Resultado del período (mismo cálculo que el Balance General) ----
      const pnlAccounts = (pnlRes.data || []).map((row: any) => ({
        id: Number(row.account_id),
        account_type: row.account_type,
        parent_account_id: row.parent_account_id ? Number(row.parent_account_id) : null,
        balance: Number(row.balance),
      }));

      const pnlChildrenByParent = new Map<number, typeof pnlAccounts>();
      for (const acc of pnlAccounts) {
        if (acc.parent_account_id == null) continue;
        const list = pnlChildrenByParent.get(acc.parent_account_id) || [];
        list.push(acc);
        pnlChildrenByParent.set(acc.parent_account_id, list);
      }
      const pnlAggCache = new Map<number, number>();
      const getPnlAggBalance = (accId: number): number => {
        const cached = pnlAggCache.get(accId);
        if (cached !== undefined) return cached;
        const acc = pnlAccounts.find((a) => a.id === accId);
        if (!acc) return 0;
        const children = pnlChildrenByParent.get(accId) || [];
        const total = acc.balance + children.reduce((sum, c) => sum + getPnlAggBalance(c.id), 0);
        pnlAggCache.set(accId, total);
        return total;
      };
      const totalIngresos = pnlAccounts
        .filter((a) => a.account_type === "ingreso" && a.parent_account_id === null)
        .reduce((sum, acc) => sum + getPnlAggBalance(acc.id), 0);
      const totalGastos = pnlAccounts
        .filter((a) => (a.account_type === "gasto" || a.account_type === "costo") && a.parent_account_id === null)
        .reduce((sum, acc) => sum + getPnlAggBalance(acc.id), 0);
      const periodResult = totalIngresos - totalGastos;

      // ---- Saldos del período ----
      const trialByAccount = new Map<number, { opening: number; closing: number }>();
      for (const row of (trialRes.data || []) as any[]) {
        trialByAccount.set(Number(row.account_id), {
          opening: Number(row.opening_balance ?? 0),
          closing: Number(row.closing_balance ?? 0),
        });
      }

      const excludedIds = [
        configRes.data?.period_result_account_id,
        configRes.data?.retained_earnings_account_id,
      ].filter((v: number | null | undefined): v is number => Boolean(v));

      const accounts = (accountsRes.data || []) as {
        id: number;
        account_code: string;
        account_name: string;
        account_type: string;
        balance_type: string | null;
        cash_flow_category: CashFlowCategory | null;
      }[];

      const byCategory: Record<CashFlowCategory, { code: string; name: string; cashEffect: number }[]> = {
        operacion: [],
        inversion: [],
        financiamiento: [],
        efectivo_equivalente: [],
      };
      let efectivoInicial = 0;
      let efectivoFinal = 0;
      const pending: UnclassifiedAccount[] = [];

      for (const account of accounts) {
        const balances = trialByAccount.get(account.id);
        if (!balances) continue;
        const delta = balances.closing - balances.opening;

        if (!account.cash_flow_category) {
          if (
            ["activo", "pasivo", "capital"].includes(account.account_type) &&
            !excludedIds.includes(account.id) &&
            Math.abs(delta) > 0.005
          ) {
            pending.push({ id: account.id, code: account.account_code, name: account.account_name, delta });
          }
          continue;
        }

        if (account.cash_flow_category === "efectivo_equivalente") {
          efectivoInicial += balances.opening;
          efectivoFinal += balances.closing;
          continue;
        }

        const cashEffect = account.balance_type === "deudor" ? -delta : delta;
        byCategory[account.cash_flow_category].push({
          code: account.account_code,
          name: account.account_name,
          cashEffect,
        });
      }

      const sumOf = (cat: CashFlowCategory) =>
        byCategory[cat].reduce((sum, item) => sum + item.cashEffect, 0);

      const operacionAjustes = sumOf("operacion");
      const inversion = sumOf("inversion");
      const financiamiento = sumOf("financiamiento");
      const operacionTotal = periodResult + operacionAjustes;
      const totalGenerado = operacionTotal + inversion + financiamiento;
      const variacionRealEfectivo = efectivoFinal - efectivoInicial;
      const diferencia = totalGenerado - variacionRealEfectivo;

      // ---- Construcción de líneas ----
      const lines: ReportLine[] = [];

      lines.push({ type: "section", label: "ACTIVIDADES DE OPERACIÓN", amount: 0, isBold: true });
      lines.push({ type: "account", label: "Utilidad del Período", amount: periodResult, level: 1 });
      if (byCategory.operacion.some((i) => Math.abs(i.cashEffect) > 0.005)) {
        lines.push({ type: "account", label: "Ajustes y cambios en capital de trabajo:", amount: 0, level: 1 });
      }
      byCategory.operacion
        .filter((i) => Math.abs(i.cashEffect) > 0.005)
        .forEach((i) =>
          lines.push({ type: "account", label: `${i.code} - ${i.name}`, amount: i.cashEffect, level: 2 })
        );
      lines.push({
        type: "subtotal",
        label: `Efectivo neto ${operacionTotal >= 0 ? "generado" : "usado"} en Operación`,
        amount: operacionTotal,
        isBold: true,
        showLine: true,
      });

      lines.push({ type: "section", label: "ACTIVIDADES DE INVERSIÓN", amount: 0, isBold: true });
      byCategory.inversion
        .filter((i) => Math.abs(i.cashEffect) > 0.005)
        .forEach((i) =>
          lines.push({ type: "account", label: `${i.code} - ${i.name}`, amount: i.cashEffect, level: 2 })
        );
      lines.push({
        type: "subtotal",
        label: `Efectivo neto ${inversion >= 0 ? "generado" : "usado"} en Inversión`,
        amount: inversion,
        isBold: true,
        showLine: true,
      });

      lines.push({ type: "section", label: "ACTIVIDADES DE FINANCIAMIENTO", amount: 0, isBold: true });
      byCategory.financiamiento
        .filter((i) => Math.abs(i.cashEffect) > 0.005)
        .forEach((i) =>
          lines.push({ type: "account", label: `${i.code} - ${i.name}`, amount: i.cashEffect, level: 2 })
        );
      lines.push({
        type: "subtotal",
        label: `Efectivo neto ${financiamiento >= 0 ? "generado" : "usado"} en Financiamiento`,
        amount: financiamiento,
        isBold: true,
        showLine: true,
      });

      lines.push({
        type: "total",
        label: "INCREMENTO (DISMINUCIÓN) NETA EN EFECTIVO",
        amount: totalGenerado,
        isBold: true,
        showLine: true,
      });
      lines.push({
        type: "account",
        label: "Efectivo y Equivalentes al Inicio del Período",
        amount: efectivoInicial,
        level: 1,
      });
      lines.push({
        type: "total",
        label: "EFECTIVO Y EQUIVALENTES AL FINAL DEL PERÍODO",
        amount: efectivoFinal,
        isBold: true,
        showLine: true,
      });

      setReportLines(lines);
      setDifference(diferencia);
      setUnclassified(pending.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)));
    } catch (error: unknown) {
      toast({ title: "Error al generar reporte", description: getSafeErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const boldRows = useMemo(
    () =>
      reportLines
        .map((line, index) => (line.type === "subtotal" || line.type === "total" || line.type === "section" ? index : -1))
        .filter((i) => i >= 0),
    [reportLines]
  );

  const buildExportOptions = () => ({
    filename: `Flujo_Efectivo_${dateFrom}_${dateTo}`,
    title: `Estado de Flujo de Efectivo del ${new Date(dateFrom + "T00:00:00").toLocaleDateString("es-GT")} al ${new Date(
      dateTo + "T00:00:00"
    ).toLocaleDateString("es-GT")}`,
    enterpriseName,
    headers: ["Concepto", "Monto"],
    data: reportLines.map((line) => [
      line.type === "account" ? `${"  ".repeat(line.level ?? 1)}${line.label}` : line.label,
      line.type === "section" ? "" : `Q ${line.amount.toFixed(2)}`,
    ]),
    boldRows,
    forcePortrait: true,
  });

  const handleExportExcel = () => {
    exportToExcel(buildExportOptions());
    toast({ title: "Exportado", description: "El reporte se ha exportado a Excel correctamente" });
  };

  const handleExport = async (options: FolioExportOptions) => {
    if (options.format === "excel") {
      handleExportExcel();
      return;
    }

    const result = exportToPDF({
      ...buildExportOptions(),
      folioOptions: { includeFolio: options.includeFolio, startingFolio: options.startingFolio },
      authorizationLegend: options.authorization
        ? { number: options.authorization.number, date: options.authorization.date }
        : undefined,
    });

    if (options.authorization && result?.pageCount) {
      await consumePages(options.authorization.id, result.pageCount, {
        enterpriseId: options.authorization.enterpriseId,
        bookType: options.authorization.bookType,
        reportPeriod: `Flujo de Efectivo ${dateFrom} a ${dateTo}`,
        dateTo,
      });
    }

    toast({ title: "Exportado", description: "El reporte se ha exportado a PDF correctamente" });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <Label htmlFor="cf-date-from">Fecha Desde</Label>
          <Input id="cf-date-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="cf-date-to">Fecha Hasta</Label>
          <Input id="cf-date-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className="flex items-end">
          <Button onClick={generateReport} disabled={loading} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Generar Reporte
          </Button>
        </div>
        {reportLines.length > 0 && (
          <div className="flex items-end gap-2">
            <Button variant="outline" onClick={handleExportExcel} className="flex-1">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Excel
            </Button>
            <Button variant="outline" onClick={() => setExportDialogOpen(true)} className="flex-1">
              <Download className="h-4 w-4 mr-2" />
              PDF
            </Button>
          </div>
        )}
      </div>

      <FolioExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        onExport={handleExport}
        title="Exportar Estado de Flujo de Efectivo"
        bookType="libro_estados_financieros"
        enterpriseId={currentEnterpriseId ?? undefined}
        estimatePageCount={reportLines.length === 0 ? undefined : () => estimatePdfPageCount(buildExportOptions())}
      />

      {reportLines.length > 0 && Math.abs(difference) > 0.01 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="space-y-3">
            <p>
              El reporte no concilia por <strong>{formatQ(difference)}</strong> — hay cuentas con movimiento en el
              período que aún no tienen categoría de Flujo de Efectivo asignada.
            </p>
            {unclassified.length > 0 && (
              <div className="rounded-md border border-current/20 bg-background/40 divide-y divide-current/10 max-h-60 overflow-y-auto">
                {unclassified.map((account) => (
                  <div key={account.id} className="flex items-center justify-between gap-4 px-3 py-1.5 text-sm">
                    <span className="truncate">
                      <span className="font-mono">{account.code}</span> — {account.name}
                    </span>
                    <span className="font-mono whitespace-nowrap">{formatQ(account.delta)}</span>
                  </div>
                ))}
              </div>
            )}
            <Button size="sm" variant="outline" onClick={() => navigate("/configuracion?tab=cash-flow")}>
              <Settings2 className="h-4 w-4 mr-2" />
              Ir a clasificar cuentas
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {reportLines.length > 0 && (
        <div className="rounded-lg border p-4 bg-card">
          <div className="text-center mb-4">
            <h3 className="font-bold text-lg">{enterpriseName}</h3>
            <p className="text-sm text-muted-foreground">
              Estado de Flujo de Efectivo (método indirecto) del{" "}
              {new Date(dateFrom + "T00:00:00").toLocaleDateString("es-GT")} al{" "}
              {new Date(dateTo + "T00:00:00").toLocaleDateString("es-GT")}
            </p>
          </div>

          <div className="divide-y divide-border/50">
            {reportLines.map((line, index) => (
              <div
                key={`${line.label}-${index}`}
                className={`flex items-center justify-between gap-4 py-1.5 ${
                  line.type === "section" ? "pt-4 font-bold uppercase text-sm" : ""
                } ${line.isBold ? "font-bold" : ""} ${line.showLine ? "border-t-2 border-foreground/40" : ""}`}
                style={{ paddingLeft: line.type === "account" ? `${(line.level ?? 1) * 12}px` : undefined }}
              >
                <span className={line.type === "account" ? "text-sm" : ""}>{line.label}</span>
                {line.type !== "section" && (
                  <span className="font-mono text-sm whitespace-nowrap">{formatQ(line.amount)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
