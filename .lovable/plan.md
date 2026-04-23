

## Plan: Mejorar el módulo de "Toques"

### 1. Renombrar "Acción" → "Toques" con ícono nuevo

**`src/components/crm/CompanyProfile.tsx`**
- Reemplazar el ícono `Phone` por `MousePointerClick` (ícono tipo "botón/clic" de lucide-react) en el botón del header.
- Cambiar el texto del botón a `Toques`.

**`src/components/crm/CompanyTimeline.tsx`** y **`src/components/crm/ActivityTimeline.tsx`**
- Cambiar el label de la entrada `action` en `EVENT_CONFIG` a `Toque`.
- Cambiar el ícono `Phone` → `MousePointerClick` para los eventos `action`.
- En las pestañas/labels de actividad, "Acciones" → "Toques".

**`src/components/crm/QuickActionDialog.tsx`**
- Título del diálogo: `Registrar acción` → `Registrar toque`.
- Toast: "Acción registrada" → "Toque registrado".

### 2. Especificar texto libre cuando se selecciona "Otro"

**`src/components/crm/QuickActionDialog.tsx`**
- Cuando `actionType === 'other'`, mostrar un input nuevo `Especificar tipo de toque` (obligatorio).
- Guardar ese texto al inicio del campo `description` o `notes` para que el timeline lo muestre. Propuesta: anteponerlo a `description` con formato `Otro (texto especificado): descripción...`.
- Validar que no se pueda guardar sin completarlo.

### 3. Más opciones en tipos de toque

**`src/types/crm.ts`**
- Ampliar `ActionType` y `ACTION_TYPE_LABELS` con nuevas opciones útiles:
  - `whatsapp` → "WhatsApp"
  - `visit` → "Visita presencial"
  - `event` → "Evento / Networking"
  - `linkedin` → "LinkedIn / Redes"
  - `proposal` → "Propuesta enviada"
  - `follow_up` → "Seguimiento"
- Mantener las existentes (`call`, `meeting`, `email`, `mentoring`, `diagnostic`, `routing`, `other`).
- Como la columna `company_actions.type` es `text` libre en DB, no requiere migración.

### 4. Timeline ordenado por fecha del toque (no por fecha de creación)

Hoy `company_history.created_at` se llena con `now()`, lo que ignora la fecha real del toque. Solución: agregar columna opcional `event_date` para representar la fecha "de negocio" del evento.

**Migración SQL**
```sql
ALTER TABLE public.company_history
  ADD COLUMN event_date timestamptz;
CREATE INDEX idx_company_history_event_date
  ON public.company_history(company_id, event_date DESC);
```

**`src/lib/historyHelper.ts`**
- Añadir parámetro opcional `eventDate?: string` a `logHistory`. Si se pasa, insertar también `event_date`.
- En `HistoryEvent` exponer `eventDate: string | null` y devolver `event_date` desde el fetch.
- Cambiar el `order` del fetch para usar `coalesce(event_date, created_at)` mediante una query que ordene por ambos (orden por `event_date NULLS LAST` y luego `created_at`).

**`src/contexts/CRMContext.tsx`**
- En `addAction`, `addMilestone` y `addTask` pasar la fecha respectiva (`action.date`, `milestone.date`, `task.dueDate`) como `eventDate` en `logHistory`.

**`src/components/crm/CompanyTimeline.tsx`**
- Usar `ev.eventDate || ev.createdAt` como fecha mostrada y como base para ordenamiento y para los `monthOptions`.

### 5. Filtro por rango de fechas en el Timeline

**`src/components/crm/CompanyTimeline.tsx`**
- Añadir junto al selector "Ir a mes…" dos popovers con `Calendar` (shadcn): `Desde` y `Hasta`.
- Filtrar `events` por la fecha efectiva (`eventDate || createdAt`) antes del render.
- Botón pequeño `Limpiar` para resetear el rango.
- Si el rango está vacío de eventos, mostrar mensaje "Sin eventos en el rango seleccionado".

### Resumen de archivos
- **Migración**: agregar `event_date` a `company_history`.
- **Editar**: `src/types/crm.ts`, `src/lib/historyHelper.ts`, `src/contexts/CRMContext.tsx`, `src/components/crm/QuickActionDialog.tsx`, `src/components/crm/CompanyProfile.tsx`, `src/components/crm/CompanyTimeline.tsx`, `src/components/crm/ActivityTimeline.tsx`.

