
-- Create ticket status and priority enums
CREATE TYPE public.ticket_status AS ENUM ('open', 'in_progress', 'waiting_user', 'resolved', 'closed');
CREATE TYPE public.ticket_priority AS ENUM ('low', 'medium', 'high');
CREATE TYPE public.ticket_category AS ENUM ('technical', 'accounting', 'billing', 'other');

-- Tickets table
CREATE TABLE public.tickets (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tab_tenants(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  status public.ticket_status NOT NULL DEFAULT 'open',
  priority public.ticket_priority NOT NULL DEFAULT 'medium',
  category public.ticket_category NOT NULL DEFAULT 'other',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ticket messages table
CREATE TABLE public.ticket_messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ticket attachments table
CREATE TABLE public.ticket_attachments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticket_message_id BIGINT NOT NULL REFERENCES public.ticket_messages(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Updated_at trigger for tickets
CREATE TRIGGER set_tickets_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_tickets_tenant_id ON public.tickets(tenant_id);
CREATE INDEX idx_tickets_status ON public.tickets(status);
CREATE INDEX idx_tickets_created_by ON public.tickets(created_by_user_id);
CREATE INDEX idx_ticket_messages_ticket_id ON public.ticket_messages(ticket_id);

-- Enable RLS
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_attachments ENABLE ROW LEVEL SECURITY;

-- Helper function: check if user is support agent (super_admin or tenant_admin)
CREATE OR REPLACE FUNCTION public.is_support_agent(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tab_users
    WHERE id = p_user_id
    AND (is_super_admin = true OR is_tenant_admin = true)
  );
$$;

-- RLS for tickets
-- Users see their tenant's tickets; super admins see all
CREATE POLICY "Users can view own tenant tickets" ON public.tickets
  FOR SELECT TO authenticated
  USING (
    public.is_support_agent(auth.uid())
    OR tenant_id = public.get_user_tenant_id(auth.uid())
  );

CREATE POLICY "Users can create tickets in own tenant" ON public.tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND created_by_user_id = auth.uid()
  );

CREATE POLICY "Support agents can update any ticket" ON public.tickets
  FOR UPDATE TO authenticated
  USING (
    public.is_support_agent(auth.uid())
    OR (tenant_id = public.get_user_tenant_id(auth.uid()) AND created_by_user_id = auth.uid())
  )
  WITH CHECK (
    public.is_support_agent(auth.uid())
    OR (tenant_id = public.get_user_tenant_id(auth.uid()) AND created_by_user_id = auth.uid())
  );

-- RLS for ticket_messages
CREATE POLICY "Users can view messages of accessible tickets" ON public.ticket_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_id
      AND (
        public.is_support_agent(auth.uid())
        OR t.tenant_id = public.get_user_tenant_id(auth.uid())
      )
    )
    AND (is_internal = false OR public.is_support_agent(auth.uid()))
  );

CREATE POLICY "Users can create messages on accessible tickets" ON public.ticket_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_id
      AND t.status != 'closed'
      AND (
        public.is_support_agent(auth.uid())
        OR t.tenant_id = public.get_user_tenant_id(auth.uid())
      )
    )
  );

-- RLS for ticket_attachments
CREATE POLICY "Users can view attachments of accessible messages" ON public.ticket_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ticket_messages tm
      JOIN public.tickets t ON t.id = tm.ticket_id
      WHERE tm.id = ticket_message_id
      AND (
        public.is_support_agent(auth.uid())
        OR t.tenant_id = public.get_user_tenant_id(auth.uid())
      )
    )
  );

CREATE POLICY "Users can add attachments to own messages" ON public.ticket_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ticket_messages tm
      WHERE tm.id = ticket_message_id
      AND tm.sender_user_id = auth.uid()
    )
  );

-- Enable realtime for ticket_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_messages;
