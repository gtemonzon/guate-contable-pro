-- Add is_bank_account field to tab_accounts
ALTER TABLE public.tab_accounts 
ADD COLUMN is_bank_account BOOLEAN DEFAULT FALSE;