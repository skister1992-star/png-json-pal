
-- 1. Enum
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'approved', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. has_role security definer
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- 4. RLS on user_roles
DROP POLICY IF EXISTS "users see own roles" ON public.user_roles;
CREATE POLICY "users see own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 5. Tighten data tables to require approved/admin
DROP POLICY IF EXISTS "Users manage own lorebooks" ON public.lorebooks;
CREATE POLICY "Approved users manage own lorebooks" ON public.lorebooks
  FOR ALL TO authenticated
  USING (
    auth.uid() = user_id
    AND (public.has_role(auth.uid(), 'approved') OR public.has_role(auth.uid(), 'admin'))
  )
  WITH CHECK (
    auth.uid() = user_id
    AND (public.has_role(auth.uid(), 'approved') OR public.has_role(auth.uid(), 'admin'))
  );

DROP POLICY IF EXISTS "Users manage own user_cards" ON public.user_cards;
CREATE POLICY "Approved users manage own user_cards" ON public.user_cards
  FOR ALL TO authenticated
  USING (
    auth.uid() = user_id
    AND (public.has_role(auth.uid(), 'approved') OR public.has_role(auth.uid(), 'admin'))
  )
  WITH CHECK (
    auth.uid() = user_id
    AND (public.has_role(auth.uid(), 'approved') OR public.has_role(auth.uid(), 'admin'))
  );

DROP POLICY IF EXISTS "Users manage own characters" ON public.characters;
CREATE POLICY "Approved users manage own characters" ON public.characters
  FOR ALL TO authenticated
  USING (
    auth.uid() = user_id
    AND (public.has_role(auth.uid(), 'approved') OR public.has_role(auth.uid(), 'admin'))
  )
  WITH CHECK (
    auth.uid() = user_id
    AND (public.has_role(auth.uid(), 'approved') OR public.has_role(auth.uid(), 'admin'))
  );

-- 6. Admin functions
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  roles public.app_role[]
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    u.id,
    u.email::text,
    u.created_at,
    u.last_sign_in_at,
    COALESCE(
      ARRAY(SELECT r.role FROM public.user_roles r WHERE r.user_id = u.id ORDER BY r.role),
      ARRAY[]::public.app_role[]
    ) AS roles
  FROM auth.users u
  WHERE public.has_role(auth.uid(), 'admin')
  ORDER BY u.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_role(
  _user_id uuid,
  _role public.app_role,
  _grant boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: admin required' USING ERRCODE = '42501';
  END IF;

  IF _grant THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    -- prevent removing your own last admin role
    IF _role = 'admin' AND _user_id = auth.uid() THEN
      IF (SELECT COUNT(*) FROM public.user_roles WHERE role = 'admin') <= 1 THEN
        RAISE EXCEPTION 'Cannot remove the last admin' USING ERRCODE = '23514';
      END IF;
    END IF;
    DELETE FROM public.user_roles WHERE user_id = _user_id AND role = _role;
  END IF;
END;
$$;

-- 7. Bootstrap: first signed-in user can claim admin while no admins exist
CREATE OR REPLACE FUNCTION public.admin_claim_initial()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    RETURN false;
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'admin')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'approved')
  ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;

-- 8. Function to read own roles cleanly
CREATE OR REPLACE FUNCTION public.my_roles()
RETURNS public.app_role[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    ARRAY(SELECT role FROM public.user_roles WHERE user_id = auth.uid() ORDER BY role),
    ARRAY[]::public.app_role[]
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_role(uuid, public.app_role, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_claim_initial() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_roles() TO authenticated;
