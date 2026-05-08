ALTER TABLE public.tab_financial_statement_sections
DROP CONSTRAINT IF EXISTS tab_financial_statement_sections_section_type_check;

ALTER TABLE public.tab_financial_statement_sections
ADD CONSTRAINT tab_financial_statement_sections_section_type_check
CHECK (section_type = ANY (ARRAY['group'::text, 'subtotal'::text, 'total'::text, 'calculated'::text, 'grand_total'::text]));