CREATE TYPE public.criteria_extraction_status AS ENUM ('PENDING','PROCESSING','COMPLETED','FAILED','CONFIRMED','DISCARDED');

CREATE TABLE public.trial_criteria_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id uuid NOT NULL REFERENCES public.clinical_trials(id) ON DELETE CASCADE,
  source_type text NOT NULL DEFAULT 'TEXT',
  source_name text,
  source_text text NOT NULL DEFAULT '',
  provider text,
  model text,
  status public.criteria_extraction_status NOT NULL DEFAULT 'PENDING',
  is_mock boolean NOT NULL DEFAULT false,
  raw_response jsonb,
  notes text[] NOT NULL DEFAULT '{}'::text[],
  criteria_count integer NOT NULL DEFAULT 0,
  error_message text,
  confirmed_criteria jsonb,
  confirmed_at timestamptz,
  confirmed_by uuid REFERENCES auth.users(id),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trial_criteria_extractions TO authenticated;
GRANT ALL ON public.trial_criteria_extractions TO service_role;

ALTER TABLE public.trial_criteria_extractions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view criteria extractions" ON public.trial_criteria_extractions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers write criteria extractions" ON public.trial_criteria_extractions
  FOR ALL TO authenticated
  USING (private.can_manage(auth.uid()))
  WITH CHECK (private.can_manage(auth.uid()));

CREATE TRIGGER t_trial_criteria_extractions_updated
  BEFORE UPDATE ON public.trial_criteria_extractions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_trial_criteria_extractions_trial ON public.trial_criteria_extractions(trial_id, created_at DESC);