import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";

export type TicketStatus = "open" | "in_progress" | "waiting_user" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high";
export type TicketCategory = "technical" | "accounting" | "billing" | "other";

export interface Ticket {
  id: number;
  tenant_id: number;
  created_by_user_id: string;
  assigned_to_user_id: string | null;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  created_at: string;
  updated_at: string;
  creator_name?: string;
  assignee_name?: string;
  message_count?: number;
}

export interface TicketMessage {
  id: number;
  ticket_id: number;
  sender_user_id: string;
  message: string;
  is_internal: boolean;
  created_at: string;
  sender_name?: string;
}

export function useTickets(filters?: {
  status?: TicketStatus;
  priority?: TicketPriority;
  category?: TicketCategory;
}) {
  const { currentTenant } = useTenant();

  return useQuery({
    queryKey: ["tickets", currentTenant?.id, filters],
    queryFn: async () => {
      let query = supabase
        .from("tickets")
        .select("*")
        .order("updated_at", { ascending: false });

      if (filters?.status) query = query.eq("status", filters.status);
      if (filters?.priority) query = query.eq("priority", filters.priority);
      if (filters?.category) query = query.eq("category", filters.category);

      const { data, error } = await query;
      if (error) throw error;

      // Fetch creator names
      if (data && data.length > 0) {
        const userIds = [...new Set([
          ...data.map(t => t.created_by_user_id),
          ...data.filter(t => t.assigned_to_user_id).map(t => t.assigned_to_user_id!),
        ])];

        const { data: users } = await supabase
          .from("tab_users")
          .select("id, full_name")
          .in("id", userIds);

        const userMap = new Map(users?.map(u => [u.id, u.full_name]) || []);

        return data.map(t => ({
          ...t,
          creator_name: userMap.get(t.created_by_user_id) || "Usuario",
          assignee_name: t.assigned_to_user_id ? userMap.get(t.assigned_to_user_id) || "Sin nombre" : null,
        })) as Ticket[];
      }

      return (data || []) as Ticket[];
    },
    enabled: !!currentTenant,
  });
}

export function useTicketDetail(ticketId: number | null) {
  return useQuery({
    queryKey: ["ticket", ticketId],
    queryFn: async () => {
      if (!ticketId) return null;

      const { data, error } = await supabase
        .from("tickets")
        .select("*")
        .eq("id", ticketId)
        .single();

      if (error) throw error;

      // Get creator/assignee names
      const userIds = [data.created_by_user_id, data.assigned_to_user_id].filter(Boolean) as string[];
      const { data: users } = await supabase
        .from("tab_users")
        .select("id, full_name")
        .in("id", userIds);

      const userMap = new Map(users?.map(u => [u.id, u.full_name]) || []);

      return {
        ...data,
        creator_name: userMap.get(data.created_by_user_id) || "Usuario",
        assignee_name: data.assigned_to_user_id ? userMap.get(data.assigned_to_user_id) : null,
      } as Ticket;
    },
    enabled: !!ticketId,
  });
}

export function useTicketMessages(ticketId: number | null) {
  return useQuery({
    queryKey: ["ticket-messages", ticketId],
    queryFn: async () => {
      if (!ticketId) return [];

      const { data, error } = await supabase
        .from("ticket_messages")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        const userIds = [...new Set(data.map(m => m.sender_user_id))];
        const { data: users } = await supabase
          .from("tab_users")
          .select("id, full_name")
          .in("id", userIds);

        const userMap = new Map(users?.map(u => [u.id, u.full_name]) || []);

        return data.map(m => ({
          ...m,
          sender_name: userMap.get(m.sender_user_id) || "Usuario",
        })) as TicketMessage[];
      }

      return [] as TicketMessage[];
    },
    enabled: !!ticketId,
  });
}

export function useCreateTicket() {
  const queryClient = useQueryClient();
  const { currentTenant } = useTenant();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: {
      subject: string;
      category: TicketCategory;
      priority: TicketPriority;
      message: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !currentTenant) throw new Error("No autenticado");

      // Create ticket
      const { data: ticket, error: ticketError } = await supabase
        .from("tickets")
        .insert({
          tenant_id: currentTenant.id,
          created_by_user_id: user.id,
          subject: input.subject,
          category: input.category,
          priority: input.priority,
          status: "open",
        })
        .select()
        .single();

      if (ticketError) throw ticketError;

      // Create first message
      const { error: msgError } = await supabase
        .from("ticket_messages")
        .insert({
          ticket_id: ticket.id,
          sender_user_id: user.id,
          message: input.message,
        });

      if (msgError) throw msgError;

      return ticket;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["open-tickets-count"] });
      toast({ title: "Ticket creado", description: "Tu solicitud ha sido enviada." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: {
      ticketId: number;
      message: string;
      isInternal?: boolean;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      const { error } = await supabase
        .from("ticket_messages")
        .insert({
          ticket_id: input.ticketId,
          sender_user_id: user.id,
          message: input.message,
          is_internal: input.isInternal || false,
        });

      if (error) throw error;

      // Auto-update ticket status & updated_at
      const { data: userData } = await supabase
        .from("tab_users")
        .select("is_super_admin, is_tenant_admin")
        .eq("id", user.id)
        .single();

      const isAgent = userData?.is_super_admin || userData?.is_tenant_admin;
      
      await supabase
        .from("tickets")
        .update({
          status: isAgent ? "in_progress" : "waiting_user",
        })
        .eq("id", input.ticketId);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["ticket-messages", variables.ticketId] });
      queryClient.invalidateQueries({ queryKey: ["ticket", variables.ticketId] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (err: any) => {
      toast({ title: "Error al enviar mensaje", description: err.message, variant: "destructive" });
    },
  });
}

export function useUpdateTicket() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: {
      ticketId: number;
      status?: TicketStatus;
      assigned_to_user_id?: string | null;
      priority?: TicketPriority;
    }) => {
      const updateData: Record<string, any> = {};
      if (input.status) updateData.status = input.status;
      if (input.assigned_to_user_id !== undefined) updateData.assigned_to_user_id = input.assigned_to_user_id;
      if (input.priority) updateData.priority = input.priority;

      const { error } = await supabase
        .from("tickets")
        .update(updateData)
        .eq("id", input.ticketId);

      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["ticket", variables.ticketId] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["open-tickets-count"] });
      toast({ title: "Ticket actualizado" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useOpenTicketsCount() {
  const { currentTenant } = useTenant();

  return useQuery({
    queryKey: ["open-tickets-count", currentTenant?.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("tickets")
        .select("*", { count: "exact", head: true })
        .in("status", ["open", "in_progress", "waiting_user"]);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!currentTenant,
    refetchInterval: 60000,
  });
}
