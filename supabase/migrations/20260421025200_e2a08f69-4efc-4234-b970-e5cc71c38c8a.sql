UPDATE public.feature_settings 
SET config = jsonb_set(jsonb_set(coalesce(config,'{}'::jsonb), '{model}', '"gpt-5.4-mini"'), '{reasoningEffort}', '"none"'), 
    updated_at = now() 
WHERE feature_key = 'company_chat';

INSERT INTO public.feature_settings (feature_key, config)
SELECT 'company_chat', '{"model":"gpt-5.4-mini","reasoningEffort":"none"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.feature_settings WHERE feature_key = 'company_chat');