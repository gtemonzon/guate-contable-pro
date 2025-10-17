-- Create enterprise documents table
CREATE TABLE public.tab_enterprise_documents (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  enterprise_id BIGINT NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN (
    'representacion_legal',
    'dpi_propietario',
    'rtu',
    'solvencia_fiscal',
    'patente_comercio',
    'acta_constitucion',
    'nombramiento_representante',
    'certificacion_municipal',
    'otro'
  )),
  document_name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  uploaded_by UUID REFERENCES auth.users(id),
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.tab_enterprise_documents ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view documents of their enterprises
CREATE POLICY "Users can view enterprise documents"
ON public.tab_enterprise_documents
FOR SELECT
USING (
  enterprise_id IN (
    SELECT enterprise_id 
    FROM tab_user_enterprises 
    WHERE user_id = auth.uid()
  )
);

-- RLS Policy: Users can insert documents for their enterprises
CREATE POLICY "Users can insert enterprise documents"
ON public.tab_enterprise_documents
FOR INSERT
WITH CHECK (
  enterprise_id IN (
    SELECT enterprise_id 
    FROM tab_user_enterprises 
    WHERE user_id = auth.uid()
  )
);

-- RLS Policy: Users can update documents of their enterprises
CREATE POLICY "Users can update enterprise documents"
ON public.tab_enterprise_documents
FOR UPDATE
USING (
  enterprise_id IN (
    SELECT enterprise_id 
    FROM tab_user_enterprises 
    WHERE user_id = auth.uid()
  )
);

-- RLS Policy: Users can delete documents of their enterprises
CREATE POLICY "Users can delete enterprise documents"
ON public.tab_enterprise_documents
FOR DELETE
USING (
  enterprise_id IN (
    SELECT enterprise_id 
    FROM tab_user_enterprises 
    WHERE user_id = auth.uid()
  )
);

-- Create storage bucket for enterprise documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'enterprise-documents',
  'enterprise-documents',
  false,
  10485760,
  ARRAY['application/pdf']
);

-- Storage Policy: Users can view documents of their enterprises
CREATE POLICY "Users can view enterprise documents"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'enterprise-documents' AND
  (storage.foldername(name))[1] IN (
    SELECT enterprise_id::text
    FROM tab_user_enterprises
    WHERE user_id = auth.uid()
  )
);

-- Storage Policy: Users can upload documents to their enterprises
CREATE POLICY "Users can upload enterprise documents"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'enterprise-documents' AND
  (storage.foldername(name))[1] IN (
    SELECT enterprise_id::text
    FROM tab_user_enterprises
    WHERE user_id = auth.uid()
  )
);

-- Storage Policy: Users can update documents of their enterprises
CREATE POLICY "Users can update enterprise documents"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'enterprise-documents' AND
  (storage.foldername(name))[1] IN (
    SELECT enterprise_id::text
    FROM tab_user_enterprises
    WHERE user_id = auth.uid()
  )
);

-- Storage Policy: Users can delete documents of their enterprises
CREATE POLICY "Users can delete enterprise documents"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'enterprise-documents' AND
  (storage.foldername(name))[1] IN (
    SELECT enterprise_id::text
    FROM tab_user_enterprises
    WHERE user_id = auth.uid()
  )
);

-- Create index for better performance
CREATE INDEX idx_enterprise_documents_enterprise_id ON public.tab_enterprise_documents(enterprise_id);
CREATE INDEX idx_enterprise_documents_active ON public.tab_enterprise_documents(is_active) WHERE is_active = true;