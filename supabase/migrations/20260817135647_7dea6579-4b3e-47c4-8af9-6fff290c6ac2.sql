ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Signup role selection: only non-privileged roles may be self-assigned.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  requested text := NEW.raw_user_meta_data ->> 'requested_role';
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'), NEW.email)
  ON CONFLICT (id) DO NOTHING;

  IF requested IN ('RESEARCHER', 'CLINICAL_COORDINATOR') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, requested::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- Existing accounts with no role get the safe default; existing roles untouched.
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'RESEARCHER'::app_role
FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id)
ON CONFLICT (user_id, role) DO NOTHING;

-- Users may update their own profile, but never their own account status.
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_active IS DISTINCT FROM OLD.is_active
     AND NOT private.has_role(auth.uid(), 'ADMIN'::app_role) THEN
    RAISE EXCEPTION 'Only administrators can change account status';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS protect_profile_privileged_fields ON public.profiles;
CREATE TRIGGER protect_profile_privileged_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_fields();