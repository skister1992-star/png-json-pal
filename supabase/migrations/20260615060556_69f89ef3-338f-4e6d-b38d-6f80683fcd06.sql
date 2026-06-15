CREATE OR REPLACE FUNCTION public.admin_login(_password TEXT)
RETURNS TABLE(token TEXT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _ok BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_settings
    WHERE id = 1
      AND password_hash = crypt(_password, password_hash)
  ) INTO _ok;

  IF NOT _ok THEN
    RAISE EXCEPTION 'Falsches Passwort' USING ERRCODE = '28000';
  END IF;

  token := encode(gen_random_bytes(32), 'hex');
  expires_at := now() + interval '24 hours';

  INSERT INTO public.admin_sessions (token, expires_at)
  VALUES (token, expires_at);

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_login(TEXT) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_login(TEXT) TO anon, service_role;