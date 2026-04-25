## Diagnóstico (verificado contra DB)

Confirmé en la base de datos del formulario "Diagnóstico Inversión":
- Solo existen 2 `custom_sections` reales en el CRM: **Mercado** y **Financiamiento / Inversión**.
- "Información general" e "Información financiera" aparecen únicamente en `external_form_fields.section_name` de varios campos del formulario, **pero nunca se crearon en `custom_sections`**.
- Los campos "Hitos alcanzados", "Principales clientes", "Número de socios", "Antigüedad", "Utilidad operacional último año" tienen `crm_table = NULL` → son campos huérfanos solo de formulario.

**Causa raíz**: la IA, al añadir un campo, escribió un `section_name` libre (texto) que el wizard renderiza como agrupador, pero NUNCA llamó a `propose_new_section` (porque la herramienta requiere aprobación humana y la IA prefirió el atajo de poner texto). El usuario nunca aprobó nada porque ni siquiera vio una propuesta.

Además: cuando un campo del formulario va a una "sección" del CRM, hoy no se respeta esa relación al guardar — el `section_name` del campo es independiente del `custom_field.section_id` del CRM.

---

## Nueva lógica de negocio (modelo mental único)

Eje canónico para clasificar TODO lo que produce la IA:

| Origen | Dónde vive el dato | Aprobación |
|---|---|---|
| **Campo CRM existente** (companies.* / contacts.* / custom_*) | En su tabla CRM nativa | Auto |
| **Sección nueva** | SIEMPRE en `custom_sections` del CRM (no existe sección "solo formulario") | Requiere aprobación |
| **Campo nuevo dentro de sección CRM** | `custom_fields` enlazado a la sección + `external_form_fields.crm_field_id` | Requiere aprobación |
| **Campo libre solo formulario** | Solo `external_form_fields` con `crm_table = NULL` | Auto (no necesita aprobación, es solo respuesta del form) |
| **Campo condicional** | Igual que arriba + `condition_field_key` y `condition_value` | Igual al campo base |

Reglas duras:
1. **Las secciones SIEMPRE son del CRM.** Eliminamos el flag `create_in_crm` — ya no existe la opción "agrupador visual sin CRM". Si la IA propone "Información General", al aceptar se crea en `custom_sections` y se enlaza el `section_name` del formulario al `id` real.
2. **Los campos libres NO requieren aprobación.** Si la IA quiere añadir un campo nuevo que solo vive en respuestas del formulario, se aplica directo (auto-change). Solo requiere aprobación cuando va al CRM.
3. **Si se quiere que un campo nuevo viva en el CRM**, debe declarar `target_crm_section` (id de sección existente o nombre de sección que también va a proponerse en el mismo turno). Aprobación una vez por turno cubre la sección + sus campos hijos.
4. **Después de aceptar**, el `section_name` del `external_form_field` siempre se sincroniza al nombre real de la sección CRM creada, y el campo nuevo CRM queda con `display_order` correcto dentro de su sección para verse en `CompanyProfile` (esto ya está implementado en `addCustomField` → solo hay que asegurar el refresh del `CustomFieldsContext` antes de que el wizard intente leer la sección por nombre).

---

## Cambios concretos por archivo

### Bloque 1 — Edge function `supabase/functions/form-ai-builder/index.ts`

**1.1 Catálogo enriquecido enviado a la IA**: además del `crmCatalog` actual, pasar:
- Lista de `existingSections` con `{id, name}` (las del CRM).
- Lista de `formSectionGroups` (agrupadores `section_name` ya usados en el form actual).
- Para cada campo actual del formulario, incluir `id_in_form`, `belongs_to_crm_section` (resuelto por crm_field_id → custom_field.section_id → sección nombre), `is_form_only` (true si crm_table=null).

