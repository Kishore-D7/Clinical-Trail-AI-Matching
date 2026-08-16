CREATE TYPE public.processing_job_status AS ENUM ('UPLOADED','QUEUED','PROCESSING','COMPLETED','PARTIALLY_COMPLETED','FAILED');
CREATE TYPE public.processing_record_status AS ENUM ('EXTRACTED','NEEDS_REVIEW','FAILED','VERIFIED');
CREATE TYPE public.processing_segment_status AS ENUM ('PENDING','PROCESSING','DONE','FAILED');

CREATE TABLE public.processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  storage_path text,
  status public.processing_job_status NOT NULL DEFAULT 'UPLOADED',
  total_pages integer NOT NULL DEFAULT 0,
  total_patients_detected integer NOT NULL DEFAULT 0,
  patients_processed integer NOT NULL DEFAULT 0,
  patients_successful integer NOT NULL DEFAULT 0,
  patients_needs_review integer NOT NULL DEFAULT 0,
  patients_failed integer NOT NULL DEFAULT 0,
  duplicates_flagged integer NOT NULL DEFAULT 0,
  provider text,
  model text,
  is_mock boolean NOT NULL DEFAULT false,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.processing_jobs TO authenticated;
GRANT ALL ON public.processing_jobs TO service_role;
ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated view processing jobs" ON public.processing_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers write processing jobs" ON public.processing_jobs FOR ALL TO authenticated USING (private.can_manage(auth.uid())) WITH CHECK (private.can_manage(auth.uid()));
CREATE TRIGGER t_processing_jobs_updated BEFORE UPDATE ON public.processing_jobs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.processing_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.processing_jobs(id) ON DELETE CASCADE,
  segment_index integer NOT NULL,
  chunk_index integer NOT NULL DEFAULT 0,
  page_start integer,
  page_end integer,
  strategy text NOT NULL DEFAULT 'heuristic-v1',
  content text NOT NULL,
  status public.processing_segment_status NOT NULL DEFAULT 'PENDING',
  attempts integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, segment_index)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.processing_segments TO authenticated;
GRANT ALL ON public.processing_segments TO service_role;
ALTER TABLE public.processing_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated view processing segments" ON public.processing_segments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers write processing segments" ON public.processing_segments FOR ALL TO authenticated USING (private.can_manage(auth.uid())) WITH CHECK (private.can_manage(auth.uid()));
CREATE TRIGGER t_processing_segments_updated BEFORE UPDATE ON public.processing_segments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_processing_segments_job_status ON public.processing_segments (job_id, status, segment_index);

CREATE TABLE public.processing_patient_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.processing_jobs(id) ON DELETE CASCADE,
  segment_id uuid REFERENCES public.processing_segments(id) ON DELETE SET NULL,
  record_index integer NOT NULL DEFAULT 0,
  patient_identifier text,
  full_name text,
  age integer,
  sex text,
  date_of_birth date,
  conditions text[] NOT NULL DEFAULT '{}',
  medications text[] NOT NULL DEFAULT '{}',
  fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_response jsonb,
  status public.processing_record_status NOT NULL DEFAULT 'EXTRACTED',
  confidence numeric,
  page_start integer,
  page_end integer,
  source_text text,
  validation_issues text[] NOT NULL DEFAULT '{}',
  is_possible_duplicate boolean NOT NULL DEFAULT false,
  duplicate_of uuid REFERENCES public.processing_patient_records(id) ON DELETE SET NULL,
  duplicate_reason text,
  provider text,
  model text,
  is_mock boolean NOT NULL DEFAULT false,
  error_message text,
  verified_by uuid REFERENCES auth.users(id),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.processing_patient_records TO authenticated;
GRANT ALL ON public.processing_patient_records TO service_role;
ALTER TABLE public.processing_patient_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated view processing records" ON public.processing_patient_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers write processing records" ON public.processing_patient_records FOR ALL TO authenticated USING (private.can_manage(auth.uid())) WITH CHECK (private.can_manage(auth.uid()));
CREATE TRIGGER t_processing_records_updated BEFORE UPDATE ON public.processing_patient_records FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_processing_records_job ON public.processing_patient_records (job_id, record_index);