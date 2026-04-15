

## Plan: 3 cambios -- Verificación flexible, moneda en ventas, y moneda configurable en CRM

### Cambio 1: Checkbox "Permitir verificar con Razón social o Nombre comercial"

**Concepto:** En el constructor (Step 2), agregar un checkbox "Permitir identificarse sin NIT (por Razón social o Nombre comercial)". Cuando el formulario tiene esa opción activa, en el formulario publico aparece un checkbox "No tengo NIT" que cambia el campo de entrada para buscar por razón social o nombre comercial.

**Archivos a modificar:**
- **DB migration** -- Agregar columna `allow_name_fallback boolean default false` a `external_forms`
- **`src/components/forms/FormWizardDialog.tsx`** -- Agregar checkbox en Step 2 (debajo del campo llave) que controle `allowNameFallback`. Solo visible cuando `verificationKeyField === 'nit'`. Guardar/cargar ese campo.
- **`src/pages/PublicFormPage.tsx`** -- Cuando `formMeta.allow_name_fallback === true`, mostrar un checkbox "No tengo NIT" en el paso de identificación. Si marcado, cambiar placeholder a "Razón social o Nombre comercial" y enviar un flag `use_name_fallback: true` al backend.
- **`supabase/functions/form-verify/index.ts`** -- En la accion `identify`, si `use_name_fallback === true` y el form tiene `allow_name_fallback`, buscar con `ilike` en `trade_name` y `legal_name` (OR). Si no encuentra, dar error descriptivo.

### Cambio 2: Selector de moneda en campo de ventas del formulario publico

**Concepto:** Cuando el campo `sales_by_year` se renderiza en el formulario publico, agregar un selector de moneda (COP / USD) encima de los inputs de ventas. El valor de moneda elegido se guarda junto con los datos en `response_data`.

**Archivos a modificar:**
- **`src/pages/PublicFormPage.tsx`** -- Modificar el componente `SalesByYearField` para incluir un `Select` con COP y USD. Almacenar la moneda seleccionada en el formData como `{field_key}_currency`. Cambiar el formato de preview segun la moneda.
- **`supabase/functions/form-verify/index.ts`** -- En la accion `submit`, cuando se aplican datos de `sales_by_year`, si viene `_currency: 'USD'`, guardar una nota o un campo metadata indicando la moneda (o convertir si hay tasa).

### Cambio 3: Moneda principal configurable + toggle COP/USD en CRM

**Concepto:** Por defecto COP. Desde Settings se puede cambiar la moneda principal. En la tabla del CRM y en el perfil de empresa, un boton toggle COP/USD para alternar la vista. En los filtros avanzados, un selector para especificar en que moneda se ingresa el valor de filtro.

**Archivos a modificar:**

- **DB migration** -- Insertar en `feature_settings` un registro `sales_currency` con config `{"code":"COP","symbol":"$","locale":"es-CO"}` si no existe.

- **`src/contexts/ProfileContext.tsx`** -- Cargar `salesCurrency` desde `feature_settings` y exponerlo. Agregar `updateSalesCurrency()`.

- **`src/components/admin/CurrencySettings.tsx`** (nuevo) -- Componente admin para seleccionar moneda principal (COP, USD, EUR). Preview del formato.

- **`src/pages/ProfilePage.tsx`** -- Agregar "Moneda" como feature en el sidebar de Settings, renderizar `CurrencySettings`.

- **`src/lib/calculations.ts`** -- Agregar funcion `formatSales(value, currencyCode)` que formatee dinamicamente. Mantener `formatCOP`/`formatUSD` por compatibilidad.

- **`src/components/crm/CompanyTable.tsx`** -- Agregar boton toggle COP/USD en header de columna de ventas. Usar `formatSales` con la moneda seleccionada.

- **`src/components/crm/CompanyProfile.tsx`** -- Toggle COP/USD en seccion de ventas.

- **`src/components/crm/SalesChart.tsx`** -- Formato dinamico.

- **`src/components/crm/CRMFilters.tsx`** -- En filtros avanzados (Ventas min/max), agregar un mini-selector COP/USD junto a los inputs. Agregar `salesFilterCurrency` al `FilterState`.

- **`src/types/crm.ts`** -- Agregar `salesFilterCurrency?: 'COP' | 'USD'` al `FilterState` y al `DEFAULT_FILTERS`.

- **`src/lib/exportExcel.ts`** / **`src/lib/exportProfilePdf.ts`** -- Usar la moneda del contexto en los encabezados.

### Nota sobre conversion USD/COP
Para la v1, el toggle COP/USD sera solo un cambio de etiqueta/formato (no conversion automatica de tasa de cambio), ya que los datos se almacenan en la moneda que la empresa reporto. Si se requiere conversion, se puede agregar una tasa configurable en `feature_settings` en una iteracion futura.

### Resumen de archivos
- 1 migration (columna `allow_name_fallback` + insert `sales_currency` setting)
- `FormWizardDialog.tsx` -- checkbox allow_name_fallback
- `PublicFormPage.tsx` -- checkbox "No tengo NIT" + selector moneda en ventas
- `form-verify/index.ts` -- logica de busqueda por nombre + moneda en submit
- `ProfileContext.tsx` -- exponer salesCurrency
- `CurrencySettings.tsx` (nuevo) -- selector moneda admin
- `ProfilePage.tsx` -- agregar feature Moneda
- `calculations.ts` -- formatSales dinamico
- `CompanyTable.tsx`, `CompanyProfile.tsx`, `SalesChart.tsx` -- toggle COP/USD
- `CRMFilters.tsx` -- selector moneda en filtros
- `types/crm.ts` -- salesFilterCurrency
- `exportExcel.ts`, `exportProfilePdf.ts` -- moneda dinamica

