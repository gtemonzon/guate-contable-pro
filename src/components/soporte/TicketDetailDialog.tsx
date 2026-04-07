import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Send, Lock, User, Shield } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  useTicketDetail,
  useTicketMessages,
  useSendMessage,
  useUpdateTicket,
  TicketStatus,
} from "@/hooks/useTickets";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

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

interface Props {
  ticketId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function TicketDetailDialog({ ticketId, open, onOpenChange }: Props) {
  const { data: ticket } = useTicketDetail(ticketId);
  const { data: messages } = useTicketMessages(ticketId);
  const sendMessage = useSendMessage();
  const updateTicket = useUpdateTicket();
  const queryClient = useQueryClient();

  const [newMessage, setNewMessage] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAgent, setIsAgent] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setCurrentUserId(user.id);
        supabase
          .from("tab_users")
          .select("is_super_admin, is_tenant_admin")
          .eq("id", user.id)
          .single()
          .then(({ data }) => {
            setIsAgent(!!data?.is_super_admin || !!data?.is_tenant_admin);
          });
      }
    });
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Realtime subscription for new messages
  useEffect(() => {
    if (!ticketId) return;

    const channel = supabase
      .channel(`ticket-${ticketId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ticket_messages",
          filter: `ticket_id=eq.${ticketId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["ticket-messages", ticketId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticketId, queryClient]);

  const handleSend = async () => {
    if (!newMessage.trim() || !ticketId) return;
    await sendMessage.mutateAsync({ ticketId, message: newMessage });
    setNewMessage("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleStatusChange = (status: TicketStatus) => {
    if (!ticketId) return;
    updateTicket.mutate({ ticketId, status });
  };

  const isClosed = ticket?.status === "closed";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0">
        {/* Header */}
        <DialogHeader className="p-6 pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-lg truncate">{ticket?.subject}</DialogTitle>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge variant="outline" className={ticket ? statusColors[ticket.status] : ""}>
                  {ticket ? statusLabels[ticket.status] : ""}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  #{ticket?.id} · Creado por {ticket?.creator_name}
                </span>
                {ticket?.assignee_name && (
                  <span className="text-xs text-muted-foreground">
                    · Asignado a {ticket.assignee_name}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Agent actions */}
          {isAgent && ticket && (
            <div className="flex items-center gap-2 mt-3">
              <Select
                value={ticket.status}
                onValueChange={(v) => handleStatusChange(v as TicketStatus)}
              >
                <SelectTrigger className="w-[170px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(statusLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </DialogHeader>

        <Separator />

        {/* Messages */}
        <ScrollArea className="flex-1 px-6 py-4">
          <div className="space-y-4">
            {messages?.map((msg) => {
              const isOwnMessage = msg.sender_user_id === currentUserId;

              return (
                <div
                  key={msg.id}
                  className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                      msg.is_internal
                        ? "bg-amber-500/10 border border-amber-200"
                        : isOwnMessage
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      {msg.is_internal ? (
                        <Lock className="h-3 w-3 text-amber-600" />
                      ) : isOwnMessage ? (
                        <User className="h-3 w-3 opacity-70" />
                      ) : (
                        <Shield className="h-3 w-3 opacity-70" />
                      )}
                      <span className={`text-xs font-medium ${
                        msg.is_internal ? "text-amber-700" : isOwnMessage ? "opacity-80" : "text-muted-foreground"
                      }`}>
                        {msg.sender_name}
                        {msg.is_internal && " (Nota interna)"}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                    <p className={`text-[10px] mt-1 ${
                      isOwnMessage ? "opacity-60" : "text-muted-foreground"
                    }`}>
                      {format(new Date(msg.created_at), "dd MMM yyyy HH:mm", { locale: es })}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Reply box */}
        {!isClosed ? (
          <div className="p-4 border-t bg-background">
            <div className="flex gap-2">
              <Textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Escribe tu mensaje..."
                className="min-h-[60px] max-h-[120px] resize-none"
              />
              <Button
                size="icon"
                onClick={handleSend}
                disabled={!newMessage.trim() || sendMessage.isPending}
                className="shrink-0 self-end"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-4 border-t text-center text-sm text-muted-foreground bg-muted/30">
            <Lock className="h-4 w-4 inline mr-1" />
            Este ticket está cerrado
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
