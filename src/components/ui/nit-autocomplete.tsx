import { forwardRef, useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeNIT } from "@/utils/nitValidation";
import { cn } from "@/lib/utils";

interface Suggestion {
  nit: string;
  name: string;
}

interface NitAutocompleteProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onSelectTaxpayer?: (nit: string, name: string) => void;
}

export const NitAutocomplete = forwardRef<HTMLInputElement, NitAutocompleteProps>(
  ({ onSelectTaxpayer, onFocus, onBlur, onKeyDown, value, ...props }, ref) => {
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [open, setOpen] = useState(false);
    const [activeIdx, setActiveIdx] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>();
    const focusedRef = useRef(false);
    const suppressRef = useRef(false);

    const strValue = typeof value === "string" ? value : String(value ?? "");
    const cleaned = sanitizeNIT(strValue).trim().toUpperCase();

    useEffect(() => {
      if (suppressRef.current) {
        suppressRef.current = false;
        return;
      }
      if (!focusedRef.current || cleaned.length < 2) {
        setSuggestions([]);
        setOpen(false);
        return;
      }

      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        try {
          // Search by NIT prefix OR by name containing the term
          const isNumeric = /^\d+$/.test(cleaned);

          let data: Suggestion[] | null = null;

          if (isNumeric) {
            // Search by NIT prefix
            const res = await supabase
              .from("taxpayer_cache")
              .select("nit, name")
              .ilike("nit", `${cleaned}%`)
              .order("last_checked", { ascending: false })
              .limit(10);
            data = res.data;
          } else {
            // Search by name
            const res = await supabase
              .from("taxpayer_cache")
              .select("nit, name")
              .ilike("name", `%${cleaned}%`)
              .order("last_checked", { ascending: false })
              .limit(10);
            data = res.data;
          }

          if (data && data.length > 0 && focusedRef.current) {
            setSuggestions(data);
            setOpen(true);
            setActiveIdx(-1);
          } else {
            setSuggestions([]);
            setOpen(false);
          }
        } catch {
          setSuggestions([]);
          setOpen(false);
        }
      }, 300);

      return () => clearTimeout(debounceRef.current);
    }, [cleaned]);

    const selectSuggestion = (s: Suggestion) => {
      suppressRef.current = true;
      onSelectTaxpayer?.(s.nit, s.name);
      setOpen(false);
      setSuggestions([]);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!open || suggestions.length === 0) {
        onKeyDown?.(e);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && activeIdx >= 0) {
        e.preventDefault();
        selectSuggestion(suggestions[activeIdx]);
      } else if (e.key === "Escape") {
        setOpen(false);
      } else {
        onKeyDown?.(e);
      }
    };

    return (
      <div ref={containerRef} className="relative">
        <Input
          ref={ref}
          value={value}
          {...props}
          onKeyDown={handleKeyDown}
          onFocus={(e) => {
            focusedRef.current = true;
            onFocus?.(e);
            if (suggestions.length > 0) setOpen(true);
          }}
          onBlur={(e) => {
            focusedRef.current = false;
            setTimeout(() => setOpen(false), 150);
            onBlur?.(e);
          }}
        />
        {open && suggestions.length > 0 && (
          <div className="absolute z-50 top-full mt-1 w-full min-w-[280px] max-h-48 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md">
            {suggestions.map((s, i) => (
              <div
                key={s.nit}
                className={cn(
                  "px-3 py-1.5 text-xs cursor-pointer hover:bg-accent flex items-center gap-2",
                  i === activeIdx && "bg-accent"
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectSuggestion(s);
                }}
              >
                <span className="font-mono font-medium shrink-0">{s.nit}</span>
                <span className="text-muted-foreground">—</span>
                <span className="truncate">{s.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
);

NitAutocomplete.displayName = "NitAutocomplete";
