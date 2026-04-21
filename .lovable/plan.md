

## Ajustes al editor de widgets

### 1. Blur del modal más sutil
En `src/components/ui/dialog.tsx` (o el override local del overlay del editor), bajar `backdrop-blur-md` → `backdrop-blur-sm` y reducir la opacidad del fondo a `bg-background/30`. Solo afecta al `DialogOverlay` del editor de widgets, no a otros diálogos críticos.

### 2. Visibilidad condicional entre campos
Nuevo bloque en el editor de widget: **"Mostrar solo si…"**
- Selector de campo de la misma sección (custom o nativo) → `conditionFieldKey`
- Operador: `is_set` / `is_empty` / `equals` / `not_equals`
- Valor (input/select según tipo) → `conditionValue`

**Persistencia**: se guarda dentro de `WidgetConfig.condition` (JSON dentro de la columna `config` ya existente — sin migración nueva).

```ts
config.condition = { fieldKey, sourceType, operator, value? }
```

**Render** (`SectionWidgetRenderer.tsx`): antes de renderizar, evaluar `condition` contra los valores actuales de la empresa. Si no se cumple → return null (independiente de `hideIfEmpty`).

**Ejemplo**: widget "Tipo de inversión" con `condition = { fieldKey: '<id Inversión>', operator: 'is_set' }` → solo aparece cuando hay valor en Inversión.

### 3. Conexión con secciones / campos / formularios
Validación del comportamiento actual + ajustes:

- **Crear sección nueva** (`TaxonomySettings` / `CustomFieldsContext`): aparece automáticamente en el dropdown de secciones del editor de widgets (ya conectado vía `useCustomFields`). ✔
- **Crear campo nuevo en una sección**: aparece como **widget virtual KPI sm** automáticamente en `WidgetsSettings` y en el perfil. Verificar en `WidgetsSettings.tsx` que el merge de `virtualWidgets + persistedWidgets` re-corra cuando cambia `fields`. Ajustar `useMemo` deps si es necesario.
- **Formularios externos** (`external_form_fields`): NO están conectados. Son un sistema aparte para captura pública. Confirmar al usuario que los widgets son solo para el perfil interno; los formularios siguen su propio flujo de `crm_field_id`. (Si quiere conexión, sería otro alcance).

### 4. Resize por arrastre + permitir disminuir
Reemplazar el botón cíclico actual por:

- **Botón shrink (←)** y **botón expand (→)** en cada widget — cada uno mueve un paso en `SIZE_ORDER` (`sm → md → lg → full`). Deshabilitados en los extremos.
- **Handle de resize lateral** (borde derecho del widget) que se arrastra horizontalmente: por cada ~`containerWidth/4` pixeles arrastrados, sube/baja un nivel de tamaño. Implementado con un `pointerdown` + listeners locales `pointermove`/`pointerup` sobre el contenedor del grid del canvas.

Esto da control bidireccional sin obligar al ciclo completo.

### 5. Drag-and-drop que no respeta el destino
Bug en el `onDragEnd` de `WidgetsSettings.tsx`: el `arrayMove` se calcula sobre el array completo de la sección pero el `sortable` context está mezclando virtuales + persistidos con IDs heterogéneos, así que al regresar un item al hueco original, el índice destino se recalcula contra una lista ya mutada localmente y "rebota".

**Fix**:
1. Usar **un solo array unificado** (virtual+persisted) como source-of-truth del SortableContext, indexado por un `displayOrder` calculado.
2. En `handleDragEnd`: 
   - Materializar virtuales tocados (insert en DB) **antes** de reordenar, para que todos tengan ID estable.
   - Calcular `arrayMove(items, oldIndex, newIndex)` sobre el array final.
   - Persistir `display_order` de **todos** los widgets de la sección con los nuevos índices vía `reorderWidgets`.
3. Forzar `setItems(newOrder)` localmente antes del fetch del context para que el preview no "rebote" mientras la red responde (optimistic update).

### Archivos a tocar
- `src/components/ui/dialog.tsx` — overlay blur (o override puntual en el editor)
- `src/types/widgets.ts` — añadir `condition` a `WidgetConfig`
- `src/components/admin/WidgetsSettings.tsx` — UI condicional, botones shrink/expand, handle de resize, fix drag-and-drop optimista
- `src/components/crm/SectionWidgetRenderer.tsx` — evaluar `condition` antes de render

### Sin migración nueva
Todo cabe en la columna `config jsonb` ya existente.

