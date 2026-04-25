
-- 1) Meta del formulario
UPDATE public.external_forms
   SET public_title = 'Diagnóstico de Inversión',
       public_subtitle = 'Cuéntanos sobre tu empresa y su situación de financiamiento. Esta información nos permite identificar oportunidades de inversión y acompañamiento.',
       submit_button_text = 'Enviar diagnóstico',
       success_message = '¡Gracias! Hemos recibido tu diagnóstico. Nuestro equipo lo revisará y te contactaremos pronto.'
 WHERE id = '48fc4c40-8b1b-4ce4-bbe4-3a2af73ed930';

-- 2) Eliminar pregunta huérfana sin destino CRM
DELETE FROM public.external_form_fields
 WHERE id = '83e10e50-3b33-4b68-8dc4-88ef636d6b69';

-- 3) Reordenar y agrupar campos existentes
-- Grupo A: Identidad de la empresa (campos companies)
UPDATE public.external_form_fields SET display_order = 0,  section_name = 'Identidad de la empresa', is_required = false WHERE id = '7fa94b35-7221-4645-9aff-56ec27b374ee'; -- Logo
UPDATE public.external_form_fields SET display_order = 1,  section_name = 'Identidad de la empresa', is_required = true  WHERE id = '69411197-b5bd-4ba9-a8a5-ebd6db0354f4'; -- Razón social
UPDATE public.external_form_fields SET display_order = 2,  section_name = 'Identidad de la empresa', is_required = true  WHERE id = '7035988b-a020-404e-9050-8d6268e7e267'; -- NIT
UPDATE public.external_form_fields SET display_order = 3,  section_name = 'Identidad de la empresa', is_required = false WHERE id = 'b0f6d7e0-23d5-4437-ac16-3c47ffc0b3bc'; -- Nombre comercial
UPDATE public.external_form_fields SET display_order = 4,  section_name = 'Identidad de la empresa', is_required = true  WHERE id = '576e1ca7-f0a1-4325-9ea4-afc15a04d9d4'; -- Vertical
UPDATE public.external_form_fields SET display_order = 5,  section_name = 'Identidad de la empresa', is_required = false WHERE id = '19e6b6d7-8dcc-4b30-bcf4-162d9dfc7baa'; -- Descripción

-- Grupo B: Información general (custom_fields sin sección CRM)
UPDATE public.external_form_fields SET display_order = 6,  section_name = 'Información general', is_required = false WHERE id = '6fe719a2-75f3-4abe-a845-de5d5aed90bc'; -- Antigüedad
UPDATE public.external_form_fields SET display_order = 7,  section_name = 'Información general', is_required = false WHERE id = '325efa6a-cead-436c-9062-01ccf61aade1'; -- Número de socios
UPDATE public.external_form_fields SET display_order = 8,  section_name = 'Información general', is_required = false WHERE id = 'e317383c-bec7-4721-9f24-0dc56ceaa80b'; -- Principales clientes
UPDATE public.external_form_fields SET display_order = 10, section_name = 'Información general', is_required = false WHERE id = '12880550-c3b4-4907-8955-cb9e1b693f92'; -- Utilidad operacional
UPDATE public.external_form_fields SET display_order = 11, section_name = 'Información general', is_required = false WHERE id = '0a4f6b25-8429-4157-aced-70b01695121d'; -- Exportaciones USD

-- Grupo C: Financiamiento / Inversión (sección CRM real)
UPDATE public.external_form_fields SET display_order = 14, section_name = 'Financiamiento / Inversión', is_required = false WHERE id = 'f001c5fa-6ac7-4c58-b9d8-00cfe6637ed7'; -- EBITDA
UPDATE public.external_form_fields SET display_order = 15, section_name = 'Financiamiento / Inversión', is_required = false WHERE id = '35836bc5-c3a7-4e79-9be8-ff1e527b2829'; -- Activos pignorables
UPDATE public.external_form_fields SET display_order = 16, section_name = 'Financiamiento / Inversión', is_required = false WHERE id = '217eed99-cd4a-4907-847e-0e762493cbf7'; -- Flujos de caja
UPDATE public.external_form_fields SET display_order = 17, section_name = 'Financiamiento / Inversión', is_required = false WHERE id = 'b1ad724a-d551-4197-9081-ed839e8e201b'; -- Impacto social
UPDATE public.external_form_fields SET display_order = 18, section_name = 'Financiamiento / Inversión', is_required = false WHERE id = 'a9e64d52-d43f-4db6-b837-e67e8bb2417a'; -- Potencial expansión internacional

