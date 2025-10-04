-- Create table for monthly purchase books
CREATE TABLE public.tab_purchase_books (
  id bigserial PRIMARY KEY,
  enterprise_id bigint NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  year integer NOT NULL,
  status text DEFAULT 'abierto' CHECK (status IN ('abierto', 'cerrado')),
  notes text,
  created_at timestamptz DEFAULT now(),
  created_by uuid,
  closed_at timestamptz,
  closed_by uuid,
  UNIQUE(enterprise_id, year, month)
);

-- Enable RLS
ALTER TABLE public.tab_purchase_books ENABLE ROW LEVEL SECURITY;

-- Create policy for purchase books
CREATE POLICY "enterprise_purchase_books_policy"
  ON public.tab_purchase_books
  FOR ALL
  USING (enterprise_id IN (
    SELECT enterprise_id 
    FROM tab_user_enterprises 
    WHERE user_id = auth.uid()
  ));

-- Add purchase_book_id to tab_purchase_ledger
ALTER TABLE public.tab_purchase_ledger
  ADD COLUMN IF NOT EXISTS purchase_book_id bigint REFERENCES public.tab_purchase_books(id) ON DELETE CASCADE;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_purchase_ledger_book_id ON public.tab_purchase_ledger(purchase_book_id);
CREATE INDEX IF NOT EXISTS idx_purchase_books_enterprise_year_month ON public.tab_purchase_books(enterprise_id, year, month);

COMMENT ON TABLE public.tab_purchase_books IS 'Libros de compras mensuales';
COMMENT ON COLUMN public.tab_purchase_books.status IS 'Estado del libro: abierto (permite agregar facturas) o cerrado';
COMMENT ON COLUMN public.tab_purchase_ledger.purchase_book_id IS 'Referencia al libro de compras mensual';