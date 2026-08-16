CREATE TYPE public.candidate_export_status AS ENUM ('PENDING','GENERATING','READY','FAILED');
CREATE TYPE public.candidate_export_scope AS ENUM ('ALL','POTENTIAL_MATCH','NEEDS_REVIEW','INELIGIBLE');

CREATE TABLE public.candidate_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  trial_id uuid REFERENCES public.clinical_trials(id) ON DELETE SET NULL,
  trial_code text,
  trial_title text,
  job_id uuid REFERENCES public.processing_jobs(id) ON DELETE SET NULL,
  scope public.candidate_export_scope NOT NULL DEFAULT 'ALL',
  format text NOT NULL DEFAULT 'csv',
  status public.candidate_export_status NOT NULL DEFAULT 'PENDING',
  storage_path text,
  file_name text,
  file_size bigint NOT NULL DEFAULT 0,
  patient_count integer NOT NULL DEFAULT 0,
  potential_count integer NOT NULL DEFAULT 0,
  needs_review_count integer NOT NULL DEFAULT 0,
  ineligible_count integer NOT NULL DEFAULT 0,
  engine_version text NOT NULL DEFAULT 'v1',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  generated_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_exports TO authenticated;
GRANT ALL ON public.candidate_exports TO service_role;
ALTER TABLE public.candidate_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read candidate exports" ON public.candidate_exports FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers manage candidate exports" ON public.candidate_exports FOR ALL TO authenticated USING (private.can_manage(auth.uid())) WITH CHECK (private.can_manage(auth.uid()));

CREATE TRIGGER candidate_exports_updated_at BEFORE UPDATE ON public.candidate_exports FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Managers read candidate exports files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'candidate-exports' AND private.can_manage(auth.uid()));
CREATE POLICY "Managers upload candidate exports files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'candidate-exports' AND private.can_manage(auth.uid()));
CREATE POLICY "Managers update candidate exports files" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'candidate-exports' AND private.can_manage(auth.uid())) WITH CHECK (bucket_id = 'candidate-exports' AND private.can_manage(auth.uid()));
CREATE POLICY "Managers delete candidate exports files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'candidate-exports' AND private.can_manage(auth.uid()));