-- Enums
CREATE TYPE public.verification_status AS ENUM ('UNVERIFIED', 'VERIFIED', 'CORRECTED');
CREATE TYPE public.measurement_metric AS ENUM ('HBA1C', 'BMI', 'FASTING_GLUCOSE', 'SYSTOLIC_BP', 'DIASTOLIC_BP', 'LDL', 'EGFR');
CREATE TYPE public.extraction_source AS ENUM ('AI', 'MANUAL');

-- Patient demographics
ALTER TABLE public.patients
  ADD COLUMN full_name TEXT,
  ADD COLUMN date_of_birth DATE;

CREATE OR REPLACE FUNCTION public.sync_patient_age()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.date_of_birth IS NOT NULL THEN
    NEW.age = date_part('year', age(NEW.date_of_birth))::int;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_patient_age() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER t_patients_age BEFORE INSERT OR UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.sync_patient_age();

-- Conditions
CREATE TABLE public.patient_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  diagnosed_on DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_patient_conditions_patient ON public.patient_conditions(patient_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_conditions TO authenticated;
GRANT ALL ON public.patient_conditions TO service_role;
ALTER TABLE public.patient_conditions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated view patient conditions" ON public.patient_conditions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers write patient conditions" ON public.patient_conditions FOR ALL TO authenticated USING (public.can_manage(auth.uid())) WITH CHECK (public.can_manage(auth.uid()));
CREATE TRIGGER t_patient_conditions_updated BEFORE UPDATE ON public.patient_conditions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Medications
CREATE TABLE public.patient_medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  dosage TEXT,
  frequency TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  started_on DATE,
  ended_on DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_patient_medications_patient ON public.patient_medications(patient_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_medications TO authenticated;
GRANT ALL ON public.patient_medications TO service_role;
ALTER TABLE public.patient_medications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated view patient medications" ON public.patient_medications FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers write patient medications" ON public.patient_medications FOR ALL TO authenticated USING (public.can_manage(auth.uid())) WITH CHECK (public.can_manage(auth.uid()));
CREATE TRIGGER t_patient_medications_updated BEFORE UPDATE ON public.patient_medications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Patient documents
CREATE TABLE public.patient_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  doc_type TEXT,
  page_count INTEGER,
  storage_path TEXT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_patient_documents_patient ON public.patient_documents(patient_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_documents TO authenticated;
GRANT ALL ON public.patient_documents TO service_role;
ALTER TABLE public.patient_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated view patient documents" ON public.patient_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers write patient documents" ON public.patient_documents FOR ALL TO authenticated USING (public.can_manage(auth.uid())) WITH CHECK (public.can_manage(auth.uid()));
CREATE TRIGGER t_patient_documents_updated BEFORE UPDATE ON public.patient_documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Measurements
CREATE TABLE public.patient_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  metric public.measurement_metric NOT NULL,
  value NUMERIC(10,2) NOT NULL,
  unit TEXT NOT NULL DEFAULT '',
  measured_on DATE,
  source public.extraction_source NOT NULL DEFAULT 'MANUAL',
  source_document_id UUID REFERENCES public.patient_documents(id) ON DELETE SET NULL,
  source_page INTEGER,
  original_value NUMERIC(10,2),
  confidence NUMERIC(5,2),
  verification_status public.verification_status NOT NULL DEFAULT 'UNVERIFIED',
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_patient_measurements_patient ON public.patient_measurements(patient_id, metric, measured_on DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_measurements TO authenticated;
GRANT ALL ON public.patient_measurements TO service_role;
ALTER TABLE public.patient_measurements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated view patient measurements" ON public.patient_measurements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated verify measurements" ON public.patient_measurements FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Managers insert measurements" ON public.patient_measurements FOR INSERT TO authenticated WITH CHECK (public.can_manage(auth.uid()));
CREATE POLICY "Managers delete measurements" ON public.patient_measurements FOR DELETE TO authenticated USING (public.can_manage(auth.uid()));
CREATE TRIGGER t_patient_measurements_updated BEFORE UPDATE ON public.patient_measurements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- List view: latest metric values + roll-up verification status
CREATE VIEW public.patient_list_view
WITH (security_invoker = true) AS
SELECT
  p.id,
  p.patient_code,
  p.full_name,
  p.age,
  p.sex,
  p.date_of_birth,
  p.status,
  p.primary_condition,
  p.created_at,
  p.updated_at,
  COALESCE(c.conditions, '') AS conditions_text,
  latest.hba1c,
  latest.bmi,
  latest.egfr,
  COALESCE(v.overall_status, 'UNVERIFIED') AS verification_status
FROM public.patients p
LEFT JOIN LATERAL (
  SELECT string_agg(pc.name, ', ' ORDER BY pc.name) AS conditions
  FROM public.patient_conditions pc
  WHERE pc.patient_id = p.id
) c ON true
LEFT JOIN LATERAL (
  SELECT
    max(m.value) FILTER (WHERE m.metric = 'HBA1C' AND m.rn = 1) AS hba1c,
    max(m.value) FILTER (WHERE m.metric = 'BMI' AND m.rn = 1) AS bmi,
    max(m.value) FILTER (WHERE m.metric = 'EGFR' AND m.rn = 1) AS egfr
  FROM (
    SELECT pm.metric, pm.value,
           row_number() OVER (PARTITION BY pm.metric ORDER BY pm.measured_on DESC NULLS LAST, pm.created_at DESC) AS rn
    FROM public.patient_measurements pm
    WHERE pm.patient_id = p.id
  ) m
) latest ON true
LEFT JOIN LATERAL (
  SELECT CASE
    WHEN count(*) = 0 THEN 'UNVERIFIED'
    WHEN count(*) FILTER (WHERE pm.verification_status = 'UNVERIFIED') > 0 THEN 'UNVERIFIED'
    WHEN count(*) FILTER (WHERE pm.verification_status = 'CORRECTED') > 0 THEN 'CORRECTED'
    ELSE 'VERIFIED'
  END AS overall_status
  FROM public.patient_measurements pm
  WHERE pm.patient_id = p.id
) v ON true;

GRANT SELECT ON public.patient_list_view TO authenticated;
GRANT ALL ON public.patient_list_view TO service_role;