**1.2 Reemplazar tools**:
- `propose_new_section({ name, reason })` → SIEMPRE crea en CRM. Quitar `create_in_crm`.
- `propose_new_crm_field({ label, field_type, options, target_section_name, is_required, help_text, reason })` → REQUIERE aprobación. Crea `custom_field` + lo añade al formulario.
- `add_form_only_field({ label, field_type, options, group_name?, is_required, help_text, condition_field_key?, condition_value? })` → AUTO. No requiere aprobación. `group_name` es texto libre solo para agrupar en el form (NO crea sección CRM).
- `delete_field({ field_key })` → NUEVA. Borra un campo del formulario. Aprobación si `crm_field_id != null` (no se borra del CRM, solo se quita del form). Auto si es form-only.
- `delete_form_section_group({ group_name })` → NUEVA. Quita el `section_name` de todos los campos del form que lo usan (no toca CRM).
- `move_field_to_crm_section({ field_key, target_section_name })` → NUEVA. Si el campo es form-only, lo convierte en `custom_field` dentro de la sección CRM destino (REQUIERE aprobación). Si es CRM, solo cambia su `section_id`.
- `move_field_out_of_crm({ field_key })` → NUEVA. Solo aplica si el campo es custom_field nuestro (no nativo de companies/contacts). Lo desvincula del CRM y lo deja como form-only. Aprobación.
- Mantener: `add_existing_crm_field`, `update_field`, `move_field`, `reorder_fields`, `add_page`, `update_page`, `set_form_meta`.

**1.3 Prompt sistema reescrito** con la matriz de decisión arriba, ejemplos concretos:
- "Si te piden 'agrega NIT y razón social' → `add_existing_crm_field` para cada uno (no propongas nada)."
- "Si te piden 'añade una sección Información General con número de empleados y antigüedad' → `propose_new_section('Información General')` + `propose_new_crm_field(label='Número de empleados', target_section_name='Información General', ...)` × 2. Todo en el mismo turno."
- "Si te piden 'pregunta opcional: ¿cómo te enteraste?' (claramente metadato del form) → `add_form_only_field(...)`. NO propongas sección."
- "Si te piden 'mueve antigüedad antes de número de empleados' → `move_field`."
- "Si te piden 'pasa antigüedad al CRM' → `move_field_to_crm_section`."

**1.4 Sanitización servidor**:
- Si la IA llama `add_existing_crm_field` con `field_key` que no existe → convertir en `propose_new_crm_field` (no en `propose_new_free_field` como ahora) si la intención semántica era CRM (ej. su `field_key` empieza por `companies_` o `contacts_`); en otro caso convertir en `add_form_only_field` auto.
- Si la IA llama `propose_new_crm_field` con `target_section_name` que no existe Y no hay un `propose_new_section` con ese nombre en el mismo turno → bloquear y devolver mensaje "para crear este campo en el CRM, primero propón la sección X".

### Bloque 2 — `src/components/forms/FormWizardDialog.tsx`

**2.1 Reescribir `acceptProposal`** para los nuevos tipos de propuesta. Manejar el orden: primero `propose_new_section`, luego refrescar el contexto (`useCustomFields().refresh()` ya existe), después procesar los `propose_new_crm_field` que dependen de esa sección.

**2.2 `handleAutoChanges`** debe procesar también: `add_form_only_field`, `delete_field` (cuando es form-only), `delete_form_section_group`, `move_field_to_crm_section` (cuando ya es CRM y solo cambia section_id), `move_field_out_of_crm` no es auto.

**2.3 Sincronización campo↔sección al guardar**: en `handleSave`, para cada `formField` con `crm_field_id != null`, leer la sección real del custom_field y forzar `section_name = customSections.find(s => s.id === customField.sectionId)?.name`. Esto garantiza que la EB del usuario se cumpla: si el campo vive en una sección CRM, el formulario refleja ese nombre exacto, y la sección aparece en el perfil.

**2.4 Construcción del `currentFields` enviado a la IA**: enriquecer con `belongs_to_crm_section` y `is_form_only` para que la IA tenga contexto preciso.

**2.5 Banner explicativo del paso 2** del wizard: actualizar texto para reflejar la nueva regla "secciones siempre en CRM, campos libres no".

### Bloque 3 — `src/components/forms/FormAIBuilderChat.tsx`

**3.1 Cards de propuesta** ya están prominentes; ajustar copy:
- `propose_new_section` → "📁 Nueva sección **«X»** en el CRM. Aparecerá como pestaña en el perfil de cada empresa."
- `propose_new_crm_field` → "➕ Nuevo campo CRM **«Y»** dentro de la sección **«X»**. Quedará visible en el perfil."
- `move_field_to_crm_section` → "↗ Mover **«Y»** del formulario al CRM (sección **«X»**)."
- `move_field_out_of_crm` → "↙ Quitar **«Y»** del CRM (queda solo en el formulario)."
- `delete_field` (cuando es CRM) → "🗑 Quitar **«Y»** del formulario (no se borra del CRM)."

