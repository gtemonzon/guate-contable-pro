import { useState } from "react";
import { useTickets, TicketStatus, TicketPriority, TicketCategory } from "@/hooks/useTickets";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, MessageSquare, Filter } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import CreateTicketDialog from "@/components/soporte/CreateTicketDialog";
import TicketDetailDialog from "@/components/soporte/TicketDetailDialog";

const statusLabels: Record<TicketStatus, string> = {
  open: "Abierto",
  in_progress: "En Proceso",
  waiting_user: "Esperando Usuario",
  resolved: "Resuelto",
  closed: "Cerrado",
};

const statusColors: Record<TicketStatus, string> = {
  open: "bg-blue-500/15 text-blue-700 border-blue-200",
  in_progress: "bg-amber-500/15 text-amber-700 border-amber-200",
  waiting_user: "bg-purple-500/15 text-purple-700 border-purple-200",
  resolved: "bg-green-500/15 text-green-700 border-green-200",
  closed: "bg-muted text-muted-foreground border-border",
};

const priorityLabels: Record<TicketPriority, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};

const priorityColors: Record<TicketPriority, string> = {
  low: "bg-green-500/15 text-green-700 border-green-200",
  medium: "bg-amber-500/15 text-amber-700 border-amber-200",
  high: "bg-red-500/15 text-red-700 border-red-200",
};

const categoryLabels: Record<TicketCategory, string> = {
  technical: "Técnico",
  accounting: "Contabilidad",
  billing: "Facturación",
  other: "Otro",
};

export default function Soporte() {
  const [filterStatus, setFilterStatus] = useState<TicketStatus | "all">("all");
  const [filterPriority, setFilterPriority] = useState<TicketPriority | "all">("all");
  const [filterCategory, setFilterCategory] = useState<TicketCategory | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);

  const filters = {
    ...(filterStatus !== "all" && { status: filterStatus }),
    ...(filterPriority !== "all" && { priority: filterPriority }),
    ...(filterCategory !== "all" && { category: filterCategory }),
  };

  const { data: tickets, isLoading } = useTickets(filters);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Soporte</h1>
          <p className="text-muted-foreground text-sm">Gestiona tus tickets de soporte</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Nuevo Ticket
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                {Object.entries(statusLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterPriority} onValueChange={(v) => setFilterPriority(v as any)}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue placeholder="Prioridad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {Object.entries(priorityLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterCategory} onValueChange={(v) => setFilterCategory(v as any)}>
              <SelectTrigger className="w-[150px] h-8 text-xs">
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {Object.entries(categoryLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : !tickets?.length ? (
            <div className="flex flex-col items-center py-12 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mb-3 opacity-40" />
              <p>No hay tickets</p>
              <Button variant="link" onClick={() => setCreateOpen(true)}>Crear el primero</Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Estado</TableHead>
                  <TableHead className="w-[70px]">ID</TableHead>
                  <TableHead>Asunto</TableHead>
                  <TableHead className="w-[100px]">Categoría</TableHead>
                  <TableHead className="w-[90px]">Prioridad</TableHead>
                  <TableHead className="w-[90px]">Creado por</TableHead>
                  <TableHead className="w-[130px]">Última actualización</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map((ticket) => (
                  <TableRow
                    key={ticket.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedTicketId(ticket.id)}
                  >
                    <TableCell>
                      <Badge variant="outline" className={statusColors[ticket.status]}>
                        {statusLabels[ticket.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">#{ticket.id}</TableCell>
                    <TableCell className="font-medium">{ticket.subject}</TableCell>
                    <TableCell>
                      <span className="text-xs">{categoryLabels[ticket.category]}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={priorityColors[ticket.priority]}>
                        {priorityLabels[ticket.priority]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{ticket.creator_name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(ticket.updated_at), "dd MMM yyyy HH:mm", { locale: es })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreateTicketDialog open={createOpen} onOpenChange={setCreateOpen} />
      <TicketDetailDialog
        ticketId={selectedTicketId}
        open={!!selectedTicketId}
        onOpenChange={(open) => { if (!open) setSelectedTicketId(null); }}
      />
    </div>
  );
}
