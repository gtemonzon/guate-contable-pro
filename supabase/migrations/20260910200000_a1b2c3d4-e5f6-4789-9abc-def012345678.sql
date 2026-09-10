-- Activos Fijos: campos descriptivos Serie, Modelo, Año de fabricación.
-- Los tres son opcionales y puramente informativos — no participan en el
-- cálculo de depreciación (que sigue basado en acquisition_cost tal cual).
ALTER TABLE public.fixed_assets ADD COLUMN serial_number text;
ALTER TABLE public.fixed_assets ADD COLUMN model text;
ALTER TABLE public.fixed_assets ADD COLUMN manufacture_year integer;
