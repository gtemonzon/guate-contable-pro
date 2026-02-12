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
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";

const RECENT_SEARCHES_KEY_PREFIX = "global-search-recent";
const MAX_RECENT = 8;

const getRecentSearchesKey = (enterpriseId: string | null) =>
  enterpriseId ? `${RECENT_SEARCHES_KEY_PREFIX}-${enterpriseId}` : RECENT_SEARCHES_KEY_PREFIX;

interface SearchResult {
  id: string;
  category: "partidas" | "cuentas" | "compras" | "ventas" | "bancos";
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
};

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

  // Load recent searches
  useEffect(() => {
    try {
      const stored = localStorage.getItem(getRecentSearchesKey(enterpriseId));
      if (stored) setRecentSearches(JSON.parse(stored));
      else setRecentSearches([]);
    } catch {}
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
        // Search journal entries
        const journalPromise = supabase
          .from("tab_journal_entries")
          .select("id, entry_number, entry_date, description, total_debit, status")
          .eq("enterprise_id", eid)
          .is("deleted_at", null)
          .or(
            `entry_number.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`
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
          .select("id, invoice_number, invoice_date, supplier_nit, supplier_name, total_amount")
          .eq("enterprise_id", eid)
          .is("deleted_at", null)
          .or(
            `supplier_nit.ilike.%${searchTerm}%,supplier_name.ilike.%${searchTerm}%,invoice_number.ilike.%${searchTerm}%`
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

        const [journals, accounts, purchases, sales, banks] = await Promise.all([
          journalPromise,
          accountsPromise,
          purchasesPromise,
          salesPromise,
          bankPromise,
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
            title: `Fact. ${p.invoice_number} - ${p.supplier_name}`,
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
          placeholder="Buscar partidas, cuentas, facturas, movimientos..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {loading && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Buscando...
            </div>
          )}

          {!loading && query.length >= 2 && totalResults === 0 && (
            <CommandEmpty>No se encontraron resultados para "{query}"</CommandEmpty>
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