-- 4) Conectar "Estado de Empresa" (custom_field b18a3cc8) al formulario en Información general
INSERT INTO public.external_form_fields (
  form_id, field_key, label, field_type, crm_table, crm_field_id, crm_column,
  preload_from_crm, is_required, is_visible, is_editable, display_order, section_name, options
) VALUES (
  '48fc4c40-8b1b-4ce4-bbe4-3a2af73ed930',
  'custom_b18a3cc8-1859-4940-86a6-312a8d3fe099',
  'Estado de la empresa',
  'select',
  'custom_field_values',
  'b18a3cc8-1859-4940-86a6-312a8d3fe099',
  NULL,
  true, false, true, true, 9, 'Información general',
  COALESCE((SELECT options FROM public.custom_fields WHERE id = 'b18a3cc8-1859-4940-86a6-312a8d3fe099'), '[]'::jsonb)
)
ON CONFLICT DO NOTHING;

-- 5) Agregar pregunta gatillo "¿Está levantando inversión?" (custom_field e9c8d4bb)
INSERT INTO public.external_form_fields (
  form_id, field_key, label, field_type, crm_table, crm_field_id, crm_column,
  preload_from_crm, is_required, is_visible, is_editable, display_order, section_name, options, help_text
) VALUES (
  '48fc4c40-8b1b-4ce4-bbe4-3a2af73ed930',
  'custom_e9c8d4bb-4c4c-465e-8b15-05cc84d5a1cf',
  '¿Está levantando inversión actualmente?',
  'select',
  'custom_field_values',
  'e9c8d4bb-4c4c-465e-8b15-05cc84d5a1cf',
  NULL,
  true, true, true, true, 12, 'Financiamiento / Inversión',
  COALESCE((SELECT options FROM public.custom_fields WHERE id = 'e9c8d4bb-4c4c-465e-8b15-05cc84d5a1cf'), '["Sí","No"]'::jsonb),
  'Si tu respuesta es "Sí", te pediremos detalles del monto y tipo de inversión.'
)
ON CONFLICT DO NOTHING;

-- 6) Agregar "Monto buscado" condicional (custom_field 86f7c940)
INSERT INTO public.external_form_fields (
  form_id, field_key, label, field_type, crm_table, crm_field_id, crm_column,
  preload_from_crm, is_required, is_visible, is_editable, display_order, section_name,
  condition_field_key, condition_value, options
) VALUES (
  '48fc4c40-8b1b-4ce4-bbe4-3a2af73ed930',
  'custom_86f7c940-2b4d-4c8f-a3f8-21e2e55f3ef9',
  'Monto buscado (USD)',
  'number',
  'custom_field_values',
  '86f7c940-2b4d-4c8f-a3f8-21e2e55f3ef9',
  NULL,
  true, false, true, true, 13, 'Financiamiento / Inversión',
  'custom_e9c8d4bb-4c4c-465e-8b15-05cc84d5a1cf', 'Sí', '[]'::jsonb
)
ON CONFLICT DO NOTHING;

-- 7) Agregar "Tipo de inversión que busca" condicional (custom_field 213278c5)
INSERT INTO public.external_form_fields (
  form_id, field_key, label, field_type, crm_table, crm_field_id, crm_column,
  preload_from_crm, is_required, is_visible, is_editable, display_order, section_name,
  condition_field_key, condition_value, options
) VALUES (
  '48fc4c40-8b1b-4ce4-bbe4-3a2af73ed930',
  'custom_213278c5-bb64-4a2a-ab95-8dd0de4e7ef0',
  '¿Qué tipo de inversión estás buscando?',
  'select',
  'custom_field_values',
  '213278c5-bb64-4a2a-ab95-8dd0de4e7ef0',
  NULL,
  true, false, true, true, 13, 'Financiamiento / Inversión',
  'custom_e9c8d4bb-4c4c-465e-8b15-05cc84d5a1cf', 'Sí',
  COALESCE((SELECT options FROM public.custom_fields WHERE id = '213278c5-bb64-4a2a-ab95-8dd0de4e7ef0'), '[]'::jsonb)
)
ON CONFLICT DO NOTHING;
