import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { getTableLabel, ACTION_LABELS } from "@/constants/auditFieldRules";

export interface AuditLogFiltersState {
  dateFrom: Date | null;
  dateTo: Date | null;
  userId: string | null;
  action: string | null;
  tableName: string | null;
  search: string;
  userActionsOnly: boolean;
}

interface AuditLogFiltersProps {
  filters: AuditLogFiltersState;
  onFiltersChange: (filters: AuditLogFiltersState) => void;
  isSuperAdmin: boolean;
}

export function AuditLogFilters({ filters, onFiltersChange, isSuperAdmin }: AuditLogFiltersProps) {
  const [users, setUsers] = useState<{ id: string; full_name: string; email: string }[]>([]);
  const [tables, setTables] = useState<string[]>([]);

  useEffect(() => {
    fetchUsers();
    fetchAvailableTables();
  }, []);

  const fetchUsers = async () => {
    const { data } = await supabase
      .from("tab_users")
      .select("id, full_name, email")
      .order("full_name");
    if (data) setUsers(data);
  };

  const fetchAvailableTables = async () => {
    const { data } = await supabase
      .from("tab_audit_log")
      .select("table_name")
      .limit(1000);
    if (data) {
      const uniqueTables = [...new Set(data.map((d) => d.table_name))];
      setTables(uniqueTables.sort());
    }
  };

  const updateFilter = <K extends keyof AuditLogFiltersState>(
    key: K,
    value: AuditLogFiltersState[K],
  ) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearFilters = () => {
    onFiltersChange({
      dateFrom: null,
      dateTo: null,
      userId: null,
      action: null,
      tableName: null,
      search: "",
      userActionsOnly: true,
    });
  };

  const hasActiveFilters =
    filters.dateFrom ||
    filters.dateTo ||
    filters.userId ||
    filters.action ||
    filters.tableName ||
    filters.search ||
    !filters.userActionsOnly;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Date From */}
        <div className="space-y-2">
          <Label>Desde</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !filters.dateFrom && "text-muted-foreground",
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filters.dateFrom
                  ? format(filters.dateFrom, "PPP", { locale: es })
                  : "Seleccionar fecha"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filters.dateFrom || undefined}
                onSelect={(date) => updateFilter("dateFrom", date || null)}
                locale={es}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Date To */}
        <div className="space-y-2">
          <Label>Hasta</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !filters.dateTo && "text-muted-foreground",
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filters.dateTo
                  ? format(filters.dateTo, "PPP", { locale: es })
                  : "Seleccionar fecha"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filters.dateTo || undefined}
                onSelect={(date) => updateFilter("dateTo", date || null)}
                locale={es}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* User */}
        <div className="space-y-2">
          <Label>Usuario</Label>
          <Select
            value={filters.userId || "all"}
            onValueChange={(value) => updateFilter("userId", value === "all" ? null : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Todos los usuarios" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los usuarios</SelectItem>
              {users.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.full_name || user.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Action */}
        <div className="space-y-2">
          <Label>Acción</Label>
          <Select
            value={filters.action || "all"}
            onValueChange={(value) => updateFilter("action", value === "all" ? null : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Todas las acciones" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las acciones</SelectItem>
              {Object.entries(ACTION_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table Name */}
        <div className="space-y-2">
          <Label>Entidad</Label>
          <Select
            value={filters.tableName || "all"}
            onValueChange={(value) => updateFilter("tableName", value === "all" ? null : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Todas las entidades" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las entidades</SelectItem>
              {tables.map((table) => (
                <SelectItem key={table} value={table}>
                  {getTableLabel(table)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Search */}
        <div className="space-y-2 lg:col-span-2">
          <Label>Búsqueda</Label>
          <Input
            placeholder="Buscar en registros..."
            value={filters.search}
            onChange={(e) => updateFilter("search", e.target.value)}
          />
        </div>

        {/* User actions only toggle */}
        <div className="flex items-end pb-1">
          <div className="flex items-center gap-2">
            <Switch
              id="userActionsOnly"
              checked={filters.userActionsOnly}
              onCheckedChange={(checked) => updateFilter("userActionsOnly", checked)}
            />
            <Label htmlFor="userActionsOnly" className="text-sm cursor-pointer">
              Solo acciones de usuario
            </Label>
          </div>
        </div>
      </div>

      {hasActiveFilters && (
        <div className="flex justify-end">
          <Button variant="ghost" onClick={clearFilters} className="text-muted-foreground">
            <X className="mr-2 h-4 w-4" />
            Limpiar filtros
          </Button>
        </div>
      )}
    </div>
  );
}
