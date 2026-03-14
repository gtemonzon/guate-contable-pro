ALTER TABLE public.tab_enterprise_config 
ADD COLUMN IF NOT EXISTS retained_earnings_account_id bigint REFERENCES public.tab_accounts(id) DEFAULT NULL;