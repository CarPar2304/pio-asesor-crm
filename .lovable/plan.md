## Diagnóstico verificado

La implementación actual todavía no cumple completamente EB.

Confirmé en base de datos para el formulario **Diagnóstico Inversión** (`48fc4c40-8b1b-4ce4-bbe4-3a2af73ed930`):

- En `custom_sections` solo existen estas secciones reales del CRM:
  - `Financiamiento / Inversión`
  - `Mercado`
- No existe `Información General` como sección del CRM.
- En `external_form_fields`, los campos bajo `section_name = 'Información general'` son solo agrupadores visuales del formulario:
  - `Principales clientes`
  - `Número de socios (participantes en la propiedad)`
  - `Antigüedad de la empresa (años)`
- Esos campos tienen `crm_table = NULL` y `crm_field_id = NULL`, por eso no aparecen en el perfil del CRM.
- `Utilidad operacional último año` está en `section_name = 'Información financiera'`, también como campo solo formulario.
- El perfil CRM solo muestra:
  - campos nativos de `companies`/`contacts` en bloques principales,
  - `custom_fields` sin sección en la pestaña `Campos personalizados`,
  - `custom_fields` con `section_id` en pestañas/secciones CRM.

Aclaración importante que voy a aplicar: **“Información General” no debe ser una pestaña/sección custom en este caso; debe entrar como campos del CRM principal / campos sin sección, no dentro de secciones personalizadas.**

## Modelo de negocio corregido

A partir de ahora el sistema tendrá 3 destinos explícitos para cada pregunta:

```text
Pregunta del formulario
├─ CRM principal
│  ├─ campo nativo existente: companies.* / contacts.*
│  └─ campo CRM global sin sección: custom_fields.section_id = null
├─ CRM sección
│  └─ campo CRM dentro de custom_sections
└─ Solo formulario
   └─ se guarda solo en external_form_responses.response_data
```

Reglas finales:

1. **No existen secciones solo formulario** cuando la intención es CRM.
2. **Las secciones creadas por IA son secciones del CRM**, salvo que el usuario diga explícitamente “solo agrupar visualmente en el formulario”.
3. **“Información general” debe tratarse como destino CRM principal**, no como una sección custom.
4. **Campos libres solo formulario** sí pueden existir, pero deben quedar claramente marcados como “Solo formulario”.
5. Todo campo creado desde formularios que tenga destino CRM debe quedar visible en el perfil CRM después de guardar.
6. Crear o modificar estructura CRM requiere aprobación; crear preguntas solo formulario puede aplicarse automáticamente.

## Plan de corrección

### 1. Reparar el caso existente: Diagnóstico Inversión

Haré una corrección de datos puntual:

- Crear en `custom_fields` como **campos CRM principales sin sección** (`section_id = null`) estos campos del formulario:
  - `Principales clientes` → tipo texto
  - `Número de socios (participantes en la propiedad)` → tipo número
  - `Antigüedad de la empresa (años)` → tipo número
  - `Utilidad operacional último año` → tipo número
- Actualizar los registros correspondientes de `external_form_fields` para que apunten a esos campos:
  - `crm_table = 'custom_field_values'`
  - `crm_field_id = <nuevo custom_field.id>`
  - `preload_from_crm = true`
  - `section_name = ''` para los de Información General, porque deben aparecer como CRM principal / campos sin sección.
- Mantener el orden del formulario como está.

Resultado: esos campos aparecerán en el perfil CRM en `Campos personalizados` / bloque principal de campos custom sin sección, no como una pestaña nueva.

### 2. Ajustar el perfil CRM para que “campos CRM principales” sean visibles aunque no tengan valor

Ahora el perfil oculta campos custom sin valor. Eso hace que un campo recién creado parezca inexistente.

Cambiaré `CompanyProfile.tsx` para que:

- Muestre los campos CRM principales sin sección aunque estén vacíos, con valor `—`.
- Muestre también las secciones CRM aunque sus campos aún no tengan valor, si la sección contiene campos definidos.
- Diferencie visualmente:
  - Datos básicos / métricas nativas.
  - Campos CRM principales (`custom_fields.section_id = null`).
  - Secciones CRM (`custom_sections`).

Resultado: un campo creado por IA se ve inmediatamente en el perfil, incluso antes de que una empresa tenga respuesta.

### 3. Cambiar el AI Builder para entender “CRM principal” vs “CRM sección”

En `supabase/functions/form-ai-builder/index.ts` agregaré/ajustaré herramientas:

- `propose_new_main_crm_field(...)`
  - crea un `custom_field` sin sección (`section_id = null`)
  - requiere aprobación
  - usar para cosas como `Información General`, datos generales, “Número de socios”, “Antigüedad”, “Principales clientes” cuando no son nativos.
- `propose_new_section(...)`
  - crea una sección real del CRM (`custom_sections`)
  - requiere aprobación
- `propose_new_section_crm_field(...)` o mantener `propose_new_crm_field(...)`
  - crea un campo dentro de una sección CRM
  - requiere aprobación
- `add_form_only_field(...)`
  - crea pregunta solo formulario
  - auto-aplicado
