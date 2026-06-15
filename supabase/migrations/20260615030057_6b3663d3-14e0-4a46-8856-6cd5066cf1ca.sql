CREATE TABLE public.oauth_app_config (
  id integer PRIMARY KEY DEFAULT 1,
  google_client_id text NOT NULL DEFAULT '',
  microsoft_client_id text NOT NULL DEFAULT '',
  microsoft_tenant text NOT NULL DEFAULT 'common',
  dropbox_app_key text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);
INSERT INTO public.oauth_app_config (id) VALUES (1) ON CONFLICT DO NOTHING;
GRANT SELECT ON public.oauth_app_config TO anon, authenticated;
GRANT ALL ON public.oauth_app_config TO service_role;
ALTER TABLE public.oauth_app_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read oauth config" ON public.oauth_app_config FOR SELECT TO anon, authenticated USING (true);