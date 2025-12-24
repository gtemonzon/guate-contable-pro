-- Create table for tax forms
CREATE TABLE public.tab_tax_forms (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  enterprise_id bigint NOT NULL REFERENCES public.tab_enterprises(id) ON DELETE CASCADE,
  form_number text NOT NULL,
  access_code text NOT NULL,
  payment_date date NOT NULL,
  amount_paid numeric NOT NULL DEFAULT 0,
  file_path text,
  file_name text,
  file_size bigint,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true,
  UNIQUE(enterprise_id, form_number)
);

-- Enable RLS
ALTER TABLE public.tab_tax_forms ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only access tax forms from their linked enterprises
CREATE POLICY "Users can manage tax forms from their enterprises"
ON public.tab_tax_forms
FOR ALL
USING (
  enterprise_id IN (
    SELECT enterprise_id FROM public.tab_user_enterprises
    WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  enterprise_id IN (
    SELECT enterprise_id FROM public.tab_user_enterprises
    WHERE user_id = auth.uid()
  )
);

-- Create index for faster queries
CREATE INDEX idx_tax_forms_enterprise_id ON public.tab_tax_forms(enterprise_id);
CREATE INDEX idx_tax_forms_payment_date ON public.tab_tax_forms(payment_date DESC);

-- Create storage bucket for tax form PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('tax-forms', 'tax-forms', false);

-- Storage policies for tax-forms bucket
CREATE POLICY "Users can view tax form files from their enterprises"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'tax-forms' 
  AND (storage.foldername(name))[1]::bigint IN (
    SELECT enterprise_id FROM public.tab_user_enterprises
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can upload tax form files to their enterprises"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'tax-forms'
  AND (storage.foldername(name))[1]::bigint IN (
    SELECT enterprise_id FROM public.tab_user_enterprises
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update tax form files from their enterprises"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'tax-forms'
  AND (storage.foldername(name))[1]::bigint IN (
    SELECT enterprise_id FROM public.tab_user_enterprises
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete tax form files from their enterprises"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'tax-forms'
  AND (storage.foldername(name))[1]::bigint IN (
    SELECT enterprise_id FROM public.tab_user_enterprises
    WHERE user_id = auth.uid()
  )
);