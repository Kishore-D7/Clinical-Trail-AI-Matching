ALTER TABLE public.trial_matches
  ADD COLUMN IF NOT EXISTS matched_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS criteria_total integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS criteria_passed integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS criteria_failed integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS criteria_unknown integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS trial_matches_patient_trial_key
  ON public.trial_matches (patient_id, trial_id);

DO $$ BEGIN
  CREATE TYPE public.criterion_result AS ENUM ('PASS','FAIL','UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.criterion_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.trial_matches(id) ON DELETE CASCADE,
  criterion_id uuid REFERENCES public.trial_criteria(id) ON DELETE SET NULL,
  criterion_type public.criterion_type NOT NULL,
  field text NOT NULL,
  operator text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  actual_value text,
  expected_value text NOT NULL,
  unit text,
  result public.criterion_result NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS criterion_results_match_idx ON public.criterion_results (match_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.criterion_results TO authenticated;
GRANT ALL ON public.criterion_results TO service_role;

ALTER TABLE public.criterion_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "criterion_results_select" ON public.criterion_results;
CREATE POLICY "criterion_results_select" ON public.criterion_results
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "criterion_results_manage" ON public.criterion_results;
CREATE POLICY "criterion_results_manage" ON public.criterion_results
  FOR ALL TO authenticated
  USING (private.can_manage(auth.uid()))
  WITH CHECK (private.can_manage(auth.uid()));