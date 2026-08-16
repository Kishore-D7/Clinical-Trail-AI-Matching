
-- researchers are staff too
CREATE OR REPLACE FUNCTION private.can_manage(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('ADMIN','CLINICAL_COORDINATOR','RESEARCHER')); $$;

DO $$ BEGIN
  CREATE TYPE public.trial_status AS ENUM ('DRAFT','RECRUITING','ACTIVE','PAUSED','COMPLETED','CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.criterion_type AS ENUM ('INCLUSION','EXCLUSION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.clinical_trials
  ADD COLUMN IF NOT EXISTS trial_code text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.clinical_trials
SET trial_code = COALESCE(trial_code, nct_id, 'TR-' || upper(substr(replace(id::text,'-',''), 1, 8)))
WHERE trial_code IS NULL;

ALTER TABLE public.clinical_trials ALTER COLUMN trial_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS clinical_trials_trial_code_key ON public.clinical_trials (trial_code);

UPDATE public.clinical_trials
SET status = 'DRAFT'
WHERE status NOT IN ('DRAFT','RECRUITING','ACTIVE','PAUSED','COMPLETED','CLOSED');

ALTER TABLE public.clinical_trials ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.clinical_trials
  ALTER COLUMN status TYPE public.trial_status USING status::public.trial_status;
ALTER TABLE public.clinical_trials ALTER COLUMN status SET DEFAULT 'DRAFT'::public.trial_status;

CREATE TABLE IF NOT EXISTS public.trial_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id uuid NOT NULL REFERENCES public.clinical_trials(id) ON DELETE CASCADE,
  criterion_type public.criterion_type NOT NULL DEFAULT 'INCLUSION',
  field text NOT NULL,
  operator text NOT NULL CHECK (operator IN ('=','!=','>','>=','<','<=','BETWEEN','CONTAINS','IN')),
  value text NOT NULL,
  value_secondary text,
  unit text,
  description text,
  required boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trial_criteria_trial_id_idx ON public.trial_criteria (trial_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trial_criteria TO authenticated;
GRANT ALL ON public.trial_criteria TO service_role;

ALTER TABLE public.trial_criteria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated view trial criteria" ON public.trial_criteria;
CREATE POLICY "Authenticated view trial criteria" ON public.trial_criteria
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Managers write trial criteria" ON public.trial_criteria;
CREATE POLICY "Managers write trial criteria" ON public.trial_criteria
  FOR ALL TO authenticated
  USING (private.can_manage(auth.uid())) WITH CHECK (private.can_manage(auth.uid()));

DROP TRIGGER IF EXISTS t_trial_criteria_updated ON public.trial_criteria;
CREATE TRIGGER t_trial_criteria_updated BEFORE UPDATE ON public.trial_criteria
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
