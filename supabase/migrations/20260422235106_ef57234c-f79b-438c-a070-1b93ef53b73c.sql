-- Tabla de autorizaciones de libros SAT
CREATE TABLE public.tab_book_authorizations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  enterprise_id bigint NOT NULL REFERENCES public.tab_enterprises(id) ON DELETE CASCADE,
  book_type text NOT NULL CHECK (book_type IN ('libro_compras','libro_ventas','libro_diario','libro_mayor','libro_estados_financieros')),
  authorization_number text NOT NULL CHECK (char_length(authorization_number) <= 25),
  authorization_date date NOT NULL,
  authorized_folios integer NOT NULL CHECK (authorized_folios > 0),
  manual_adjustment integer NOT NULL DEFAULT 0,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  low_folios_notified_at timestamptz,
  depleted_notified_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_book_auth_unique_active
  ON public.tab_book_authorizations(enterprise_id, authorization_number)
  WHERE is_active = true;

CREATE INDEX idx_book_auth_enterprise_book ON public.tab_book_authorizations(enterprise_id, book_type, is_active);

ALTER TABLE public.tab_book_authorizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY book_auth_select ON public.tab_book_authorizations FOR SELECT
  USING (is_super_admin(auth.uid()) OR user_is_linked_to_enterprise(auth.uid(), enterprise_id));

CREATE POLICY book_auth_insert ON public.tab_book_authorizations FOR INSERT
  WITH CHECK (is_super_admin(auth.uid()) OR is_admin_for_enterprise(auth.uid(), enterprise_id));

CREATE POLICY book_auth_update ON public.tab_book_authorizations FOR UPDATE
  USING (is_super_admin(auth.uid()) OR is_admin_for_enterprise(auth.uid(), enterprise_id));

CREATE POLICY book_auth_delete ON public.tab_book_authorizations FOR DELETE
  USING (is_super_admin(auth.uid()) OR is_admin_for_enterprise(auth.uid(), enterprise_id));

CREATE TRIGGER trg_book_auth_updated_at
  BEFORE UPDATE ON public.tab_book_authorizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabla de consumo de folios
CREATE TABLE public.tab_book_folio_consumption (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  authorization_id bigint NOT NULL REFERENCES public.tab_book_authorizations(id) ON DELETE CASCADE,
  enterprise_id bigint NOT NULL REFERENCES public.tab_enterprises(id) ON DELETE CASCADE,
  book_type text NOT NULL,
  pages_used integer NOT NULL CHECK (pages_used <> 0),
  report_period text,
  report_date_from date,
  report_date_to date,
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_folio_consumption_auth ON public.tab_book_folio_consumption(authorization_id);
CREATE INDEX idx_folio_consumption_enterprise ON public.tab_book_folio_consumption(enterprise_id, book_type);

ALTER TABLE public.tab_book_folio_consumption ENABLE ROW LEVEL SECURITY;

CREATE POLICY folio_consumption_select ON public.tab_book_folio_consumption FOR SELECT
  USING (is_super_admin(auth.uid()) OR user_is_linked_to_enterprise(auth.uid(), enterprise_id));

CREATE POLICY folio_consumption_insert ON public.tab_book_folio_consumption FOR INSERT
  WITH CHECK (is_super_admin(auth.uid()) OR user_is_linked_to_enterprise(auth.uid(), enterprise_id));

CREATE POLICY folio_consumption_no_update ON public.tab_book_folio_consumption FOR UPDATE
  USING (is_super_admin(auth.uid()));

CREATE POLICY folio_consumption_no_delete ON public.tab_book_folio_consumption FOR DELETE
  USING (is_super_admin(auth.uid()));

-- Función para obtener estado de folios
CREATE OR REPLACE FUNCTION public.get_authorization_folio_status(_authorization_id bigint)
RETURNS TABLE(authorized integer, used integer, adjustment integer, available integer, is_low boolean, is_overdrawn boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _auth record;
  _used integer;
BEGIN
  SELECT authorized_folios, manual_adjustment INTO _auth
  FROM tab_book_authorizations WHERE id = _authorization_id;

  IF _auth IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(pages_used), 0)::integer INTO _used
  FROM tab_book_folio_consumption WHERE authorization_id = _authorization_id;

  authorized := _auth.authorized_folios;
  used := _used + _auth.manual_adjustment;
  adjustment := _auth.manual_adjustment;
  available := _auth.authorized_folios - used;
  is_low := available > 0 AND available <= 10;
  is_overdrawn := available < 0;
  RETURN NEXT;
END;
$$;