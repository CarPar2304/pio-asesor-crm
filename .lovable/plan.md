

## Sileo -- Biblioteca de Toast Notifications para React

**Sileo** es una biblioteca de notificaciones toast con animaciones SVG morphing y spring physics. Reemplazaría las dos librerías de toast actuales (sonner + radix toast) con una sola, más moderna visualmente.

### Estado actual del proyecto

El proyecto usa **dos sistemas de toast en paralelo**:
1. **Sonner** (`sonner`) -- usado en `BulkUploadDialog.tsx` con `toast.error()` / `toast.success()`
2. **Radix Toast** (`@radix-ui/react-toast`) -- usado via `useToast()` hook, montado con `<Toaster />` en `App.tsx`

Ambos `<Toaster />` y `<Sonner />` están montados en `App.tsx`.

### Uso actual (bajo)

Solo hay **un archivo** que realmente invoca toasts: `BulkUploadDialog.tsx` (usa `sonner` directamente con `toast.error()`). El resto es infraestructura sin uso activo.

### Plan de implementación

**1. Instalar Sileo**
```
npm install sileo
```

**2. Reemplazar ambos Toasters en `App.tsx`**
- Quitar `<Toaster />` (radix) y `<Sonner />` (sonner)
- Agregar `<Toaster />` de Sileo con posición `bottom-right`

```tsx
import { Toaster } from "sileo";
// Remove old toaster imports
```

**3. Migrar `BulkUploadDialog.tsx`**
- Cambiar `import { toast } from 'sonner'` por `import { sileo } from 'sileo'`
- Reemplazar `toast.error('msg')` con `sileo.error({ title: 'msg' })`
- Reemplazar `toast.success('msg')` con `sileo.success({ title: 'msg' })`

**4. Crear helper wrapper (opcional)**
- Crear `src/lib/toast.ts` que exporte funciones simples (`showSuccess`, `showError`, etc.) usando `sileo` internamente, para facilitar uso futuro en toda la app

**5. Limpiar dependencias antiguas**
- Los archivos `src/components/ui/sonner.tsx`, `src/components/ui/toaster.tsx`, `src/components/ui/toast.tsx`, `src/hooks/use-toast.ts`, `src/components/ui/use-toast.ts` pueden eliminarse
- Desinstalar `sonner` y `@radix-ui/react-toast` del `package.json`

### API de Sileo (referencia)

```tsx
import { sileo } from "sileo";

sileo.success({ title: "Guardado", description: "Empresa creada" });
sileo.error({ title: "Error", description: "No se pudo guardar" });
sileo.warning({ title: "Advertencia" });
sileo.info({ title: "Info" });
sileo.promise(asyncFn(), {
  loading: { title: "Cargando..." },
  success: { title: "Listo" },
  error: { title: "Error" },
});
```

### Impacto

- Cambio de bajo riesgo (solo 1 archivo usa toasts activamente)
- Mejora visual significativa con las animaciones SVG morphing
- Simplifica de 2 sistemas de toast a 1
- Elimina 5 archivos de infraestructura innecesaria

