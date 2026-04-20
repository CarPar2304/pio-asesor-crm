UPDATE public.feature_settings
SET config = coalesce(config, '{}'::jsonb) || jsonb_build_object('model', 'gpt-5.4-mini', 'reasoningEffort', 'high'),
    updated_at = now()
WHERE feature_key = 'company_chat';