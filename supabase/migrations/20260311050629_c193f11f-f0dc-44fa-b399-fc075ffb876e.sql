CREATE OR REPLACE FUNCTION sync_taxpayer_cache_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nit text;
  v_name text;
  v_cleaned text;
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

  -- Clean the NIT
  v_cleaned := UPPER(TRIM(REPLACE(v_nit, '-', '')));

  -- Skip invalid/short NITs, CF, or empty names
  IF v_cleaned IS NULL OR length(v_cleaned) < 4 OR v_name IS NULL OR TRIM(v_name) = '' OR v_cleaned = 'CF' OR v_cleaned = 'ANULADA' THEN
    RETURN NEW;
  END IF;

  INSERT INTO taxpayer_cache (nit, name, source, last_checked)
  VALUES (v_cleaned, TRIM(v_name), 'Sistema', now())
  ON CONFLICT (nit) DO UPDATE SET
    name = CASE
      WHEN length(TRIM(EXCLUDED.name)) >= length(taxpayer_cache.name) THEN TRIM(EXCLUDED.name)
      ELSE taxpayer_cache.name
    END,
    last_checked = now();

  RETURN NEW;
END;
$$;