**3.2 Para auto-changes** que la IA ejecutó sin aprobación, mostrar un mini-resumen colapsable bajo la respuesta: "✓ Apliqué: añadí 3 campos del CRM, 1 campo libre, reordené 2 campos." Esto da visibilidad sin fricción.

**3.3 Persistencia del chat**: ya está en `localStorage`. Solo migrar al storageKey nuevo y guardar también las propuestas resueltas (para que al reabrir el wizard se vea el historial completo con el estado de aceptado/rechazado, no solo los textos).

### Bloque 4 — Integración con CRM (perfil de empresa)

**4.1 Verificar refresh**: tras `addSection` y `addCustomField` desde el wizard, el `CustomFieldsContext` ya hace `fetchAll()`. Pero si el usuario tiene `CompanyProfile` abierto en otra pestaña/ventana, no se entera. Acción mínima: forzar `refresh()` de `useCustomFields` también dentro de `acceptProposal` antes de retornar, para garantizar que cuando el usuario cierre el wizard y entre al perfil, el contexto ya tiene los datos. (Hoy esto ya pasa porque `fetchAll` corre dentro de `addSection`/`addField`. Verificar con un `console.log` que no haya race condition.)

**4.2 Mini-link "Ver en CRM"**: en el listado de campos del paso 2, si un campo tiene `crm_field_id` o `crm_table`, mostrar enlace pequeño "Ver en CRM →" que navega a `/empresa/<demoId>` o abre el `CRMSettingsDialog` con la sección preseleccionada (no bloqueante, mejora visual).

### Bloque 5 — Borrado / movimiento desde la UI manual

Hoy en el wizard se pueden borrar campos manualmente, pero no eliminar agrupadores ni mover campos a/desde CRM. Añadir en la UI del paso 2:
- En cada campo CRM custom, botón "Mover a otra sección CRM" (selector con `customSections`).
- En cada campo form-only, botón "Promover al CRM" (abre selector de sección existente o "Nueva sección…").
- En el header de cada `section_name` (agrupador), si NO existe en `custom_sections`, botón "Convertir en sección del CRM".

Esto hace que la IA no sea el único camino — el usuario también puede hacer todo manualmente, y la IA solo usa las mismas operaciones.

### Bloque 6 — Migración de datos existentes (opcional pero recomendable)

El form "Diagnóstico Inversión" ya tiene `section_name` huérfanos ("Información general", "Información financiera"). Al abrir el wizard, mostrar un banner: "Detectamos 2 agrupadores que no existen en el CRM: «Información general», «Información financiera». ¿Quieres convertirlos en secciones del CRM?" → un click crea ambas secciones, mueve los campos custom asociados a esas secciones, y los campos form-only quedan opcionalmente con la opción de promoverlos.

No hay migración de schema necesaria.

---

## Archivos a editar

| Archivo | Cambio |
|---|---|
| `supabase/functions/form-ai-builder/index.ts` | Tools nuevas (delete, move, form-only auto), prompt reescrito, sanitización por intención |
| `src/components/forms/FormWizardDialog.tsx` | `acceptProposal` reescrito, `handleAutoChanges` extendido, sincronización section_name↔CRM al guardar, contexto enriquecido para IA, botones manuales mover/promover, banner de huérfanos |
| `src/components/forms/FormAIBuilderChat.tsx` | Copy nuevo de cards, resumen colapsable de auto-changes, persistencia de propuestas resueltas |
| `src/lib/formAICatalog.ts` | Exportar también helpers para construir `existingSections` y `formContext` enriquecidos |

Sin migración de DB.

---

## Resultado esperado

- Pides "crea sección Información General con campos X, Y, Z" → la IA propone 1 sección + 3 campos. Aceptas (1 click). La sección aparece como pestaña en el perfil de TODAS las empresas, los 3 campos aparecen ordenados dentro de esa pestaña, y también en el formulario público. Cumple EB.
- Pides "agrega un campo opcional: ¿cómo te enteraste?" → la IA lo añade automáticamente como form-only. No molesta con aprobaciones. No aparece en el CRM.
- Pides "mueve antigüedad al CRM" → propuesta única, aceptas, el campo se vuelve `custom_field` y queda en la sección elegida.
- Pides "elimina principales clientes" → si es form-only, lo borra directo. Si es CRM, te pregunta si quieres quitarlo del form (no del CRM).
- El historial del chat persiste con sus propuestas y estados.
