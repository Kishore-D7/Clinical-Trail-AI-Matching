
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role); $$;

CREATE OR REPLACE FUNCTION private.can_manage(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('ADMIN','CLINICAL_COORDINATOR')); $$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_manage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_manage(uuid) TO authenticated, service_role;

DROP POLICY "Users view own roles" ON public.user_roles;
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated
USING ((auth.uid() = user_id) OR private.has_role(auth.uid(), 'ADMIN'::public.app_role));

DROP POLICY "Managers write patients" ON public.patients;
CREATE POLICY "Managers write patients" ON public.patients FOR ALL TO authenticated
USING (private.can_manage(auth.uid())) WITH CHECK (private.can_manage(auth.uid()));

DROP POLICY "Managers write trials" ON public.clinical_trials;
CREATE POLICY "Managers write trials" ON public.clinical_trials FOR ALL TO authenticated
USING (private.can_manage(auth.uid())) WITH CHECK (private.can_manage(auth.uid()));

DROP POLICY "Managers write matches" ON public.trial_matches;
CREATE POLICY "Managers write matches" ON public.trial_matches FOR ALL TO authenticated
USING (private.can_manage(auth.uid())) WITH CHECK (private.can_manage(auth.uid()));

DROP POLICY "Managers write documents" ON public.documents;
CREATE POLICY "Managers write documents" ON public.documents FOR ALL TO authenticated
USING (private.can_manage(auth.uid())) WITH CHECK (private.can_manage(auth.uid()));

DROP POLICY "Managers write patient conditions" ON public.patient_conditions;
CREATE POLICY "Managers write patient conditions" ON public.patient_conditions FOR ALL TO authenticated
USING (private.can_manage(auth.uid())) WITH CHECK (private.can_manage(auth.uid()));

DROP POLICY "Managers write patient medications" ON public.patient_medications;
CREATE POLICY "Managers write patient medications" ON public.patient_medications FOR ALL TO authenticated
USING (private.can_manage(auth.uid())) WITH CHECK (private.can_manage(auth.uid()));

DROP POLICY "Managers write patient documents" ON public.patient_documents;
CREATE POLICY "Managers write patient documents" ON public.patient_documents FOR ALL TO authenticated
USING (private.can_manage(auth.uid())) WITH CHECK (private.can_manage(auth.uid()));

DROP POLICY "Managers insert measurements" ON public.patient_measurements;
CREATE POLICY "Managers insert measurements" ON public.patient_measurements FOR INSERT TO authenticated
WITH CHECK (private.can_manage(auth.uid()));

DROP POLICY "Managers delete measurements" ON public.patient_measurements;
CREATE POLICY "Managers delete measurements" ON public.patient_measurements FOR DELETE TO authenticated
USING (private.can_manage(auth.uid()));

DROP POLICY "Managers write ai extractions" ON public.patient_ai_extractions;
CREATE POLICY "Managers write ai extractions" ON public.patient_ai_extractions FOR ALL TO authenticated
USING (private.can_manage(auth.uid())) WITH CHECK (private.can_manage(auth.uid()));

DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.can_manage(uuid);
