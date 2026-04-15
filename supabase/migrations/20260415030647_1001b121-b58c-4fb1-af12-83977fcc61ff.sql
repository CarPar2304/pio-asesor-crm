
-- Add allow_name_fallback to external_forms
ALTER TABLE public.external_forms
ADD COLUMN allow_name_fallback boolean NOT NULL DEFAULT false;

-- Insert default sales_currency setting if not exists
INSERT INTO public.feature_settings (feature_key, config)
VALUES ('sales_currency', '{"code":"COP","symbol":"$","locale":"es-CO"}'::jsonb)
ON CONFLICT DO NOTHING;
