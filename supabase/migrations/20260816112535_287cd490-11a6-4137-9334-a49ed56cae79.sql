CREATE TYPE public.extraction_run_status AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE public.patient_ai_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  document_id UUID REFERENCES public.patient_documents(id) ON DELETE SET NULL,
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status public.extraction_run_status NOT NULL DEFAULT 'PENDING',
  model TEXT,
  fields_extracted TEXT[] NOT NULL DEFAULT '{}',
  field_count INTEGER NOT NULL DEFAULT 0,
  average_confidence NUMERIC(5,2),
  error_message TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_patient_ai_extractions_patient ON public.patient_ai_extractions(patient_id, extracted_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_ai_extractions TO authenticated;
GRANT ALL ON public.patient_ai_extractions TO service_role;

ALTER TABLE public.patient_ai_extractions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated view ai extractions" ON public.patient_ai_extractions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers write ai extractions" ON public.patient_ai_extractions FOR ALL TO authenticated USING (public.can_manage(auth.uid())) WITH CHECK (public.can_manage(auth.uid()));
CREATE TRIGGER t_patient_ai_extractions_updated BEFORE UPDATE ON public.patient_ai_extractions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();