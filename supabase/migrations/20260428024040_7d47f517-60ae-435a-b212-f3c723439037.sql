-- Bucket privado para payloads de importación legado
INSERT INTO storage.buckets (id, name, public)
VALUES ('legacy-imports', 'legacy-imports', false)
ON CONFLICT (id) DO NOTHING;

-- Permitir a usuarios autenticados subir/leer SUS propios payloads (carpeta = auth.uid())
CREATE POLICY "Users can upload own legacy payloads"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'legacy-imports' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can read own legacy payloads"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'legacy-imports' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own legacy payloads"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'legacy-imports' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Columna para guardar la ruta en Storage (el payload JSONB queda opcional)
ALTER TABLE public.tab_legacy_import_jobs
  ADD COLUMN IF NOT EXISTS payload_path text;

ALTER TABLE public.tab_legacy_import_jobs
  ALTER COLUMN payload DROP NOT NULL;