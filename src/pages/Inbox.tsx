import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Inbox,
  FileText,
  Banknote,
  Calendar,
  AlertTriangle,
  ChevronRight,
  RefreshCw,
  CheckCircle2,
  Filter,
  BookOpen,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, ValidationAlert } from "@/components/ui/status-badge";
import { useInboxItems, InboxItem, InboxItemType } from "@/hooks/useInboxItems";
import { useEnterprise } from "@/contexts/EnterpriseContext";
import { cn } from "@/lib/utils";

// ── Type helpers ────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<InboxItemType, React.ElementType> = {
  journal_entry: FileText,
  bank_movement: Banknote,
  deadline: Calendar,
  error: AlertTriangle,
  pdf: BookOpen,
};

const TYPE_LABELS: Record<InboxItemType, string> = {
  journal_entry: "Partida",
  bank_movement: "Banco",
  deadline: "Vencimiento",
  error: "Error",
  pdf: "PDF",
};

const PRIORITY_COLORS: Record<InboxItem["priority"], string> = {
  urgente: "bg-destructive/15 text-destructive border-destructive/30",
  importante: "bg-warning/15 text-warning border-warning/30",
  informativa: "bg-primary/15 text-primary border-primary/20",
};

// ── Sub-components ──────────────────────────────────────────────────────────

function EmptyState({ tab }: { tab: string }) {
  const messages: Record<string, { icon: React.ElementType; title: string; body: string }> = {
    all: {
      icon: CheckCircle2,
      title: "Todo al día",
      body: "No hay elementos pendientes de acción. ¡Excelente trabajo!",
    },
    journal_entry: {
      icon: FileText,
      title: "Sin partidas pendientes",
      body: "Todas las partidas han sido contabilizadas. Puedes crear una nueva desde Libro Diario.",
    },
    bank_movement: {
      icon: Banknote,
      title: "Movimientos al día",
      body: "No hay movimientos bancarios sin conciliar.",
    },
    deadline: {
      icon: Calendar,
      title: "Sin vencimientos próximos",
      body: "No tienes vencimientos fiscales programados en los próximos días.",
    },
    error: {
      icon: CheckCircle2,
      title: "Sin errores",
      body: "No se detectaron partidas desbalanceadas ni problemas en el sistema.",
    },
  };

  const state = messages[tab] ?? messages.all;
  const Icon = state.icon;

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold mb-1">{state.title}</h3>
      <p className="text-sm text-muted-foreground max-w-xs">{state.body}</p>
    </div>
  );
}

