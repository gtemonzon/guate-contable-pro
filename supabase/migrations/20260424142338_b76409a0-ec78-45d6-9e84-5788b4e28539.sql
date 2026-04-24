
-- Backfill de calendario de depreciación para activos ACTIVE sin schedule
-- Usa línea recta: monto_mensual = (costo - residual) / vida_util_meses
-- Inicio: in_service_date (snap a primer día del mes)

DO $$
DECLARE
  a RECORD;
  m INT;
  monthly NUMERIC(18,2);
  remaining NUMERIC(18,2);
  accum NUMERIC(18,2);
  amount NUMERIC(18,2);
  cur_year INT;
  cur_month INT;
  start_date DATE;
BEGIN
  FOR a IN
    SELECT fa.*
    FROM fixed_assets fa
    WHERE fa.status = 'ACTIVE'
      AND NOT EXISTS (
        SELECT 1 FROM fixed_asset_depreciation_schedule s WHERE s.asset_id = fa.id
      )
  LOOP
    IF a.useful_life_months IS NULL OR a.useful_life_months <= 0 THEN
      CONTINUE;
    END IF;

    monthly := ROUND((a.acquisition_cost - COALESCE(a.residual_value,0)) / a.useful_life_months, 2);
    remaining := a.acquisition_cost - COALESCE(a.residual_value,0);
    accum := 0;
    start_date := date_trunc('month', COALESCE(a.in_service_date, a.acquisition_date))::date;
    cur_year := EXTRACT(YEAR FROM start_date)::int;
    cur_month := EXTRACT(MONTH FROM start_date)::int;

    FOR m IN 1..a.useful_life_months LOOP
      IF m = a.useful_life_months THEN
        amount := remaining - accum;
      ELSE
        amount := monthly;
      END IF;
      accum := accum + amount;

      INSERT INTO fixed_asset_depreciation_schedule(
        asset_id, enterprise_id, year, month,
        planned_depreciation_amount, accumulated_depreciation,
        net_book_value, status
      ) VALUES (
        a.id, a.enterprise_id, cur_year, cur_month,
        amount, accum,
        a.acquisition_cost - accum, 'PLANNED'
      );

      cur_month := cur_month + 1;
      IF cur_month > 12 THEN
        cur_month := 1;
        cur_year := cur_year + 1;
      END IF;
    END LOOP;
  END LOOP;
END $$;
