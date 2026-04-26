import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  BookOpen,
  ShoppingCart,
  DollarSign,
  Banknote,
  Clock,
  X,
  Search,
  Plus,
  BarChart3,
  ArrowRight,
  CreditCard,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";

const RECENT_SEARCHES_KEY_PREFIX = "global-search-recent";
const MAX_RECENT = 8;

const getRecentSearchesKey = (enterpriseId: string | null) =>
  enterpriseId ? `${RECENT_SEARCHES_KEY_PREFIX}-${enterpriseId}` : RECENT_SEARCHES_KEY_PREFIX;

interface SearchResult {
  id: string;
  category: "partidas" | "cuentas" | "compras" | "ventas" | "bancos" | "documentos_bancarios";
  title: string;
  subtitle: string;
  meta?: string;
  route: string;
}

const CATEGORY_CONFIG = {
  partidas: { label: "Partidas", icon: FileText, color: "text-blue-600 dark:text-blue-400" },
  cuentas: { label: "Cuentas Contables", icon: BookOpen, color: "text-emerald-600 dark:text-emerald-400" },
  compras: { label: "Compras", icon: ShoppingCart, color: "text-orange-600 dark:text-orange-400" },
  ventas: { label: "Ventas", icon: DollarSign, color: "text-violet-600 dark:text-violet-400" },
  bancos: { label: "Movimientos Bancarios", icon: Banknote, color: "text-cyan-600 dark:text-cyan-400" },
  documentos_bancarios: { label: "Documentos Bancarios", icon: CreditCard, color: "text-pink-600 dark:text-pink-400" },
};

interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  action: () => void;
  keywords: string[];
}

interface GlobalSearchPaletteProps {
  enterpriseId: string | null;
}

