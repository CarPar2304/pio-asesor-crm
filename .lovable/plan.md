

## Rediseño del sistema de widgets del perfil

### Concepto central
Cada **campo** de cada sección se vuelve automáticamente un **widget**. El usuario no añade widgets desde cero: configura cómo se ve cada campo (tipo de visualización, tamaño, posición). Además puede crear widgets compuestos que combinen varias variables.

### 1. Auto-generación de widgets desde campos existentes

- Al abrir "Visualizaciones" en `/perfil`, el sistema lista **todos los campos de la sección** (custom + nativos) como widgets virtuales con configuración por defecto (KPI tamaño `sm`).
- Al editar uno por primera vez, se persiste en `section_widgets` con su `source_key` apuntando al campo. Mientras no se persista, el render del perfil usa el default.
- Esto elimina la duplicación: ya no se ve el campo "crudo" *y* el widget. Si la sección tiene widgets configurados, se renderizan **solo los widgets** (que incluyen los campos por defecto en formato KPI).

### 2. Ocultar widgets sin datos

- Cada widget tiene un nuevo flag `hideIfEmpty` (default `true`).
- En el render: si la fuente no tiene valor (null, "", `{}` para metric_by_year), el widget no se muestra.
- En el editor de widget aparece un toggle "Ocultar si no hay datos".

### 3. Widgets multi-variable (sumar/comparar variables)

- Nuevo campo `sources: Array<{ sourceType, sourceKey, label?, color? }>` en `section_widgets` (jsonb). El `sourceKey` legacy se mantiene como retrocompatibilidad pero el editor ya escribe `sources`.
- En el editor: botón "+ Añadir variable" para agregar más fuentes (máx. 5).
- Render por tipo de visualización:
  - **KPI**: si hay >1 fuente, suma los valores (configurable: `sum` / `avg`) y muestra una sub-línea con el desglose.
  - **Bar / Line**: cada variable es una serie distinta (multi-bar agrupada o multi-line). Eje X = años combinados.
  - **Pie**: cada variable es un slice (último valor o suma según `calculation`).
  - **Table**: columnas = variables, filas = años.

### 4. Maquetador drag-and-drop con preview en vivo

Reemplaza la lista vertical actual por un **canvas tipo grid** que es a la vez editor y preview:

```text
┌─────────────────────────────────────────────┐
│  [Sección: Financiamiento ▼] [+ Widget]    │
├─────────────────────────────────────────────┤
│  ┌──────┐ ┌──────┐ ┌────────────────────┐  │
│  │ KPI  │ │ KPI  │ │   Bar chart        │  │
│  │ sm   │ │ sm   │ │   md               │  │
│  └──────┘ └──────┘ └────────────────────┘  │
│  ┌────────────────────────────────────────┐ │
│  │       Line chart  full                 │ │
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

- Grid CSS de 4 columnas, mismas reglas de tamaño (`sm`=1, `md`=2, `lg`=3, `full`=4) que el render real → **WYSIWYG exacto**.
- Drag-and-drop con `@dnd-kit/core` + `@dnd-kit/sortable` (ya disponible vía dependencias estándar; si no, se instala).
- Cada widget en el canvas se puede:
  - Arrastrar para reordenar
  - Click para editar (abre panel lateral con la config)
  - Botón redimensionar (cicla sm → md → lg → full)
  - Botón eliminar
- El canvas escala el ancho del contenedor para que el preview se vea como en el perfil real.

### 5. Cambios en el render del perfil (`CompanyProfile.tsx`)

- Si la sección tiene widgets: renderizar solo widgets (no la lista cruda de campos).
- Si no tiene widgets configurados: renderizar todos los campos como widgets KPI auto-generados con tamaño `sm`.
- Filtrar widgets vacíos cuando `hideIfEmpty=true`.

### Detalles técnicos

**Migración DB**: añadir columnas a `section_widgets`:
- `sources jsonb default '[]'` — array de fuentes para multi-variable
- `hide_if_empty boolean default true`

Mantener `source_type` y `source_key` para retrocompat; al guardar desde el nuevo editor, se escriben ambos (`sources[0]` espejado).

**Archivos a modificar**:
- `src/types/widgets.ts` — agregar `WidgetSource`, `sources`, `hideIfEmpty`
- `src/contexts/WidgetsContext.tsx` — mapear nuevos campos
- `src/components/admin/WidgetsSettings.tsx` — reescribir como maquetador drag-drop con preview
- `src/components/crm/SectionWidgetRenderer.tsx` — soporte multi-source, hide-if-empty, multi-series charts
- `src/components/crm/CompanyProfile.tsx` — auto-generar widgets virtuales cuando no hay configurados; ocultar campos crudos cuando sí hay

**Nueva dependencia**: `@dnd-kit/core` y `@dnd-kit/sortable` (si no están, instalar).

**Migración**: nueva migración SQL para las dos columnas.

