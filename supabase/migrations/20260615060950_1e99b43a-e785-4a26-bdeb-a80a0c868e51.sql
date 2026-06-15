CREATE OR REPLACE FUNCTION public.admin_login(_password TEXT)
RETURNS TABLE(token TEXT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
  _ok BOOLEAN;
BEGIN
  PERFORM set_config('app.admin_login_password', COALESCE(_password, ''), true);

  SELECT EXISTS (
    SELECT 1
    FROM public.admin_settings
    WHERE id = 1
  ) INTO _ok;

  PERFORM set_config('app.admin_login_password', '', true);

  IF NOT _ok THEN
    RAISE EXCEPTION 'Falsches Passwort' USING ERRCODE = '28000';
  END IF;

  PERFORM set_config('app.admin_login_verified', 'true', true);

  token := encode(gen_random_bytes(32), 'hex');
  expires_at := now() + interval '24 hours';

  INSERT INTO public.admin_sessions (token, expires_at)
  VALUES (token, expires_at);

  PERFORM set_config('app.admin_login_verified', '', true);

  RETURN NEXT;
END;
$$;

DROP POLICY IF EXISTS "Allow admin password verification via login rpc" ON public.admin_settings;
DROP POLICY IF EXISTS "Allow admin login sessions via login rpc" ON public.admin_sessions;

GRANT SELECT ON public.admin_settings TO anon;
GRANT INSERT ON public.admin_sessions TO anon;

CREATE POLICY "Allow admin password verification via login rpc"
ON public.admin_settings
FOR SELECT
TO anon
USING (
  current_setting('app.admin_login_password', true) <> ''
  AND password_hash = crypt(current_setting('app.admin_login_password', true), password_hash)
);

CREATE POLICY "Allow admin login sessions via login rpc"
ON public.admin_sessions
FOR INSERT
TO anon
WITH CHECK (current_setting('app.admin_login_verified', true) = 'true');

REVOKE ALL ON FUNCTION public.admin_login(TEXT) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_login(TEXT) TO anon, service_role;