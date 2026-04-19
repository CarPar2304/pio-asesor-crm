
## Diagnóstico

El formulario público sólo renderiza el `SearchableCombobox` cuando `field.field_type === 'select'` (PublicFormPage L598). El edge function `form-verify` ya refresca `options` desde la taxonomía pero **no refresca `field_type`** — entonces los campos Categoría/Vertical/Ciudad creados antes del fix (o no recreados) siguen como `short_text` en la base y se renderizan como input de texto.

Sub-vertical sí funciona porque probablemente fue agregada después del fix, o por casualidad ya tenía `field_type='select'`.

## Fix

### `supabase/functions/form-verify/index.ts` — `refreshTaxonomyOptions`
Forzar también el `field_type` para columnas taxonómicas/CRM-driven:

```ts
const refreshTaxonomyOptions = (fields, taxonomy) => {
  for (const f of fields) {
    if (f.crm_table !== "companies") continue;
    if (["category","vertical","economic_activity","city"].includes(f.crm_column)) {
      f.field_type = "select";  // ← override legacy short_text
    }
    if (f.crm_column === "category") f.options = taxonomy.categories;
    else if (f.crm_column === "vertical") f.options = taxonomy.verticals.map(v => v.name);
    else if (f.crm_column === "economic_activity") f.options = taxonomy.subVerticals.map(sv => sv.name);
    else if (f.crm_column === "city") f.options = taxonomy.cities;
  }
};
```

Aplicar igualmente en ambas ramas (`load-form` y la rama de submit/verify que también lee fields).

### `src/pages/PublicFormPage.tsx` — render fallback robusto
Por si llegan fields no normalizados (cache antiguo), envolver el bloque de render: si `crm_table === 'companies'` y `crm_column` ∈ {category, vertical, economic_activity, city}, forzar render de `SearchableCombobox` aunque `field_type !== 'select'`. Esto hace el frontend tolerante a datos legacy sin necesidad de re-guardar formularios.

### `src/components/forms/FormWizardDialog.tsx` — auto-upgrade en edición
Al cargar un formulario existente para editar, normalizar en memoria los campos taxonómicos a `field_type='select'` y rellenar `options` con `getLiveCrmOptions(...)`. Así, al guardar, queda persistido correctamente sin pasos manuales del admin.

## Out of scope
- No se cambia la BD ni se hace migración masiva (el frontend tolera legacy + el edge override resuelve el render).
- No se toca lógica de jerarquía ni `SearchableCombobox` (ya funcionan).

## Resultado esperado
- Categoría, Vertical, Sub-vertical y Ciudad aparecen como combobox buscable en el formulario público sin importar cuándo fueron creados.
- Al re-editar y guardar el form en el constructor, el `field_type` queda persistido como `select`.
