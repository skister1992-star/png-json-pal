CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.admin_settings (
  id INT PRIMARY KEY DEFAULT 1,
  password_hash TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT admin_settings_singleton CHECK (id = 1)
);
GRANT ALL ON public.admin_settings TO service_role;
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role (bypasses RLS) can access.

CREATE TABLE public.admin_sessions (
  token TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.admin_sessions TO service_role;
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;

-- Seed default admin password = 'admin:root' (bcrypt)
INSERT INTO public.admin_settings (id, password_hash)
VALUES (1, crypt('admin:root', gen_salt('bf', 10)))
ON CONFLICT (id) DO NOTHING;