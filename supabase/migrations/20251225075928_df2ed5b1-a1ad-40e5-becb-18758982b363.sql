-- Add period columns to tab_tax_forms
ALTER TABLE public.tab_tax_forms
ADD COLUMN period_type text CHECK (period_type IN ('mensual', 'trimestral', 'anual')),
ADD COLUMN period_month integer CHECK (period_month >= 1 AND period_month <= 12),
ADD COLUMN period_year integer CHECK (period_year >= 2000 AND period_year <= 2100);