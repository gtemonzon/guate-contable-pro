-- Create storage bucket for tenant logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('tenant-logos', 'tenant-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to tenant logos
CREATE POLICY "Tenant logos are publicly accessible" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'tenant-logos');

-- Super admins can upload tenant logos
CREATE POLICY "Super admins can upload tenant logos" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'tenant-logos' AND public.is_super_admin(auth.uid()));

-- Super admins can update tenant logos
CREATE POLICY "Super admins can update tenant logos" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'tenant-logos' AND public.is_super_admin(auth.uid()));

-- Super admins can delete tenant logos
CREATE POLICY "Super admins can delete tenant logos" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'tenant-logos' AND public.is_super_admin(auth.uid()));