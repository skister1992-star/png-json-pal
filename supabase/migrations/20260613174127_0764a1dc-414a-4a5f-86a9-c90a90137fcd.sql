
CREATE TABLE public.characters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Unnamed',
  data JSONB NOT NULL,
  image_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.characters TO authenticated;
GRANT ALL ON public.characters TO service_role;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own characters" ON public.characters FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX characters_user_id_idx ON public.characters(user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_characters_updated_at BEFORE UPDATE ON public.characters
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage policies for character-images bucket
CREATE POLICY "Users read own character images" ON storage.objects FOR SELECT
USING (bucket_id = 'character-images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users upload own character images" ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'character-images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users update own character images" ON storage.objects FOR UPDATE
USING (bucket_id = 'character-images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users delete own character images" ON storage.objects FOR DELETE
USING (bucket_id = 'character-images' AND auth.uid()::text = (storage.foldername(name))[1]);