export function GlobalSearchPalette({ enterpriseId }: GlobalSearchPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const navigate = useNavigate();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Quick actions
  const quickActions: QuickAction[] = [
    {
      id: "new-entry",
      label: "Nueva Partida",
      description: "Crear una nueva partida contable",
      icon: <Plus className="h-4 w-4" />,
      action: () => { navigate("/partidas"); setTimeout(() => window.dispatchEvent(new CustomEvent("quick-action:new-entry")), 100); },
      keywords: ["nueva", "partida", "crear", "new", "entry"],
    },
    {
      id: "go-purchases-book",
      label: "Libro de Compras",
      description: "Ir al libro de compras",
      icon: <ShoppingCart className="h-4 w-4" />,
      action: () => navigate("/libros-fiscales?tab=compras"),
      keywords: ["compras", "libro", "purchases", "book"],
    },
    {
      id: "go-sales-book",
      label: "Libro de Ventas",
      description: "Ir al libro de ventas",
      icon: <DollarSign className="h-4 w-4" />,
      action: () => navigate("/libros-fiscales?tab=ventas"),
      keywords: ["ventas", "libro", "sales", "book"],
    },
    {
      id: "go-trial-balance",
      label: "Balance de Saldos",
      description: "Ver balance de comprobación",
      icon: <BarChart3 className="h-4 w-4" />,
      action: () => navigate("/saldos"),
      keywords: ["balance", "saldos", "trial", "comprobación"],
    },
    {
      id: "go-ledger",
      label: "Mayor General",
      description: "Ver libro mayor",
      icon: <BookOpen className="h-4 w-4" />,
      action: () => navigate("/mayor"),
      keywords: ["mayor", "ledger", "general"],
    },
    {
      id: "go-bank-book",
      label: "Libro de Bancos",
      description: "Ver conciliación y movimientos bancarios",
      icon: <Banknote className="h-4 w-4" />,
      action: () => navigate("/conciliacion"),
      keywords: ["banco", "bank", "conciliación", "reconcile"],
    },
    {
      id: "go-reports",
      label: "Reportes",
      description: "Ver reportes financieros",
      icon: <BarChart3 className="h-4 w-4" />,
      action: () => navigate("/reportes"),
      keywords: ["reportes", "reports", "estados", "financieros"],
    },
    {
      id: "go-accounts",
      label: "Catálogo de Cuentas",
      description: "Ver plan de cuentas contables",
      icon: <BookOpen className="h-4 w-4" />,
      action: () => navigate("/cuentas"),
      keywords: ["cuentas", "catálogo", "plan", "accounts"],
    },
  ];

  // Filter quick actions by query
  const filteredActions = query.length >= 1
    ? quickActions.filter((a) =>
        a.keywords.some((k) => k.toLowerCase().includes(query.toLowerCase())) ||
        a.label.toLowerCase().includes(query.toLowerCase())
      )
    : quickActions;

  // Load recent searches
  useEffect(() => {
    try {
      const stored = localStorage.getItem(getRecentSearchesKey(enterpriseId));
      if (stored) setRecentSearches(JSON.parse(stored));
      else setRecentSearches([]);
    } catch {
      // ignore - corrupt localStorage
    }
  }, [enterpriseId]);

  // Cmd+K / Ctrl+K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  const saveRecentSearch = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed || trimmed.length < 2) return;
    const updated = [trimmed, ...recentSearches.filter((s) => s !== trimmed)].slice(0, MAX_RECENT);
    setRecentSearches(updated);
    localStorage.setItem(getRecentSearchesKey(enterpriseId), JSON.stringify(updated));
  };

  const removeRecentSearch = (term: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = recentSearches.filter((s) => s !== term);
    setRecentSearches(updated);
    localStorage.setItem(getRecentSearchesKey(enterpriseId), JSON.stringify(updated));
  };

  const performSearch = useCallback(
    async (searchTerm: string) => {
      if (!searchTerm || searchTerm.length < 2 || !enterpriseId) {
        setResults([]);
        return;
      }

      setLoading(true);
      const eid = parseInt(enterpriseId);
      const allResults: SearchResult[] = [];

      try {
        // Search journal entries (expanded: beneficiary, document_reference, bank_reference)
        const journalPromise = supabase
          .from("tab_journal_entries")
          .select("id, entry_number, entry_date, description, total_debit, status, beneficiary_name, document_reference, bank_reference")
          .eq("enterprise_id", eid)
          .is("deleted_at", null)
          .or(
            `entry_number.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%,beneficiary_name.ilike.%${searchTerm}%,document_reference.ilike.%${searchTerm}%,bank_reference.ilike.%${searchTerm}%`
          )
          .order("entry_date", { ascending: false })
          .limit(8);

        // Search accounts
        const accountsPromise = supabase
          .from("tab_accounts")
          .select("id, account_code, account_name, account_type")
          .eq("enterprise_id", eid)
          .is("deleted_at", null)
          .or(
            `account_code.ilike.%${searchTerm}%,account_name.ilike.%${searchTerm}%`
          )
          .order("account_code")
          .limit(8);

        // Search purchases
        const purchasesPromise = supabase
          .from("tab_purchase_ledger")
          .select("id, invoice_number, invoice_series, invoice_date, supplier_nit, supplier_name, total_amount")
          .eq("enterprise_id", eid)
          .is("deleted_at", null)
          .or(
            `supplier_nit.ilike.%${searchTerm}%,supplier_name.ilike.%${searchTerm}%,invoice_number.ilike.%${searchTerm}%,invoice_series.ilike.%${searchTerm}%`
          )
          .order("invoice_date", { ascending: false })
          .limit(8);

        // Search sales
        const salesPromise = supabase
          .from("tab_sales_ledger")
          .select("id, invoice_number, invoice_date, customer_nit, customer_name, total_amount")
          .eq("enterprise_id", eid)
          .is("deleted_at", null)
          .or(
            `customer_nit.ilike.%${searchTerm}%,customer_name.ilike.%${searchTerm}%,invoice_number.ilike.%${searchTerm}%`
          )
          .order("invoice_date", { ascending: false })
          .limit(8);

        // Search bank movements
        const bankPromise = supabase
          .from("tab_bank_movements")
          .select("id, description, reference, movement_date, debit_amount, credit_amount")
          .eq("enterprise_id", eid)
          .or(
            `description.ilike.%${searchTerm}%,reference.ilike.%${searchTerm}%`
          )
          .order("movement_date", { ascending: false })
          .limit(8);

        // Search bank documents (cheques, transfers)
        const bankDocsPromise = supabase
          .from("tab_bank_documents")
          .select("id, document_number, document_date, beneficiary_name, concept, direction, status")
          .eq("enterprise_id", eid)
          .or(
            `document_number.ilike.%${searchTerm}%,beneficiary_name.ilike.%${searchTerm}%,concept.ilike.%${searchTerm}%`
          )
          .order("document_date", { ascending: false })
          .limit(8);

        const [journals, accounts, purchases, sales, banks, bankDocs] = await Promise.all([
          journalPromise,
          accountsPromise,
          purchasesPromise,
          salesPromise,
          bankPromise,
          bankDocsPromise,
        ]);

        // Map journal entries
        journals.data?.forEach((j) => {
          allResults.push({
            id: `partida-${j.id}`,
            category: "partidas",
            title: `${j.entry_number}`,
            subtitle: j.description,
            meta: `${formatCurrency(j.total_debit)} · ${j.entry_date}`,
            route: `/partidas?viewEntry=${j.id}`,
          });
        });

        // Map accounts
        accounts.data?.forEach((a) => {
          allResults.push({
            id: `cuenta-${a.id}`,
            category: "cuentas",
            title: `${a.account_code} - ${a.account_name}`,
            subtitle: a.account_type,
            route: `/cuentas?search=${encodeURIComponent(a.account_code)}`,
          });
        });

        // Map purchases
        purchases.data?.forEach((p) => {
          const d = new Date(p.invoice_date);
          const month = d.getMonth() + 1;
          const year = d.getFullYear();
          allResults.push({
            id: `compra-${p.id}`,
            category: "compras",
            title: `Fact. ${p.invoice_series ? `${p.invoice_series}-` : ""}${p.invoice_number} - ${p.supplier_name}`,
            subtitle: `NIT: ${p.supplier_nit}`,
            meta: `${formatCurrency(p.total_amount)} · ${format(d, "dd/MM/yyyy")}`,
            route: `/libros-fiscales?tab=compras&month=${month}&year=${year}&highlight=${p.id}`,
          });
        });

        // Map sales
        sales.data?.forEach((s) => {
          const d = new Date(s.invoice_date);
          const month = d.getMonth() + 1;
          const year = d.getFullYear();
          allResults.push({
            id: `venta-${s.id}`,
            category: "ventas",
            title: `Fact. ${s.invoice_number} - ${s.customer_name}`,
            subtitle: `NIT: ${s.customer_nit}`,
            meta: `${formatCurrency(s.total_amount)} · ${format(d, "dd/MM/yyyy")}`,
            route: `/libros-fiscales?tab=ventas&month=${month}&year=${year}&highlight=${s.id}`,
          });
        });

        // Map bank movements
        banks.data?.forEach((b) => {
          const amount = (b.debit_amount || 0) + (b.credit_amount || 0);
          allResults.push({
            id: `banco-${b.id}`,
            category: "bancos",
            title: b.description,
            subtitle: b.reference || "Sin referencia",
            meta: `${formatCurrency(amount)} · ${format(new Date(b.movement_date), "dd/MM/yyyy")}`,
            route: `/conciliacion`,
          });
        });

        // Map bank documents
        bankDocs.data?.forEach((bd) => {
          const dirLabel = bd.direction === "OUT" ? "Cheque" : "Depósito";
          allResults.push({
            id: `doc-banco-${bd.id}`,
            category: "documentos_bancarios",
            title: `${dirLabel} #${bd.document_number}`,
            subtitle: bd.beneficiary_name || bd.concept || "Sin descripción",
            meta: `${bd.status} · ${format(new Date(bd.document_date), "dd/MM/yyyy")}`,
            route: `/partidas?viewBankDoc=${bd.id}`,
          });
        });

        setResults(allResults);
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setLoading(false);
      }
    },
    [enterpriseId]
  );

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      performSearch(query);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, performSearch]);

  const handleSelect = (result: SearchResult) => {
    saveRecentSearch(query);
    setOpen(false);
    navigate(result.route);
  };

  const handleActionSelect = (action: QuickAction) => {
    setOpen(false);
    action.action();
  };

  const handleRecentSelect = (term: string) => {
    setQuery(term);
  };

  // Group results by category
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.category]) acc[r.category] = [];
    acc[r.category].push(r);
    return acc;
  }, {});

  const totalResults = results.length;
  const showQuickActions = query.length < 2 || filteredActions.length > 0;

  return (
    <>
      {/* Search trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 h-9 px-3 rounded-md border bg-background text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        <Search className="h-4 w-4" />
        <span className="hidden md:inline">Buscar...</span>
        <kbd className="hidden md:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
        <CommandInput
          placeholder="Buscar partidas, cuentas, facturas, cheques... o escribir un comando"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {loading && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Buscando...
            </div>
          )}

          {!loading && query.length >= 2 && totalResults === 0 && filteredActions.length === 0 && (
            <CommandEmpty>No se encontraron resultados para "{query}"</CommandEmpty>
          )}

          {/* Quick Actions */}
          {!loading && showQuickActions && filteredActions.length > 0 && (
            <>
              <CommandGroup heading="Acciones rápidas">
                {(query.length < 2 ? filteredActions.slice(0, 5) : filteredActions).map((action) => (
                  <CommandItem
                    key={action.id}
                    value={action.id}
                    onSelect={() => handleActionSelect(action)}
                    className="flex items-center gap-3 py-2"
                  >
                    <div className="flex items-center justify-center h-7 w-7 rounded-md bg-primary/10 text-primary">
                      {action.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{action.label}</span>
                      <span className="text-xs text-muted-foreground ml-2">{action.description}</span>
                    </div>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  </CommandItem>
                ))}
              </CommandGroup>
              {(totalResults > 0 || recentSearches.length > 0) && <CommandSeparator />}
            </>
          )}

          {/* Recent searches when no query */}
          {!query && recentSearches.length > 0 && (
            <CommandGroup heading="Búsquedas recientes">
              {recentSearches.map((term) => (
                <CommandItem
                  key={term}
                  value={`recent-${term}`}
                  onSelect={() => handleRecentSelect(term)}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>{term}</span>
                  </div>
                  <button
                    onClick={(e) => removeRecentSearch(term, e)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {/* No enterprise selected */}
          {!enterpriseId && query.length >= 2 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Selecciona una empresa para buscar
            </div>
          )}

          {/* Grouped results */}
          {Object.entries(grouped).map(([category, items], idx) => {
            const config = CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG];
            if (!config) return null;
            const Icon = config.icon;

            return (
              <div key={category}>
                {idx > 0 && <CommandSeparator />}
                <CommandGroup heading={config.label}>
                  {items.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={item.id}
                      onSelect={() => handleSelect(item)}
                      className="flex items-start gap-3 py-2.5"
                    >
                      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${config.color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">
                            {item.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground truncate">
                            {item.subtitle}
                          </span>
                          {item.meta && (
                            <span className="text-xs text-muted-foreground shrink-0">
                              · {item.meta}
                            </span>
                          )}
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </div>
            );
          })}

          {/* Result count footer */}
          {query.length >= 2 && totalResults > 0 && !loading && (
            <>
              <CommandSeparator />
              <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                {totalResults} resultado{totalResults !== 1 ? "s" : ""} encontrado{totalResults !== 1 ? "s" : ""}
              </div>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
