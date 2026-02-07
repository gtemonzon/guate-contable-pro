-- Add PDF typography configuration columns to tab_tenants
ALTER TABLE public.tab_tenants 
ADD COLUMN pdf_font_family text NOT NULL DEFAULT 'helvetica',
ADD COLUMN pdf_font_size integer NOT NULL DEFAULT 8;

-- Add check constraint for valid font families
ALTER TABLE public.tab_tenants 
ADD CONSTRAINT chk_pdf_font_family CHECK (pdf_font_family IN ('helvetica', 'courier', 'times'));

-- Add check constraint for valid font sizes (6-12)
ALTER TABLE public.tab_tenants 
ADD CONSTRAINT chk_pdf_font_size CHECK (pdf_font_size >= 6 AND pdf_font_size <= 12);