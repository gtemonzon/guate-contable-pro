-- Create table for journal entry prefixes
CREATE TABLE public.tab_journal_entry_prefixes (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  prefix text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tab_journal_entry_prefixes ENABLE ROW LEVEL SECURITY;

-- Anyone can read prefixes
CREATE POLICY "Anyone can view journal entry prefixes"
ON public.tab_journal_entry_prefixes
FOR SELECT
USING (true);

-- Only super admins can manage prefixes
CREATE POLICY "Super admins can insert journal entry prefixes"
ON public.tab_journal_entry_prefixes
FOR INSERT
WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update journal entry prefixes"
ON public.tab_journal_entry_prefixes
FOR UPDATE
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete journal entry prefixes"
ON public.tab_journal_entry_prefixes
FOR DELETE
USING (is_super_admin(auth.uid()));

-- Insert default prefixes
INSERT INTO public.tab_journal_entry_prefixes (code, name, prefix, description) VALUES
('SALES', 'Ventas', 'VENT', 'Partidas generadas desde libro de ventas'),
('PURCHASES', 'Compras', 'COMP', 'Partidas generadas desde libro de compras'),
('OPENING', 'Apertura', 'APER', 'Partidas de apertura'),
('CLOSING', 'Cierre', 'CIER', 'Partidas de cierre'),
('ADJUSTMENT', 'Ajuste', 'AJUS', 'Partidas de ajuste'),
('MANUAL', 'Manual', 'PART', 'Partidas manuales');