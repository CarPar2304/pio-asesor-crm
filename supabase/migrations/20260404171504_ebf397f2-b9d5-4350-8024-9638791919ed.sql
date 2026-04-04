
CREATE TABLE public.feature_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text NOT NULL UNIQUE,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.feature_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read feature_settings" ON public.feature_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage feature_settings" ON public.feature_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.company_fit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  company_name text NOT NULL DEFAULT '',
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload jsonb,
  rues_data jsonb,
  rues_found boolean NOT NULL DEFAULT false,
  rues_attempts text[] NOT NULL DEFAULT '{}',
  model text NOT NULL DEFAULT '',
  reasoning_effort text NOT NULL DEFAULT '',
  duration_ms integer,
  error text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.company_fit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read company_fit_logs" ON public.company_fit_logs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert company_fit_logs" ON public.company_fit_logs
  FOR INSERT TO authenticated WITH CHECK (true);

INSERT INTO public.feature_settings (feature_key, config) VALUES (
  'company_fit',
  '{"model": "gpt-5.4", "reasoning_effort": "high", "prompt": "", "rues_enabled": true, "rues_api_url": "https://www.datos.gov.co/resource/c82u-588k.json"}'::jsonb
);
