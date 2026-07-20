
CREATE OR REPLACE FUNCTION public.auto_create_collection_tracking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_direction TEXT;
  v_term INTEGER;
  v_module_enabled BOOLEAN;
BEGIN
  IF TG_TABLE_NAME = 'tab_purchase_ledger' THEN
    v_direction := 'cxp';
  ELSIF TG_TABLE_NAME = 'tab_sales_ledger' THEN
    v_direction := 'cxc';
  ELSE
    RETURN NEW;
  END IF;

  SELECT tm.is_enabled INTO v_module_enabled
    FROM public.tab_enterprises e
    JOIN public.tab_tenant_modules tm
      ON tm.tenant_id = e.tenant_id AND tm.module_key = v_direction
   WHERE e.id = NEW.enterprise_id;

  IF NOT COALESCE(v_module_enabled, false) THEN
    RETURN NEW;
  END IF;

  SELECT days INTO v_term
    FROM public.tab_collection_terms
   WHERE enterprise_id = NEW.enterprise_id AND is_default = true
   ORDER BY sort_order ASC
   LIMIT 1;

  IF v_term IS NULL THEN
    v_term := 30;
  END IF;

  INSERT INTO public.tab_collection_tracking (
    enterprise_id, direction, source_ledger_id, issue_date, due_date,
    payment_term_days, status, amount_total, amount_paid
  ) VALUES (
    NEW.enterprise_id, v_direction, NEW.id, NEW.invoice_date,
    public.calculate_due_date(NEW.enterprise_id, NEW.invoice_date, v_term),
    v_term, 'pendiente', COALESCE(NEW.total_amount, 0), 0
  )
  ON CONFLICT (direction, source_ledger_id) DO NOTHING;

  RETURN NEW;
END;
$function$;
