
-- Auto-sync taxpayer_cache when purchases or sales are saved
CREATE OR REPLACE FUNCTION public.sync_taxpayer_cache_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nit text;
  v_name text;
BEGIN
  IF TG_TABLE_NAME = 'tab_purchase_ledger' THEN
    v_nit := NEW.supplier_nit;
    v_name := NEW.supplier_name;
  ELSIF TG_TABLE_NAME = 'tab_sales_ledger' THEN
    v_nit := NEW.customer_nit;
    v_name := NEW.customer_name;
  ELSE
    RETURN NEW;
  END IF;

  IF v_nit IS NULL OR v_nit = '' OR v_name IS NULL OR v_name = '' OR UPPER(TRIM(v_nit)) = 'CF' THEN
    RETURN NEW;
  END IF;

  INSERT INTO taxpayer_cache (nit, name, source, last_checked)
  VALUES (UPPER(TRIM(v_nit)), v_name, 'Sistema', now())
  ON CONFLICT (nit) DO UPDATE SET
    name = EXCLUDED.name,
    last_checked = now();

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_taxpayer_cache_purchases
  AFTER INSERT OR UPDATE ON public.tab_purchase_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_taxpayer_cache_fn();

CREATE TRIGGER trg_sync_taxpayer_cache_sales
  AFTER INSERT OR UPDATE ON public.tab_sales_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_taxpayer_cache_fn();
