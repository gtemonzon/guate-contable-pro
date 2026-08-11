import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Info, Loader2, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useFinancialStatementFormat } from "@/hooks/useFinancialStatementFormat";

type CashFlowCategory = "operacion" | "inversion" | "financiamiento" | "efectivo_equivalente";

const CATEGORY_OPTIONS: { value: CashFlowCategory; label: string }[] = [
  { value: "operacion", label: "Operación" },
  { value: "inversion", label: "Inversión" },
  { value: "financiamiento", label: "Financiamiento" },
  { value: "efectivo_equivalente", label: "Efectivo y Equivalentes" },
];

const UNCLASSIFIED = "__none__";

interface AccountRow {
  id: number;
  account_code: string;
  account_name: string;
  account_type: string;
  parent_account_id: number | null;
  is_bank_account: boolean;
  cash_flow_category: CashFlowCategory | null;
}

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export function CashFlowClassificationManager() {
  const [enterpriseId, setEnterpriseId] = useState<number | null>(null);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [excludedIds, setExcludedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [search, setSearch] = useState("");

  const { format } = useFinancialStatementFormat(enterpriseId, "balance_general");

  useEffect(() => {
    const id = localStorage.getItem("currentEnterpriseId");
    if (id) setEnterpriseId(Number(id));
  }, []);

  const loadData = async (entId: number) => {
    setLoading(true);
    try {
      const [{ data: config }, { data: accountData, error }] = await Promise.all([
        (supabase as any)
          .from("tab_enterprise_config")
          .select("period_result_account_id, retained_earnings_account_id")
          .eq("enterprise_id", entId)
          .maybeSingle(),
        (supabase as any)
          .from("tab_accounts")
          .select("id, account_code, account_name, account_type, parent_account_id, is_bank_account, cash_flow_category")
          .eq("enterprise_id", entId)
          .eq("is_active", true)
          .eq("allows_movement", true)
          .in("account_type", ["activo", "pasivo", "capital"])
          .order("account_code"),
      ]);

      if (error) throw error;

      const excluded = [config?.period_result_account_id, config?.retained_earnings_account_id].filter(
        (v: number | null | undefined): v is number => Boolean(v)
      );
      setExcludedIds(excluded);
      setAccounts(((accountData || []) as AccountRow[]).filter((a) => !excluded.includes(a.id)));
    } catch (e) {
      console.error(e);
      toast.error("Error al cargar las cuentas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (enterpriseId) loadData(enterpriseId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enterpriseId]);

  const updateCategory = async (accountId: number, category: CashFlowCategory | null) => {
    setSavingId(accountId);
    const { error } = await (supabase as any)
      .from("tab_accounts")
      .update({ cash_flow_category: category })
      .eq("id", accountId);
    setSavingId(null);

    if (error) {
      console.error(error);
      toast.error("No se pudo guardar la clasificación");
      return;
    }
    setAccounts((prev) => prev.map((a) => (a.id === accountId ? { ...a, cash_flow_category: category } : a)));
    toast.success("Clasificación guardada");
  };

  /** Mapa account_id -> nombre de sección del Balance General configurado */
  const sectionByAccountId = useMemo(() => {
    const map = new Map<number, string>();
    (format?.sections || []).forEach((section) => {
      section.accounts.forEach((acc) => {
        if (!map.has(acc.account_id)) map.set(acc.account_id, section.section_name);
      });
    });
    return map;
  }, [format]);

  const findSectionName = (account: AccountRow, allById: Map<number, AccountRow>): string | null => {
    let current: AccountRow | undefined = account;
    const seen = new Set<number>();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      const section = sectionByAccountId.get(current.id);
      if (section) return section;
      current = current.parent_account_id ? allById.get(current.parent_account_id) : undefined;
    }
    return null;
  };

  const handleSuggest = async () => {
    if (!enterpriseId) return;
    setSuggesting(true);
    try {
      // Se necesitan también las cuentas padre (no de detalle) para recorrer la jerarquía
      const { data: allAccounts } = await (supabase as any)
        .from("tab_accounts")
        .select("id, account_code, account_name, account_type, parent_account_id, is_bank_account, cash_flow_category")
        .eq("enterprise_id", enterpriseId);

      const allById = new Map<number, AccountRow>(((allAccounts || []) as AccountRow[]).map((a) => [a.id, a]));

      const updates: { id: number; category: CashFlowCategory }[] = [];
      let unclassified = 0;

      accounts
        .filter((a) => !a.cash_flow_category)
        .forEach((account) => {
          const name = normalize(account.account_name);
          let category: CashFlowCategory | null = null;

          if (account.is_bank_account || name.includes("efectivo") || name.includes("caja")) {
            category = "efectivo_equivalente";
          } else {
            const sectionName = findSectionName(account, allById);
            const normalizedSection = sectionName ? normalize(sectionName) : null;

            if (normalizedSection?.includes("no corriente")) {
              if (account.account_type === "activo") category = "inversion";
              else if (account.account_type === "pasivo") category = "financiamiento";
            } else if (normalizedSection?.includes("corriente")) {
              if (account.account_type === "activo" || account.account_type === "pasivo") category = "operacion";
            }

            if (!category && account.account_type === "capital") category = "financiamiento";
          }

          if (category) updates.push({ id: account.id, category });
          else unclassified += 1;
        });

      for (const update of updates) {
        await (supabase as any)
          .from("tab_accounts")
          .update({ cash_flow_category: update.category })
          .eq("id", update.id);
      }

      const updateMap = new Map(updates.map((u) => [u.id, u.category]));
      setAccounts((prev) =>
        prev.map((a) => (updateMap.has(a.id) ? { ...a, cash_flow_category: updateMap.get(a.id)! } : a))
      );

      toast.success(
        `${updates.length} cuentas clasificadas automáticamente, ${unclassified} quedaron sin clasificar — revísalas manualmente`
      );
    } catch (e) {
      console.error(e);
      toast.error("Error al sugerir la clasificación");
    } finally {
      setSuggesting(false);
    }
  };

  const classifiedCount = accounts.filter((a) => a.cash_flow_category).length;
  const progress = accounts.length ? (classifiedCount / accounts.length) * 100 : 0;

  const filtered = useMemo(() => {
    const term = normalize(search.trim());
    if (!term) return accounts;
    return accounts.filter(
      (a) => normalize(a.account_name).includes(term) || a.account_code.toLowerCase().includes(term)
    );
  }, [accounts, search]);

  if (!enterpriseId) {
    return (
      <Alert>
        <AlertDescription>Selecciona una empresa para clasificar sus cuentas.</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Flujo de Efectivo</CardTitle>
        <CardDescription>
          Clasifica las cuentas de balance según su actividad en el Estado de Flujo de Efectivo
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Solo se listan cuentas de detalle de activo, pasivo y capital. Las cuentas de resultados no se clasifican
            porque el reporte parte de la Utilidad del Período calculada.
            {excludedIds.length > 0 && (
              <> También se excluyen las cuentas de Resultado del Período y Utilidades Acumuladas configuradas para la
              empresa, ya que clasificarlas duplicaría la utilidad.</>
            )}
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {classifiedCount} de {accounts.length} cuentas clasificadas
            </span>
            <Button onClick={handleSuggest} disabled={suggesting || loading} size="sm" variant="outline">
              {suggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              Sugerir clasificación automática
            </Button>
          </div>
          <Progress value={progress} />
        </div>

        <Input
          placeholder="Buscar por código o nombre..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="w-[120px]">Tipo</TableHead>
                  <TableHead className="w-[260px]">Clasificación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      No hay cuentas para mostrar
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell className="font-mono text-sm">{account.account_code}</TableCell>
                      <TableCell>{account.account_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {account.account_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={account.cash_flow_category ?? UNCLASSIFIED}
                          disabled={savingId === account.id}
                          onValueChange={(value) =>
                            updateCategory(account.id, value === UNCLASSIFIED ? null : (value as CashFlowCategory))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={UNCLASSIFIED}>Sin clasificar</SelectItem>
                            {CATEGORY_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
