

## Plan: Integrar ExpandableTabs en el dashboard del CRM

### Análisis

Revisé las páginas principales y encontré dos ubicaciones estratégicas donde los ExpandableTabs mejoran la UX:

1. **Barra de acciones del dashboard (Index.tsx)** — Reemplazar los botones de acción (toggle grid/tabla, carga masiva, nueva empresa) por un ExpandableTabs que agrupa las acciones de forma compacta y animada. Los iconos se expanden al hacer clic mostrando el texto.

2. **Footer de CompanyCard** — Reemplazar los botones de acción rápida (Registrar acción, Crear tarea, Registrar hito) por un ExpandableTabs compacto que ahorra espacio y da una interacción más elegante.

### Cambios

#### 1. Crear `src/components/ui/expandable-tabs.tsx`
- Copiar el componente proporcionado adaptándolo al proyecto.
- Instalar dependencia `usehooks-ts` (framer-motion y lucide-react ya están instaladas).

#### 2. Modificar `src/pages/Index.tsx`
- Reemplazar el grupo de botones de acción (grid/tabla toggle + carga masiva + nueva empresa) por un `ExpandableTabs` con los items:
  - `LayoutGrid` — "Cuadrícula"
  - `List` — "Tabla"  
  - Separador
  - `FileSpreadsheet` — "Carga masiva"
  - `Plus` — "Nueva empresa"
- Conectar `onChange` para ejecutar las acciones correspondientes (cambiar vista, abrir dialogs).

#### 3. Modificar `src/components/crm/CompanyCard.tsx`
- Reemplazar los 3 botones de acción rápida en el footer (`Phone`, `CheckSquare`, `Flag`) por un `ExpandableTabs` compacto con:
  - `Phone` — "Acción"
  - `CheckSquare` — "Tarea"
  - `Flag` — "Hito"
- Mantener el botón de eliminar separado.
- Conectar `onChange` para disparar `onQuickAction`.

### Dependencias
- Instalar `usehooks-ts` via npm.

