
The user is right — the form builder is treating CRM-mapped fields as plain text instead of mirroring how they behave in the CRM. In the CRM:
- **Categoría** (`category`) → fixed select (EBT/Startup from `CATEGORIES`)
- **Vertical** → dynamic select from `crm_verticals` table (taxonomy)
- **Sub-vertical** → dynamic select from `crm_sub_verticals` table (taxonomy)
- **Ciudad** (`city`) → select from `CITIES` constant
- **Custom fields tipo `select`** → already have options stored in the field definition

Currently in `FormWizardDialog.tsx`, when the admin picks a CRM column via `handleSelectCrmField`, the field is created with `field_type: 'short_text'` and empty `options: []`. So even though the public form might render a select, the **builder UI** (default value picker, field type) doesn't reflect it. And on the public side, `category`, `vertical`, `sub_vertical`, `city` aren't auto-populated with their canonical option lists either.

Let me verify the current state quickly.

I'll check the wizard's `handleSelectCrmField`, the CRM mapping list, and how the public page renders these fields, plus confirm taxonomy table structure.
<lov-tool-use id="toolu_vrtx_01Q37TBbRTg5taxDnwm6r4xf" name="code--search_files" integration-id="code" data="{\"query\": \"handleSelectCrmField|CRM_FIELD_MAPPINGS|crm_verticals|crm_sub_verticals\", \"include_patterns\": \"src/**/*.ts,src/**/*.tsx,supabase/functions/**/*.ts\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01Nhro8G6oWfDV2YiLz5kFym" name="code--view" integration-id="code" data="{\"file_path\": \"src/components/forms/FormWizardDialog.tsx\", \"lines\": \"1,80\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_013JwX1SyiLdBi8t54EeHM68" name="code--search_files" integration-id="code" data="{\"query\": \"handleSelectCrmField|CRM_FIELD_MAPPINGS\", \"include_patterns\": \"src/**/*.tsx,src/**/*.ts,supabase/functions/**/*.ts\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_011UAyio5QmeSmmCqTRxnyDD" name="code--search_files" integration-id="code" data="{\"query\": \"crm_verticals|crm_sub_verticals|crm_categories\", \"include_patterns\": \"src/**/*.tsx,src/**/*.ts\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_016K1qyUbRY6Fh2U9M8Vu9pK" name="code--view" integration-id="code" data="{\"file_path\": \"src/components/forms/FormWizardDialog.tsx\", \"lines\": \"220-330\"}">
</lov-tool-use>
Now I have enough context. Let me check how PublicFormPage renders these fields and how CompanyForm renders Vertical/SubVertical/Category in the CRM.
<lov-tool-use id="toolu_vrtx_016EWde3WynNZ3AXqwBJVY5t" name="code--search_files" integration-id="code" data="{\"include_patterns\": \"src/pages/PublicFormPage.tsx,src/components/crm/CompanyForm.tsx\", \"query\": \"vertical|sub_vertical|category|economic_activity\"}">
</lov-tool-use>
I have enough understanding. Let me check PublicFormPage rendering for these field types.
<lov-tool-use id="toolu_vrtx_0181pEBdJvNnekyPp4REDrVH" name="code--search_files" integration-id="code" data="{\"include_patterns\": \"src/pages/PublicFormPage.tsx\", \"query\": \"field_type|options|Select\"}">
</lov-tool-use>
I have enough. Now let me design the plan.

<lov-plan>
## Problem

El constructor de formularios no respeta la naturaleza de los campos del CRM:
- `vertical`, `economic_activity` (sub-vertical) y `category` se crean como **texto plano** en `addCrmField()` (FormWizardDialog.tsx ~L246-267), aunque en el CRM real (`CompanyForm.tsx`) son **listas desplegables** alimentadas desde la taxonomía dinámica (`crm_verticals`, `crm_sub_verticals`, `crm_categories`) con relaciones jerárquicas (categoría → vertical → sub-vertical).
- Además **falta** el mapeo de `economic_activity` (sub-vertical) en `CRM_FIELD_MAPPINGS` (`externalForms.ts` L42-58) — por eso "no sale tampoco sub vertical".
- Las opciones nunca se cargan dinámicamente desde la taxonomía; quedan como `options: []`.
- En el formulario público no hay lógica jerárquica que filtre sub-verticales según vertical seleccionada.

## Fix Plan

### 1. `src/types/externalForms.ts`
- Agregar `{ table: 'companies', column: 'economic_activity', label: 'Sub-vertical' }` a `CRM_FIELD_MAPPINGS`.

### 2. `src/components/forms/FormWizardDialog.tsx`
- En `addCrmField()`: detectar columnas taxonómicas y crear campos `select` con opciones reales:
  - `category` → `field_type: 'select'`, `options: taxonomy.allCategories.map(c => c.name)`.
  - `vertical` → `field_type: 'select'`, `options: taxonomy.verticals.map(v => v.name)`.
  - `economic_activity` → `field_type: 'select'`, `options: taxonomy.subVerticals.map(sv => sv.name)`.
- Usar el contexto `useTaxonomy()` (ya disponible) para poblar.
- En la UI de edición de campo: si `crm_column` ∈ {category, vertical, economic_activity}, mostrar nota "Opciones sincronizadas desde la taxonomía del CRM" y deshabilitar edición manual de opciones (se refrescan al cargar).
- Al guardar, persistir estas `options` en `external_form_fields.options` (snapshot) — así el formulario público las recibe sin cambios de backend.

### 3. `src/pages/PublicFormPage.tsx` (jerarquía dinámica)
- Detectar trío de campos por `crm_column` (`category`, `vertical`, `economic_activity`) presentes en el form.
- Cuando el usuario cambia `category` → filtrar opciones de `vertical` mostradas (usando metadata enviada por backend) y limpiar `vertical`/`economic_activity` si quedan inválidos.
- Cuando cambia `vertical` → filtrar `economic_activity` similarmente.

### 4. `supabase/functions/form-verify/index.ts` (`load-form` action)
- Adjuntar al payload un objeto `taxonomy` con: `categories[]`, `verticals[]` (con `category_links`), `sub_verticals[]` (con `vertical_links`) — leyendo `crm_categories`, `crm_verticals`, `crm_category_verticals`, `crm_sub_verticals`, `crm_vertical_sub_verticals`.
- El frontend público lo usa para filtrado jerárquico (paso 3).

### 5. Refresco automático de opciones
- En `load-form`: para campos cuya `crm_column` sea category/vertical/economic_activity, **sobrescribir** `options` con la lista actual de la taxonomía (no usar el snapshot guardado), garantizando que cambios en el CRM se reflejen sin reeditar el form.

## Out of scope
- No se modifican otros campos no taxonómicos.
- No se crea migración (no hay cambios de schema).
- No se toca la lógica de autoguardado del CRM ya verificada.

## Diagrama de flujo (jerarquía pública)

```text
[Categoría select] --change--> filter [Vertical options] --change--> filter [Sub-vertical options]
       |                              |                                       |
       └─ source: taxonomy.categories └─ filtered by category_vertical_links  └─ filtered by vertical_subvertical_links
```
