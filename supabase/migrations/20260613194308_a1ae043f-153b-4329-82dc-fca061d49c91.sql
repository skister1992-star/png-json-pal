CREATE TABLE public.lorebooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Unnamed',
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lorebooks TO authenticated;
GRANT ALL ON public.lorebooks TO service_role;
ALTER TABLE public.lorebooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own lorebooks" ON public.lorebooks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_lorebooks_updated_at BEFORE UPDATE ON public.lorebooks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.user_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Unnamed',
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_cards TO authenticated;
GRANT ALL ON public.user_cards TO service_role;
ALTER TABLE public.user_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own user_cards" ON public.user_cards FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_user_cards_updated_at BEFORE UPDATE ON public.user_cards FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();