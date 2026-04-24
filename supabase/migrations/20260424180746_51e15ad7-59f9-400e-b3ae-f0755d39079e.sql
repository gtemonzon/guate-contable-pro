CREATE TABLE public.tab_training_progress (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  lesson_id TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, lesson_id)
);

CREATE INDEX idx_training_progress_user ON public.tab_training_progress(user_id);

ALTER TABLE public.tab_training_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own training progress"
ON public.tab_training_progress FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own training progress"
ON public.tab_training_progress FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own training progress"
ON public.tab_training_progress FOR DELETE
TO authenticated
USING (auth.uid() = user_id);