- `move_field_to_main_crm(...)`
  - promueve un campo solo formulario a campo CRM principal
  - requiere aprobación
- `move_field_to_crm_section(...)`
  - mueve/promueve un campo a sección CRM
  - requiere aprobación
- `move_field_out_of_crm(...)`
  - deja un campo solo en formulario
  - requiere aprobación
- `delete_field(...)`
  - si es CRM, quita del formulario pero no borra del CRM sin confirmación explícita
  - si es solo formulario, auto
- `delete_form_group(...)`
  - elimina solo agrupación visual del formulario, no CRM

Actualizaré el prompt del sistema para que la IA use estas reglas:

- “Información General” → campos CRM principales, no sección custom, salvo que el usuario pida pestaña/sección.
- “Crea una sección de Financiamiento/Inversión” → sección CRM.
- “Pregunta opcional/comentarios/¿cómo te enteraste?” → solo formulario.
- Si agrega campos a una sección, primero debe existir o proponer la sección.
- Si agrega campos actuales del CRM, debe usar el catálogo existente, no inventar `field_key`.

### 4. Ajustar el Wizard para aplicar propuestas correctamente

En `FormWizardDialog.tsx`:

- `acceptProposal` soportará:
  - crear campo CRM principal (`sectionId: null`),
  - crear sección CRM,
  - crear campo dentro de sección,
  - promover campo solo formulario a CRM principal o a sección,
  - mover campo CRM entre principal/sección.
- `handleSave` sincronizará según el destino real:
  - campo nativo `companies/contacts` → `section_name = ''`
  - custom field sin sección → `section_name = ''`
  - custom field con sección → `section_name = nombre real de custom_sections`
  - solo formulario → puede conservar agrupador visual si existe
- El contexto enviado a la IA incluirá:
  - `origin`: `crm_native`, `crm_main_custom`, `crm_section_custom`, `form_only`
  - `crm_section_name`
  - `public_group_name`
  - condicionales actuales
  - campos ya existentes en CRM principal y secciones

### 5. UI manual para que no dependa solo de la IA

En el constructor de campos del formulario agregaré acciones visibles:

- En campos “Solo formulario”:
  - `Pasar a CRM principal`
  - `Pasar a sección CRM`
- En campos CRM principal:
  - `Mover a sección CRM`
  - `Quitar del formulario`
- En campos de sección CRM:
  - `Mover a CRM principal`
  - `Mover a otra sección CRM`
  - `Quitar del formulario`
- En agrupadores visuales huérfanos:
  - banner: “Este agrupador no existe en CRM”
  - acciones: `Convertir campos a CRM principal`, `Convertir en sección CRM`, `Dejar solo formulario`

### 6. Mejorar cards del chat de IA

En `FormAIBuilderChat.tsx`:

- Diferenciar claramente propuestas:
  - `Nuevo campo CRM principal`
  - `Nueva sección CRM`
  - `Nuevo campo en sección CRM`
  - `Pregunta solo formulario aplicada`
- Persistir historial con estado aceptado/rechazado.
- Mostrar resumen de auto-cambios aplicados.

### 7. Validación funcional

Después de implementar probaré estos flujos:

1. Abrir `Diagnóstico Inversión` y confirmar que los campos de `Información General` ya están conectados a CRM.
2. Abrir el perfil actual `/empresa/c5c90fd6-1437-4b3f-82c8-2ab1176b9381` y confirmar que los nuevos campos CRM principales aparecen aunque estén vacíos.
3. Pedir a la IA: “crea una pregunta de antigüedad en información general” y verificar que propone campo CRM principal, no sección.
4. Pedir a la IA: “crea una sección Financiamiento con campo EBITDA” y verificar que crea sección CRM + campo dentro.
5. Pedir a la IA una pregunta auxiliar solo formulario y verificar que no toca CRM.
6. Guardar formulario y reabrir para comprobar persistencia del chat y de las conexiones CRM.

## Archivos a modificar

- `supabase/functions/form-ai-builder/index.ts`
- `src/components/forms/FormWizardDialog.tsx`
- `src/components/forms/FormAIBuilderChat.tsx`
- `src/components/crm/CompanyProfile.tsx`
- posiblemente `src/lib/formAICatalog.ts`
- posiblemente tipos locales de formularios si se necesita reflejar `crm_main_custom` en UI

## Cambios de datos necesarios

No necesito cambiar el esquema de base de datos para esto.

Sí haré una corrección de datos existente para el formulario `Diagnóstico Inversión`, creando los `custom_fields` faltantes y conectando los `external_form_fields` huérfanos al CRM.

## Resultado esperado

- `Información General` deja de ser un agrupador visual “fantasma”.
- Sus preguntas quedan como campos CRM principales visibles en el perfil.
- Las secciones que la IA cree en adelante sí serán `custom_sections` reales del CRM.
- Los campos dentro de secciones sí aparecerán en las pestañas/secciones del perfil.
- Las preguntas solo formulario seguirán existiendo, pero estarán explícitamente marcadas y no se confundirán con CRM.
- EB queda garantizado: todo lo creado desde formularios con destino CRM aparece en el perfil al guardar.