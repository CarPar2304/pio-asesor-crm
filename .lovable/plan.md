

# Plan: Settings multi-feature, generador de definiciones, fixes de animaciones y timeout

## Resumen

Hay 6 problemas a resolver: (1) Settings solo muestra Company Fit, necesita selector de features, (2) falta subfeature para generar definiciones con IA, (3) taxonomy-organize se queda cargando (timeout), (4) animaciones de carga poco convincentes, (5) RUES muestra skeleton en todos los campos cuando solo debería mostrar indicador ligero, (6) falta configuración de campos RUES en settings.

---

## Cambios planificados

### 1. Settings con selector de features (`ProfilePage.tsx`)

Reemplazar el tab "Settings" que solo renderiza `<CompanyFitSettings />` por un sistema con sidebar/selector que permita elegir entre features:
- **Company Fit** (existente)
- **Taxonomía** (nuevo - configuración de la IA de organizar taxonomía)

Se usara un estado `activeFeature` con un listado lateral de features disponibles. Cada feature renderiza su componente de settings correspondiente.

### 2. Taxonomy Settings (`src/components/admin/TaxonomySettings.tsx`)

Nuevo componente con:
- **Modelo y parámetros**: selector de modelo OpenAI, esfuerzo de razonamiento, toggle web_search (igual que Company Fit pero guardado en `feature_settings` con key `taxonomy_organize`)
- **Prompt base**: editable, con variables `{taxonomyTree}`, `{definitions}`, etc.
- **Generador de definiciones con IA**: botón "Generar definiciones" que envía las verticales y sub-verticales actuales a una nueva Edge Function y muestra un preview para aprobación
- **Logs**: últimas ejecuciones de organización (si se implementa logging)
- **Edge Functions**: link a `taxonomy-organize`

### 3. Subfeature: Generar definiciones con IA

**Nueva Edge Function `taxonomy-definitions`**:
- Recibe la lista de categorías, verticales y sub-verticales
- Usa OpenAI para generar definiciones claras para cada término
- Retorna un objeto `{ definitions: string }` con las definiciones formateadas

**UI en TaxonomySettings**: 
- Botón "Generar definiciones con IA"
- Muestra preview en textarea
- Botón "Aprobar y guardar" que guarda en `feature_settings` key `taxonomy_definitions`

### 4. Fix timeout de taxonomy-organize

El Edge Function `taxonomy-organize` usa `client.responses.create()` con reasoning `high` lo cual puede tardar >60s y hacer timeout. Soluciones:
- Leer el modelo y reasoning_effort desde `feature_settings` key `taxonomy_organize` (actualmente hardcoded a `gpt-5.4` y `high`)
- Agregar timeout handling en el cliente con AbortController o un timeout más largo
- En el frontend, usar `setTimeout` más generoso y mostrar mensaje de "puede tardar hasta 2 minutos"
- Considerar usar un modelo más rápido por defecto (gpt-4.1-mini)

### 5. Animaciones mejoradas

**Company Fit - modo RUES**:
- Eliminar los skeleton loaders para RUES. Solo mostrar un spinner inline pequeño junto al botón o en el header
- Usar un estado separado `ruesLoading` vs `variablesLoading` en lugar del genérico `companyFitLoading`
- RUES es rápido, no necesita skeleton ni GooeyLoader

**Company Fit - modo Variables**:
- Mantener skeleton solo en los campos que se van a modificar: categoría, vertical, sub-vertical, descripción, logo
- NO mostrar skeleton en: nombre comercial, razón social, NIT, ciudad, contactos, métricas
- Mejorar el GooeyLoader con texto de etapas más descriptivo

**Taxonomy Organize**:
- Reemplazar el GooeyLoader estático por una animación con pasos progresivos más claros
- Agregar un indicador de tiempo transcurrido
- Mostrar mensaje "El modelo está razonando, esto puede tardar hasta 2 minutos" para modelos con reasoning alto

### 6. Configuración RUES en Settings

En `CompanyFitSettings.tsx`, dentro de la sección RUES, agregar:
- **Campos de búsqueda RUES**: configurar qué campos se envían (`nit`, `razon_social`, `nombre_comercial`) y en qué orden de prioridad
- **Campos de respuesta**: configurar qué campos extraer de RUES (`razon_social` → `legalName`, `nit` → `nit`, `cod_ciiu` → `economicActivity`)
- Guardar en el config de `company_fit` como `rues_search_fields` y `rues_response_mapping`

---

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/ProfilePage.tsx` | Selector de features en Settings tab |
| `src/components/admin/CompanyFitSettings.tsx` | Agregar config de campos RUES |
| `src/components/admin/TaxonomySettings.tsx` | **Nuevo** - Settings de taxonomía + generador de definiciones |
| `supabase/functions/taxonomy-definitions/index.ts` | **Nuevo** - Edge Function para generar definiciones |
| `supabase/functions/taxonomy-organize/index.ts` | Leer config dinámica (modelo, reasoning) |
| `src/components/crm/CompanyForm.tsx` | Separar estados RUES vs Variables, fix skeletons |
| `src/components/crm/TaxonomyOrganizeDialog.tsx` | Mejorar animación de carga, timer visible |

## Orden de implementación

1. Settings multi-feature + TaxonomySettings
2. Edge Function taxonomy-definitions + UI de generación
3. Fix timeout taxonomy-organize (config dinámica)
4. Fix animaciones Company Fit (RUES vs Variables)
5. Mejorar animación taxonomy organize
6. Config campos RUES en CompanyFitSettings

