CREATE TABLE public.tab_inventory_items (
  id BIGSERIAL PRIMARY KEY,
  enterprise_id BIGINT NOT NULL REFERENCES public.tab_enterprises(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  unit_of_measure TEXT NOT NULL DEFAULT 'unidad',
  unit_cost NUMERIC(18,4) NOT NULL DEFAULT 0,
  suggested_price NUMERIC(18,2) NOT NULL DEFAULT 0,
  category TEXT,
  current_quantity NUMERIC(18,4) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tab_inventory_items_sku_unique UNIQUE (enterprise_id, sku)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tab_inventory_items TO authenticated;
GRANT ALL ON public.tab_inventory_items TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.tab_inventory_items_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.tab_inventory_items_id_seq TO service_role;

ALTER TABLE public.tab_inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inventory_items_select" ON public.tab_inventory_items
  FOR SELECT TO authenticated
  USING (public.user_is_linked_to_enterprise(auth.uid(), enterprise_id));
CREATE POLICY "inventory_items_insert" ON public.tab_inventory_items
  FOR INSERT TO authenticated
  WITH CHECK (public.user_is_linked_to_enterprise(auth.uid(), enterprise_id));
CREATE POLICY "inventory_items_update" ON public.tab_inventory_items
  FOR UPDATE TO authenticated
  USING (public.user_is_linked_to_enterprise(auth.uid(), enterprise_id))
  WITH CHECK (public.user_is_linked_to_enterprise(auth.uid(), enterprise_id));
CREATE POLICY "inventory_items_delete" ON public.tab_inventory_items
  FOR DELETE TO authenticated
  USING (public.user_is_linked_to_enterprise(auth.uid(), enterprise_id));

CREATE INDEX idx_inventory_items_enterprise ON public.tab_inventory_items(enterprise_id);

CREATE TRIGGER update_tab_inventory_items_updated_at
  BEFORE UPDATE ON public.tab_inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.tab_inventory_movements (
  id BIGSERIAL PRIMARY KEY,
  enterprise_id BIGINT NOT NULL REFERENCES public.tab_enterprises(id) ON DELETE CASCADE,
  item_id BIGINT NOT NULL REFERENCES public.tab_inventory_items(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('entrada','salida','ajuste')),
  adjustment_direction TEXT CHECK (adjustment_direction IN ('positivo','negativo')),
  quantity NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(18,4) NOT NULL DEFAULT 0,
  movement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tab_inventory_movements_adjustment_dir CHECK (
    (movement_type = 'ajuste' AND adjustment_direction IS NOT NULL)
    OR (movement_type <> 'ajuste' AND adjustment_direction IS NULL)
  )
);

GRANT SELECT, INSERT ON public.tab_inventory_movements TO authenticated;
GRANT ALL ON public.tab_inventory_movements TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.tab_inventory_movements_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.tab_inventory_movements_id_seq TO service_role;

ALTER TABLE public.tab_inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inventory_movements_select" ON public.tab_inventory_movements
  FOR SELECT TO authenticated
  USING (public.user_is_linked_to_enterprise(auth.uid(), enterprise_id));
CREATE POLICY "inventory_movements_insert" ON public.tab_inventory_movements
  FOR INSERT TO authenticated
  WITH CHECK (public.user_is_linked_to_enterprise(auth.uid(), enterprise_id));

CREATE INDEX idx_inventory_movements_item ON public.tab_inventory_movements(item_id, movement_date, id);
CREATE INDEX idx_inventory_movements_enterprise ON public.tab_inventory_movements(enterprise_id, movement_date);

-- BEFORE INSERT: validaciones y asignación de costo promedio en salidas
CREATE OR REPLACE FUNCTION public.inventory_movement_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qty NUMERIC(18,4);
  v_cost NUMERIC(18,4);
  v_item_enterprise BIGINT;
  v_is_decrease BOOLEAN;
BEGIN
  SELECT current_quantity, unit_cost, enterprise_id
    INTO v_qty, v_cost, v_item_enterprise
  FROM public.tab_inventory_items
  WHERE id = NEW.item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto de inventario no encontrado';
  END IF;

  IF v_item_enterprise <> NEW.enterprise_id THEN
    RAISE EXCEPTION 'El producto no pertenece a la empresa indicada';
  END IF;

  v_is_decrease := (NEW.movement_type = 'salida')
    OR (NEW.movement_type = 'ajuste' AND NEW.adjustment_direction = 'negativo');

  IF v_is_decrease THEN
    IF ROUND(v_qty, 4) < ROUND(NEW.quantity, 4) THEN
      RAISE EXCEPTION 'Existencia insuficiente: disponible %, solicitado %', ROUND(v_qty, 4), ROUND(NEW.quantity, 4);
    END IF;
    NEW.unit_cost := ROUND(v_cost, 4);
  ELSIF NEW.movement_type = 'ajuste' THEN
    NEW.unit_cost := ROUND(v_cost, 4);
  ELSE
    IF NEW.unit_cost IS NULL OR NEW.unit_cost < 0 THEN
      RAISE EXCEPTION 'El costo unitario de una entrada debe ser mayor o igual a cero';
    END IF;
    NEW.unit_cost := ROUND(NEW.unit_cost, 4);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_inventory_movement_before_insert
  BEFORE INSERT ON public.tab_inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.inventory_movement_before_insert();

-- AFTER INSERT: actualiza existencia y costo promedio ponderado
CREATE OR REPLACE FUNCTION public.inventory_movement_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qty NUMERIC(18,4);
  v_cost NUMERIC(18,4);
  v_new_qty NUMERIC(18,4);
  v_new_cost NUMERIC(18,4);
BEGIN
  SELECT current_quantity, unit_cost INTO v_qty, v_cost
  FROM public.tab_inventory_items WHERE id = NEW.item_id FOR UPDATE;

  IF NEW.movement_type = 'entrada' THEN
    v_new_qty := ROUND(v_qty + NEW.quantity, 4);
    IF ROUND(v_qty, 4) <= 0 THEN
      v_new_cost := ROUND(NEW.unit_cost, 4);
    ELSE
      v_new_cost := ROUND((v_qty * v_cost + NEW.quantity * NEW.unit_cost) / NULLIF(v_qty + NEW.quantity, 0), 4);
    END IF;
  ELSIF NEW.movement_type = 'ajuste' AND NEW.adjustment_direction = 'positivo' THEN
    v_new_qty := ROUND(v_qty + NEW.quantity, 4);
    v_new_cost := ROUND(v_cost, 4);
  ELSE
    v_new_qty := ROUND(v_qty - NEW.quantity, 4);
    v_new_cost := ROUND(v_cost, 4);
  END IF;

  UPDATE public.tab_inventory_items
  SET current_quantity = v_new_qty,
      unit_cost = COALESCE(v_new_cost, 0),
      updated_at = now()
  WHERE id = NEW.item_id;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_inventory_movement_after_insert
  AFTER INSERT ON public.tab_inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.inventory_movement_after_insert();

REVOKE EXECUTE ON FUNCTION public.inventory_movement_before_insert() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.inventory_movement_after_insert() FROM PUBLIC, anon;
