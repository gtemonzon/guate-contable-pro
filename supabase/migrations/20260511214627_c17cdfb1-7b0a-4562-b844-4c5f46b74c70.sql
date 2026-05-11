
DO $$
DECLARE
  user_ids uuid[] := ARRAY['4c9cc1de-ad1c-46ac-a94b-9244a594d6c7'::uuid, 'a41831df-3f27-4ffb-b1ca-89dc0423f812'::uuid];
BEGIN
  DELETE FROM public.tab_user_enterprises WHERE user_id = ANY(user_ids);
  UPDATE public.tab_users
    SET is_active = false,
        is_system_user = true
    WHERE id = ANY(user_ids);
END $$;
