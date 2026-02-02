import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Calendar, ChevronDown, ChevronUp, X } from "lucide-react";

interface YearMonthFilterProps {
  entries: { entry_date: string }[];
  selectedYear: string | null;
  selectedMonths: number[];
  onYearChange: (year: string | null) => void;
  onMonthsChange: (months: number[]) => void;
}

const MONTH_NAMES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"
];

const MONTH_FULL_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

export default function YearMonthFilter({
  entries,
  selectedYear,
  selectedMonths,
  onYearChange,
  onMonthsChange,
}: YearMonthFilterProps) {
  const [expandedYear, setExpandedYear] = useState<string | null>(null);

  // Extraer años únicos de las entradas, ordenados de más reciente a más antiguo
  const availableYears = useMemo(() => {
    const yearsSet = new Set<string>();
    entries.forEach(entry => {
      const year = entry.entry_date.substring(0, 4);
      yearsSet.add(year);
    });
    return Array.from(yearsSet).sort((a, b) => parseInt(b) - parseInt(a));
  }, [entries]);

  // Extraer meses disponibles para el año seleccionado
  const availableMonthsForYear = useMemo(() => {
    if (!selectedYear || selectedYear === "all") return [];
    
    const monthsSet = new Set<number>();
    entries.forEach(entry => {
      const year = entry.entry_date.substring(0, 4);
      if (year === selectedYear) {
        const month = parseInt(entry.entry_date.substring(5, 7));
        monthsSet.add(month);
      }
    });
    return Array.from(monthsSet).sort((a, b) => a - b);
  }, [entries, selectedYear]);

  // Contar registros por año
  const countByYear = useMemo(() => {
    const counts: Record<string, number> = { all: entries.length };
    entries.forEach(entry => {
      const year = entry.entry_date.substring(0, 4);
      counts[year] = (counts[year] || 0) + 1;
    });
    return counts;
  }, [entries]);

  // Contar registros por mes del año seleccionado
  const countByMonth = useMemo(() => {
    if (!selectedYear || selectedYear === "all") return {};
    
    const counts: Record<number, number> = {};
    entries.forEach(entry => {
      const year = entry.entry_date.substring(0, 4);
      if (year === selectedYear) {
        const month = parseInt(entry.entry_date.substring(5, 7));
        counts[month] = (counts[month] || 0) + 1;
      }
    });
    return counts;
  }, [entries, selectedYear]);

  const handleYearClick = (year: string) => {
    if (year === "all") {
      onYearChange(null);
      onMonthsChange([]);
      setExpandedYear(null);
    } else if (selectedYear === year) {
      // Si ya está seleccionado, toggle expandir/colapsar meses
      setExpandedYear(expandedYear === year ? null : year);
    } else {
      onYearChange(year);
      onMonthsChange([]);
      setExpandedYear(year);
    }
  };

  const handleMonthToggle = (month: number) => {
    if (selectedMonths.includes(month)) {
      onMonthsChange(selectedMonths.filter(m => m !== month));
    } else {
      onMonthsChange([...selectedMonths, month].sort((a, b) => a - b));
    }
  };

  const handleSelectAllMonths = () => {
    if (selectedMonths.length === availableMonthsForYear.length) {
      onMonthsChange([]);
    } else {
      onMonthsChange([...availableMonthsForYear]);
    }
  };

  // Sincronizar expandedYear con selectedYear
  useEffect(() => {
    if (selectedYear && selectedYear !== "all") {
      setExpandedYear(selectedYear);
    }
  }, [selectedYear]);

  const isYearSelected = (year: string) => {
    if (year === "all") return !selectedYear;
    return selectedYear === year;
  };

  return (
    <div className="space-y-3">
      {/* Selector de Años */}
      <div className="flex items-center gap-2 flex-wrap">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground mr-2">Período:</span>
        
        {/* Botón "Todo" */}
        <Button
          variant={isYearSelected("all") ? "default" : "outline"}
          size="sm"
          onClick={() => handleYearClick("all")}
          className={cn(
            "transition-all",
            isYearSelected("all") && "ring-2 ring-primary ring-offset-2"
          )}
        >
          Todo
          <Badge variant="secondary" className="ml-2 text-xs">
            {countByYear.all || 0}
          </Badge>
        </Button>

        {/* Botones de Años */}
        {availableYears.map((year) => (
          <Button
            key={year}
            variant={isYearSelected(year) ? "default" : "outline"}
            size="sm"
            onClick={() => handleYearClick(year)}
            className={cn(
              "transition-all",
              isYearSelected(year) && "ring-2 ring-primary ring-offset-2"
            )}
          >
            {year}
            <Badge 
              variant={isYearSelected(year) ? "secondary" : "outline"} 
              className="ml-2 text-xs"
            >
              {countByYear[year] || 0}
            </Badge>
            {isYearSelected(year) && availableMonthsForYear.length > 0 && (
              expandedYear === year ? (
                <ChevronUp className="ml-1 h-3 w-3" />
              ) : (
                <ChevronDown className="ml-1 h-3 w-3" />
              )
            )}
          </Button>
        ))}
      </div>

      {/* Selector de Meses (visible cuando hay un año seleccionado) */}
      {selectedYear && expandedYear === selectedYear && availableMonthsForYear.length > 0 && (
        <div className="pl-6 border-l-2 border-primary/30 ml-2 space-y-2 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">Meses:</span>
            
            {/* Botón Seleccionar Todos */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSelectAllMonths}
              className="h-7 text-xs"
            >
              {selectedMonths.length === availableMonthsForYear.length ? "Ninguno" : "Todos"}
            </Button>

            {/* Botones de Meses */}
            {availableMonthsForYear.map((month) => (
              <Button
                key={month}
                variant={selectedMonths.includes(month) ? "default" : "outline"}
                size="sm"
                onClick={() => handleMonthToggle(month)}
                className={cn(
                  "h-7 px-3 transition-all",
                  selectedMonths.includes(month) && "ring-1 ring-primary ring-offset-1"
                )}
                title={MONTH_FULL_NAMES[month - 1]}
              >
                {MONTH_NAMES[month - 1]}
                <span className="ml-1 text-xs opacity-70">
                  ({countByMonth[month] || 0})
                </span>
              </Button>
            ))}

            {/* Limpiar selección de meses */}
            {selectedMonths.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onMonthsChange([])}
                className="h-7 text-xs text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3 mr-1" />
                Limpiar
              </Button>
            )}
          </div>

          {/* Resumen de selección */}
          {selectedMonths.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap text-sm text-muted-foreground">
              <span>Filtrando:</span>
              {selectedMonths.map((month, idx) => (
                <Badge key={month} variant="secondary" className="text-xs">
                  {MONTH_FULL_NAMES[month - 1]}
                  {idx < selectedMonths.length - 1 && ","}
                </Badge>
              ))}
              <span className="ml-1">
                de {selectedYear}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
