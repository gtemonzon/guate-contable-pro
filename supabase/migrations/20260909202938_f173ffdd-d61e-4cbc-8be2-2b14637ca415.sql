-- Historial de Régimen Fiscal por empresa: tab_enterprises.tax_regime es un
-- solo valor sin historial, por lo que revisar un mes anterior a un cambio de
-- régimen mostraba (y aplicaba) el régimen equivocado. Esta tabla registra
-- cada cambio con su fecha de vigencia; useEnterpriseTaxRegime resuelve el
-- régimen vigente a una fecha dada consultando este historial.
CREATE TABLE public.tab_enterprise_tax_regime_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  enterprise_id bigint NOT NULL REFERENCES public.tab_enterprises(id),
  tax_regime text NOT NULL,
  effective_from date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX idx_enterprise_tax_regime_history ON public.tab_enterprise_tax_regime_history(enterprise_id, effective_from);

ALTER TABLE public.tab_enterprise_tax_regime_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tax_regime_history_select" ON public.tab_enterprise_tax_regime_history
  FOR SELECT USING (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY "tax_regime_history_insert" ON public.tab_enterprise_tax_regime_history
  FOR INSERT WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY "tax_regime_history_update" ON public.tab_enterprise_tax_regime_history
  FOR UPDATE USING (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY "tax_regime_history_delete" ON public.tab_enterprise_tax_regime_history
  FOR DELETE USING (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

-- Backfill: una fila inicial por cada empresa existente con su régimen actual,
-- vigente desde una fecha centinela muy anterior a cualquier dato histórico real.
INSERT INTO public.tab_enterprise_tax_regime_history (enterprise_id, tax_regime, effective_from)
SELECT id, tax_regime, DATE '2000-01-01'
FROM public.tab_enterprises;
