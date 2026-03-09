

## Problemas identificados

1. **Tipeo de una sola letra:** Los componentes `Section` y `Field` estan definidos dentro del cuerpo de `CompanyForm`. Cada cambio de estado los recrea, lo que causa que React desmonte y vuelva a montar los inputs, perdiendo el foco tras cada tecla.

2. **Bordes poco definidos:** Los inputs usan la variable `--input: 230 14% 90%` que es demasiado sutil contra el fondo claro.

3. **Modal estrecho:** Actualmente usa `max-w-2xl` (672px).

---

## Plan de cambios

### 1. Mover `Section` y `Field` fuera del componente (CompanyForm.tsx)

Extraer las definiciones de `Section` y `Field` fuera de la funcion `CompanyForm` para que no se recreen en cada render. Esto resuelve por completo el problema de tipeo.

### 2. Mejorar bordes de inputs (index.css)

Oscurecer la variable `--input` en el tema claro para que los bordes sean mas visibles:
- Cambiar de `230 14% 90%` a `230 14% 82%` (mas contraste)
- Tambien ajustar `--border` de `230 14% 90%` a `230 14% 85%`

### 3. Ampliar el modal (CompanyForm.tsx)

Cambiar la clase del `DialogContent` de `max-w-2xl` a `max-w-3xl` (768px) para dar mas espacio al formulario.

---

## Archivos a modificar

- `src/components/crm/CompanyForm.tsx` — Extraer componentes y ampliar modal
- `src/index.css` — Ajustar variables de borde

