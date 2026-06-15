CREATE OR REPLACE FUNCTION public.admin_verify_password(_password TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_settings
    WHERE id = 1 AND password_hash = crypt(_password, password_hash)
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_set_password(_new_password TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  UPDATE public.admin_settings
     SET password_hash = crypt(_new_password, gen_salt('bf', 10)),
         updated_at = now()
   WHERE id = 1;
$$;

REVOKE ALL ON FUNCTION public.admin_verify_password(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_password(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_verify_password(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_password(TEXT) TO service_role;