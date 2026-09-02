CREATE TABLE public.tab_inventory_warehouses (
  id BIGSERIAL PRIMARY KEY,
  enterprise_id BIGINT NOT NULL REFERENCES public.tab_enterprises(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tab_inventory_warehouses_enterprise_code_key UNIQUE (enterprise_id, code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tab_inventory_warehouses TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.tab_inventory_warehouses_id_seq TO authenticated;
GRANT ALL ON public.tab_inventory_warehouses TO service_role;
GRANT ALL ON SEQUENCE public.tab_inventory_warehouses_id_seq TO service_role;

ALTER TABLE public.tab_inventory_warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inventory_warehouses_select" ON public.tab_inventory_warehouses
FOR SELECT TO authenticated
USING (public.user_is_linked_to_enterprise(auth.uid(), enterprise_id));

CREATE POLICY "inventory_warehouses_insert" ON public.tab_inventory_warehouses
FOR INSERT TO authenticated
WITH CHECK (public.user_is_linked_to_enterprise(auth.uid(), enterprise_id));

CREATE POLICY "inventory_warehouses_update" ON public.tab_inventory_warehouses
FOR UPDATE TO authenticated
USING (public.user_is_linked_to_enterprise(auth.uid(), enterprise_id))
WITH CHECK (public.user_is_linked_to_enterprise(auth.uid(), enterprise_id));

CREATE POLICY "inventory_warehouses_delete" ON public.tab_inventory_warehouses
FOR DELETE TO authenticated
USING (public.user_is_linked_to_enterprise(auth.uid(), enterprise_id));

CREATE TRIGGER update_tab_inventory_warehouses_updated_at
BEFORE UPDATE ON public.tab_inventory_warehouses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tab_inventory_items
ADD COLUMN warehouse_id BIGINT NOT NULL REFERENCES public.tab_inventory_warehouses(id);