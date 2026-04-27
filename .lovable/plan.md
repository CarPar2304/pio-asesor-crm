# Mejorar editor/creador de formularios — quitar Dialog

Hoy el editor (`FormWizardDialog`) vive en un `Dialog` de `max-w-3xl` con scroll interno. Es estrecho, los pasos largos (Constructor de campos, IA Builder, Precarga) se sienten apretados y obliga a hacer scroll constantemente. Lo vamos a transformar en una **vista de pantalla completa** integrada al layout de la app, manteniendo toda la lógica y datos actuales — solo cambia el contenedor y la organización visual.

## Qué cambia (UX)

1. **Adiós al Dialog** — el editor pasa a ser una vista a pantalla completa dentro del layout principal (mismo header/sidebar de la app), accesible desde `/formularios/nuevo` y `/formularios/:id/editar`.
2. **Header pegajoso (sticky)** con:
   - Botón "← Volver" a `/formularios`.
   - Título editable inline del formulario (nombre interno).
   - Badge de estado (Borrador / Activo / etc.).
   - Botón "Cancelar" + "Guardar" siempre visibles arriba a la derecha.
3. **Stepper horizontal** rediseñado: tarjetitas con número, título y check cuando el paso está completo. Permite saltar entre pasos haciendo clic.
4. **Layout de 2 columnas en pasos densos** (Constructor de campos, Precarga, Diseño):
   - Columna izquierda (≈ 30%): navegación de secciones/páginas + acciones rápidas (Nueva sección CRM, Nuevo campo CRM, Campo libre, atajos de campos).
   - Columna derecha (≈ 70%): editor del campo/sección seleccionado, con espacio cómodo.
   - En pasos simples (Información general, Identificación, Publicación) se usa una columna centrada de ancho cómodo (`max-w-3xl`).
5. **IA Builder** (chat) pasa a un panel lateral colapsable a la derecha (toggle "Asistente IA"), en vez de competir por espacio dentro del dialog.
6. **Footer pegajoso** con navegación Anterior / Siguiente y "Guardar".
7. Vista preview del formulario público abre en nueva pestaña como hoy.

Toda la **lógica interna** (estados, mutaciones, IA, secciones CRM, drag & drop, etc.) se preserva tal cual — solo se reordena el JSX.

## Cambios técnicos

- **Nueva ruta** en `src/App.tsx`: `/formularios/nuevo` y `/formularios/:id/editar` apuntando a una nueva página `FormEditorPage`.
- **Nuevo archivo**: `src/pages/FormEditorPage.tsx`
  - Carga `editingForm` por id desde Supabase si la URL trae `:id`.
  - Renderiza el nuevo componente `<FormEditor />` (sin Dialog).
  - Maneja navegación (`useNavigate`) para volver a `/formularios` al guardar/cancelar.
- **Refactor** `src/components/forms/FormWizardDialog.tsx` → renombrar a `src/components/forms/FormEditor.tsx`:
  - Eliminar `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`.
  - Cambiar la firma: `({ editingForm, onSaved, onClose })` sin `open`.
  - Envolver en un `<div className="min-h-screen flex flex-col">` con header sticky, stepper, contenido (grid 2-col en pasos densos), footer sticky.
  - Mover el panel de IA Builder a un `<aside>` lateral colapsable controlado por un toggle local (`showAI`).
  - Conservar todos los `useState`, `useEffect`, handlers, lógica de drag & drop, secciones CRM, etc.
- **`src/pages/FormsPage.tsx`**:
  - Quitar `<FormWizardDialog ... />` y los estados `wizardOpen`, `editingForm`.
  - Botón "Nuevo formulario" → `navigate('/formularios/nuevo')`.
  - Botón "Editar" en cada tarjeta → `navigate('/formularios/' + id + '/editar')`.
- Mantener `FormResponsesDialog` como dialog (es una vista de solo lectura corta, ahí el dialog sí funciona).

## Estructura visual del editor

```text
┌─────────────────────────────────────────────────────────────────┐
│  ← Volver  │  Diagnóstico Inversión [Borrador]   [Cancelar][Guardar] │  ← sticky
├─────────────────────────────────────────────────────────────────┤
│  ① General  ② Identificación  ③ Campos  ④ Precarga  ⑤ Diseño  ⑥ Publicar │
├─────────────────────────────────────────────────────────────────┤
│                                                       │ Asistente │
│   [contenido del paso, 2 columnas en pasos densos]    │   IA      │
│                                                       │ (toggle)  │
│                                                       │           │
├─────────────────────────────────────────────────────────────────┤
│  ← Anterior                              Siguiente →  │  Guardar  │  ← sticky
└─────────────────────────────────────────────────────────────────┘
```

## Fuera de alcance

- No se rediseña la lógica del paso "Constructor de campos" (se mantiene la misma UI de cards/drag&drop, solo dentro del nuevo layout 2-col).
- No se cambian los datos guardados ni los endpoints/tablas.
- `FormResponsesDialog` sigue siendo dialog.

## Archivos afectados

- ➕ `src/pages/FormEditorPage.tsx` (nuevo)
- ✏️ `src/components/forms/FormWizardDialog.tsx` → renombrar a `FormEditor.tsx` y refactorizar contenedor
- ✏️ `src/App.tsx` (nuevas rutas)
- ✏️ `src/pages/FormsPage.tsx` (navegación en lugar de abrir dialog)
