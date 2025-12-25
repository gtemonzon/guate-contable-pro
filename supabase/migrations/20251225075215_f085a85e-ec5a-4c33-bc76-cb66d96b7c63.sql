-- Add tax_type column to tab_tax_forms
ALTER TABLE public.tab_tax_forms
ADD COLUMN tax_type text;