function InboxItemCard({
  item,
  isSelected,
  onSelect,
}: {
  item: InboxItem;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const Icon = TYPE_ICONS[item.type];
  const navigate = useNavigate();

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all duration-150 border hover:shadow-md",
        isSelected
          ? "border-primary ring-1 ring-primary/30 bg-primary/5"
          : "hover:border-muted-foreground/30"
      )}
      onClick={onSelect}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div
            className={cn(
              "mt-0.5 rounded-lg p-2 shrink-0",
              item.status === "error"
                ? "bg-destructive/15 text-destructive"
                : item.status === "pending"
                ? "bg-warning/15 text-warning"
                : "bg-primary/15 text-primary"
            )}
          >
            <Icon className="h-4 w-4" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <span className="text-sm font-semibold truncate">{item.title}</span>
              <Badge
                variant="outline"
                className={cn(
                  "text-xs shrink-0 border",
                  PRIORITY_COLORS[item.priority]
                )}
              >
                {item.priority}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {item.description}
            </p>

            {/* Inline warnings */}
            {item.meta?.unbalanced && (
              <ValidationAlert
                type="error"
                message={`Desbalance de Q ${Number(item.meta.imbalance).toFixed(2)}`}
                className="mt-2 py-1 text-xs"
              />
            )}
            {item.meta?.daysUntil !== undefined &&
              Number(item.meta.daysUntil) <= 3 && (
                <ValidationAlert
                  type="warning"
                  message={`Vence en ${item.meta.daysUntil} día(s)`}
                  className="mt-2 py-1 text-xs"
                />
              )}
          </div>

          {/* Action */}
          <div className="shrink-0 flex flex-col items-end gap-1">
            <StatusBadge status={item.status === "error" ? "error" : "pending"} />
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs mt-1"
              onClick={(e) => {
                e.stopPropagation();
                if (item.actionUrl) navigate(item.actionUrl);
              }}
            >
              {item.actionLabel}
              <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ItemPreviewPanel({ item }: { item: InboxItem | null }) {
  const navigate = useNavigate();

  if (!item) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-12 text-muted-foreground">
        <Inbox className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm">Selecciona un elemento para ver su detalle</p>
      </div>
    );
  }

  const Icon = TYPE_ICONS[item.type];
  const typeLabel = TYPE_LABELS[item.type];

  return (
    <div className="p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2.5 shrink-0">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
            {typeLabel}
          </p>
          <h3 className="text-base font-semibold leading-snug">{item.title}</h3>
        </div>
      </div>

      {/* Status */}
      <div className="flex gap-2">
        <StatusBadge status={item.status === "error" ? "error" : item.status === "info" ? "active" : "pending"} />
        <Badge
          variant="outline"
          className={cn(
            "text-xs border",
            PRIORITY_COLORS[item.priority]
          )}
        >
          Prioridad: {item.priority}
        </Badge>
      </div>

      {/* Description */}
      <p className="text-sm text-muted-foreground">{item.description}</p>

      {/* Metadata */}
      {item.meta && (
        <div className="rounded-lg bg-muted/50 border p-3 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Detalle
          </p>
          {item.meta.date && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Fecha</span>
              <span className="font-medium">{String(item.meta.date)}</span>
            </div>
          )}
          {item.meta.debit !== undefined && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Débito total</span>
              <span className="font-medium financial-number">
                Q {Number(item.meta.debit).toFixed(2)}
              </span>
            </div>
          )}
          {item.meta.credit !== undefined && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Crédito total</span>
              <span className="font-medium financial-number">
                Q {Number(item.meta.credit).toFixed(2)}
              </span>
            </div>
          )}
          {item.meta.unbalanced && (
            <ValidationAlert
              type="error"
              message={`Esta partida está desbalanceada por Q ${Number(
                item.meta.imbalance
              ).toFixed(2)}. Corrígela antes de contabilizar.`}
              className="mt-1"
            />
          )}
          {item.meta.amount !== undefined && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Monto</span>
              <span className="font-medium financial-number">
                Q {Number(item.meta.amount).toFixed(2)}
              </span>
            </div>
          )}
          {item.meta.daysUntil !== undefined && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Días hasta vencimiento</span>
              <span
                className={cn(
                  "font-semibold",
                  Number(item.meta.daysUntil) <= 3
                    ? "text-destructive"
                    : "text-warning"
                )}
              >
                {String(item.meta.daysUntil)} día(s)
              </span>
            </div>
          )}
          {item.meta.eventDate && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Fecha de evento</span>
              <span className="font-medium">{String(item.meta.eventDate)}</span>
            </div>
          )}
        </div>
      )}

      {/* Action button */}
      {item.actionUrl && (
        <Button
          className="w-full"
          onClick={() => navigate(item.actionUrl!)}
        >
          {item.actionLabel}
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      )}
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function InboxPage() {
  const { selectedEnterpriseId } = useEnterprise();
  const { data: items = [], isLoading, refetch, isFetching } = useInboxItems(selectedEnterpriseId);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const filtered =
    activeTab === "all"
      ? items
      : activeTab === "error"
      ? items.filter((i) => i.status === "error")
      : items.filter((i) => i.type === activeTab);

  const selectedItem = items.find((i) => i.id === selectedItemId) ?? null;

  const countByTab = {
    all: items.length,
    journal_entry: items.filter((i) => i.type === "journal_entry").length,
    bank_movement: items.filter((i) => i.type === "bank_movement").length,
    deadline: items.filter((i) => i.type === "deadline").length,
    error: items.filter((i) => i.status === "error").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Inbox className="h-7 w-7 text-primary" />
            Bandeja de Contabilidad
          </h1>
          <p className="text-muted-foreground mt-1">
            Cola unificada de elementos que requieren acción
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2"
        >
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          Actualizar
        </Button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total pendientes", value: countByTab.all, color: "text-foreground" },
          { label: "Partidas borrador", value: countByTab.journal_entry, color: "text-warning" },
          { label: "Sin conciliar", value: countByTab.bank_movement, color: "text-primary" },
          { label: "Errores / urgentes", value: countByTab.error, color: "text-destructive" },
        ].map((kpi) => (
          <Card key={kpi.label} className="p-4">
            <p className="text-xs text-muted-foreground">{kpi.label}</p>
            <p className={cn("text-2xl font-bold mt-1", kpi.color)}>{kpi.value}</p>
          </Card>
        ))}
      </div>

      {/* Main split layout */}
      <div className="flex gap-4 h-[calc(100vh-22rem)]">
        {/* Left: list */}
        <div className="flex-1 flex flex-col min-w-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="h-10 w-full justify-start gap-1 bg-muted/60">
              <TabsTrigger value="all" className="text-xs gap-1.5">
                Todos
                {countByTab.all > 0 && (
                  <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                    {countByTab.all}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="journal_entry" className="text-xs gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                Partidas
                {countByTab.journal_entry > 0 && (
                  <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                    {countByTab.journal_entry}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="bank_movement" className="text-xs gap-1.5">
                <Banknote className="h-3.5 w-3.5" />
                Banco
                {countByTab.bank_movement > 0 && (
                  <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                    {countByTab.bank_movement}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="deadline" className="text-xs gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Vencimientos
                {countByTab.deadline > 0 && (
                  <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                    {countByTab.deadline}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="error" className="text-xs gap-1.5 data-[state=active]:bg-destructive data-[state=active]:text-destructive-foreground">
                <AlertTriangle className="h-3.5 w-3.5" />
                Errores
                {countByTab.error > 0 && (
                  <Badge variant="secondary" className="h-4 px-1.5 text-[10px] bg-destructive/20 text-destructive">
                    {countByTab.error}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {["all", "journal_entry", "bank_movement", "deadline", "error", "pdf"].map((tab) => (
              <TabsContent
                key={tab}
                value={tab}
                className="flex-1 overflow-y-auto mt-3 space-y-2 pr-1"
              >
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-24 w-full rounded-lg" />
                  ))
                ) : filtered.length === 0 ? (
                  <EmptyState tab={tab} />
                ) : (
                  filtered.map((item) => (
                    <InboxItemCard
                      key={item.id}
                      item={item}
                      isSelected={selectedItemId === item.id}
                      onSelect={() =>
                        setSelectedItemId(
                          selectedItemId === item.id ? null : item.id
                        )
                      }
                    />
                  ))
                )}
              </TabsContent>
            ))}
          </Tabs>
        </div>

        {/* Right: preview panel */}
        <Card className="w-80 shrink-0 hidden lg:flex flex-col overflow-y-auto">
          <CardHeader className="border-b pb-3 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              Vista previa
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            <ItemPreviewPanel item={selectedItem} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
