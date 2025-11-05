-- Crear tabla de tipos de operación
CREATE TABLE public.tab_operation_types (
  id bigserial PRIMARY KEY,
  enterprise_id bigint REFERENCES public.tab_enterprises(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  is_system boolean DEFAULT false,
  applies_to text NOT NULL CHECK (applies_to IN ('purchases', 'sales', 'both')),
  created_at timestamptz DEFAULT now()
);

-- Añadir restricciones únicas
CREATE UNIQUE INDEX idx_operation_types_code_enterprise 
ON public.tab_operation_types(enterprise_id, code);

CREATE UNIQUE INDEX idx_operation_types_code_system 
ON public.tab_operation_types(code) 
WHERE enterprise_id IS NULL;

-- Habilitar RLS
ALTER TABLE public.tab_operation_types ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para tab_operation_types
CREATE POLICY "Users can view operation types"
ON public.tab_operation_types
FOR SELECT
USING (
  enterprise_id IS NULL OR 
  enterprise_id IN (
    SELECT enterprise_id 
    FROM tab_user_enterprises 
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert operation types"
ON public.tab_operation_types
FOR INSERT
WITH CHECK (
  enterprise_id IN (
    SELECT enterprise_id 
    FROM tab_user_enterprises 
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update operation types"
ON public.tab_operation_types
FOR UPDATE
USING (
  enterprise_id IN (
    SELECT enterprise_id 
    FROM tab_user_enterprises 
    WHERE user_id = auth.uid()
  ) AND is_system = false
);

CREATE POLICY "Users can delete operation types"
ON public.tab_operation_types
FOR DELETE
USING (
  enterprise_id IN (
    SELECT enterprise_id 
    FROM tab_user_enterprises 
    WHERE user_id = auth.uid()
  ) AND is_system = false
);

-- Insertar tipos de operación del sistema
INSERT INTO public.tab_operation_types (code, name, applies_to, is_system, is_active) VALUES
  ('BIENES', 'Bienes', 'both', true, true),
  ('SERVICIOS', 'Servicios', 'both', true, true),
  ('ACTIVOS_FIJOS', 'Activos Fijos', 'purchases', true, true),
  ('IMPORTACIONES', 'Importaciones', 'purchases', true, true),
  ('OTRAS', 'Otras', 'both', true, true);

-- Agregar columna operation_type_id a tab_sales_ledger
ALTER TABLE public.tab_sales_ledger
ADD COLUMN operation_type_id bigint REFERENCES public.tab_operation_types(id);

-- Agregar columna operation_type_id a tab_purchase_ledger
ALTER TABLE public.tab_purchase_ledger
ADD COLUMN operation_type_id bigint REFERENCES public.tab_operation_types(id);