## Plan: Relación formulario ↔ perfil CRM + fix verificación y fallback NIT

### Bloque A — Mapeo claro entre campos del formulario y el perfil CRM
Hoy `section_name` del formulario es solo un texto agrupador para el público y NO está conectado al CRM. Vamos a dejarlo explícito en el constructor.

1. **Etiqueta de origen por campo** en `FormWizardDialog.tsx` (lista de campos del paso "Constructor de campos"):
   - Si `crm_table === 'companies'` → badge azul **"Perfil principal · Datos básicos"** (no editable, va a `companies`).
   - Si `crm_field_id` (custom) → badge violeta **"CRM · sección «<nombre real de la custom_section>»"**, mostrando el nombre obtenido de `customSections` por el `sectionId` del `custom_fields`.
   - Si `crm_table === null` y no es custom → badge ámbar **"Solo formulario (no se guarda en CRM)"** + tooltip explicando que ese dato queda únicamente en `external_form_responses`.
2. **Sección visible al público** (`section_name`): renombrar el label a **"Agrupador visible al público"** y aclarar con texto pequeño que no afecta el CRM. Eso elimina la confusión de "creé Información General y no aparece en el CRM".
3. **Campos nativos de companies** (NIT, razón social, ciudad, vertical, etc.): forzar `section_name = ''` por defecto cuando se agregan, porque van al bloque "Datos básicos" del perfil principal y no a una sección custom. La IA tiene prohibido cambiar esto.
4. **Edición/orden real del perfil CRM** sigue haciéndose desde el módulo de Custom Fields/Sections del CRM (ya existe). Agregamos en el wizard, junto al label de cada campo CRM, un mini-link **"Editar en CRM →"** que abre la pestaña de configuración (cuando aplique).

### Bloque B — UX de propuestas de la IA (sección/campo nuevo)
La razón por la que "Información General" no quedó en el CRM es que la card de propuesta requiere clic en *Aceptar* y probablemente no se vio. Mejoras:

1. En `FormAIBuilderChat.tsx`, hacer la card de **propuesta pendiente** mucho más prominente: borde ámbar grueso, ícono de alerta, copia clara: *"⚠ Esta acción crea recursos en el CRM. Requiere tu autorización."* + dos botones grandes (Aceptar / Rechazar).
2. Cuando la IA propone una sección y el usuario acepta, además de `addSection`, guardar el `sectionId` recién creado en un mapa local `proposedSectionMap[a.name] = sectionId` para que cualquier campo posterior que la IA vincule a esa sección por nombre se conecte realmente.
3. Después de aceptar, en el chat insertar un mensaje de sistema visible: *"✅ Sección «X» creada en el CRM"* o *"✅ Campo «Y» creado en CRM (sección «Z»)"*.
4. **Validación servidor (edge function `form-ai-builder`)**: si la IA usa `add_existing_crm_field` con un `field_key` que no existe en el catálogo, devolverlo como `pendingProposal` automático de tipo `propose_new_free_field` en lugar de descartar silenciosamente. Esto evita que la IA "diga que creó algo" sin que pase nada.

### Bloque C — Fix "Sin verificación" se sigue pidiendo
1. **`src/pages/PublicFormPage.tsx` (efecto inicial, línea ~193)**: cambiar la condición de auto-skip de identificación. Hoy:
   ```ts
   if (data.form.form_type === 'creation' && data.form.verification_mode === 'none') { ... setStep('form') }
   ```
   Cambiar a:
   ```ts
   if (data.form.verification_mode === 'none') { ... cargar form y setStep('form') }
   ```
   Para `update`/`collection` con `verification_mode === 'none'`, además llamar a `identify` con `key_value` vacío para crear la sesión sin compañía (la edge function ya soporta el caso `verification_mode === 'none'` con `company_id: null`).
2. **`form-verify/index.ts`**: relajar la regla que exige `key_value` cuando `verification_mode === 'none'`. Si es `none`, generar la sesión sin requerir `key_value` ni buscar empresa.
3. Verificar que el form "Diagnóstico Inversión" actualmente tiene `key_and_code` en DB (no `none`). Eso significa que el usuario eligió "Sin verificación" en la UI pero NO guardó. Agregar un **toast de confirmación** al cambiar el `verification_mode` recordando guardar, y marcar el paso de Publicación como "cambios sin guardar" cuando hay diff.

### Bloque D — Fix flujo "Recibir empresas que pongan el NIT y no lo encuentren"
Hoy con `allow_name_fallback = true` el público:
- Solo ve el checkbox "No tengo NIT" si `verification_mode !== 'none'`.
- Si pone un nombre que no existe, recibe 404 sin opción de continuar.

Cambios:
1. **`PublicFormPage.tsx`**: mostrar el checkbox "No tengo NIT" siempre que `formMeta.allow_name_fallback === true`, independiente del `verification_mode` (incluso si es `none` y `form_type !== 'creation'`).
2. **`form-verify/index.ts` (action `identify`)**: cuando `use_name_fallback && allow_name_fallback && !company && form.allow_creation`:
   - No retornar 404. En su lugar, crear sesión con `company_id: null` y un flag `is_new_company: true`.
   - Si `verification_mode === 'none'` o `key_only` → marcar verified y devolver token.
   - Si `key_and_code` → no podemos enviar OTP (sin email), así que devolver `requires_email_input: true` para pedir un email donde mandar el código.
3. **`PublicFormPage.tsx`**: nuevo step `'collect-email'` que aparece cuando `requires_email_input` es true; al enviar email llama a un nuevo subaction `send-code-to-email` y pasa al step `'code'`. Tras verificar OTP, marca `isNewCompany = true` y va al `step: 'form'` con `formData = {}` y la empresa se crea al submit (lógica que ya existe en `external_form_responses` cuando `company_id` viene null y `allow_creation`).
4. Mostrar copy claro: *"No encontramos esa empresa. Continuarás como nueva empresa y la registraremos al enviar el formulario."*

### Bloque E — Migración pequeña
No requerimos schema nuevo. Reutilizamos `external_form_sessions.company_id NULL` para "empresa nueva en proceso". Solo agregar columna opcional `pending_email TEXT` en `external_form_sessions` para almacenar el email del nuevo creador y enviarle el OTP. (Migración incluida.)

### Resumen de archivos
- **Migración**: agregar `pending_email TEXT NULL` a `external_form_sessions`.
- **Editar**:
  - `src/components/forms/FormWizardDialog.tsx` (badges de origen, etiqueta "Agrupador visible al público", link "Editar en CRM", proposedSectionMap, toast de cambios sin guardar).
  - `src/components/forms/FormAIBuilderChat.tsx` (cards de propuesta más prominentes, mensajes ✅).
  - `supabase/functions/form-ai-builder/index.ts` (validar field_key inexistente → convertir a propuesta).
  - `src/pages/PublicFormPage.tsx` (skip identify cuando `verification_mode==='none'` para todos los tipos; checkbox "No tengo NIT" siempre que `allow_name_fallback`; nuevo step `collect-email`).
  - `supabase/functions/form-verify/index.ts` (no exigir key_value si none; aceptar fallback con creación; subaction `send-code-to-email`).
