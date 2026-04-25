DO $$
DECLARE
  v_clientes uuid := gen_random_uuid();
  v_socios uuid := gen_random_uuid();
  v_antig uuid := gen_random_uuid();
  v_util uuid := gen_random_uuid();
  v_max_order int;
BEGIN
  SELECT COALESCE(MAX(display_order), -1) INTO v_max_order FROM public.custom_fields WHERE section_id IS NULL;

  INSERT INTO public.custom_fields (id, section_id, name, field_type, options, display_order) VALUES
    (v_clientes, NULL, 'Principales clientes', 'text', '[]'::jsonb, v_max_order + 1),
    (v_socios,   NULL, 'Número de socios (participantes en la propiedad)', 'number', '[]'::jsonb, v_max_order + 2),
    (v_antig,    NULL, 'Antigüedad de la empresa (años)', 'number', '[]'::jsonb, v_max_order + 3),
    (v_util,     NULL, 'Utilidad operacional último año', 'number', '[]'::jsonb, v_max_order + 4);

  UPDATE public.external_form_fields
     SET crm_table = 'custom_field_values',
         crm_column = NULL,
         crm_field_id = v_clientes,
         preload_from_crm = true,
         section_name = ''
   WHERE id = 'e317383c-bec7-4721-9f24-0dc56ceaa80b';

  UPDATE public.external_form_fields
     SET crm_table = 'custom_field_values',
         crm_column = NULL,
         crm_field_id = v_socios,
         preload_from_crm = true,
         section_name = ''
   WHERE id = '325efa6a-cead-436c-9062-01ccf61aade1';

  UPDATE public.external_form_fields
     SET crm_table = 'custom_field_values',
         crm_column = NULL,
         crm_field_id = v_antig,
         preload_from_crm = true,
         section_name = ''
   WHERE id = '6fe719a2-75f3-4abe-a845-de5d5aed90bc';

  UPDATE public.external_form_fields
     SET crm_table = 'custom_field_values',
         crm_column = NULL,
         crm_field_id = v_util,
         preload_from_crm = true,
         section_name = ''
   WHERE id = '12880550-c3b4-4907-8955-cb9e1b693f92';
END $$;