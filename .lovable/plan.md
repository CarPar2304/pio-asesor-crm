

## Plan: Timeline mejorado + Formularios en historial + Conversión de moneda en tiempo real

### 1. Timeline: Navegación temporal + barra de desplazamiento visible

**`src/components/crm/CompanyTimeline.tsx`**
- Agregar un control de navegación temporal arriba del timeline: un `Select` o `DatePicker` con los meses/años disponibles agrupados desde los eventos. Al seleccionar uno, hacer scroll programático hasta ese grupo.
- Asegurar que el `ScrollBar` horizontal sea siempre visible (no solo al hover). Usar CSS `scrollbar-always-show` o forzar overflow-x visible.
- Agregar un input tipo `month` (yyyy-MM) como alternativa rápida para saltar a una fecha específica.

### 2. Formularios en el historial

**`supabase/functions/form-verify/index.ts`**
- En la acción `submit`, después de insertar la respuesta y aplicar los datos, insertar un registro en `company_history` con:
  - `event_type`: `'form_submission'` (actualización), `'form_creation'` (creación de empresa), o `'form_update'` (nueva info)
  - `title`: "Formulario: {nombre del form}"
  - `description`: resumen de los campos actualizados o creados
  - `metadata`: `{ form_id, form_name, fields_updated: [...], created_by_user: form.created_by }`
  - `performed_by`: `form.created_by` (quien creó el formulario, ya que el respondiente es anónimo)

**`src/components/crm/CompanyTimeline.tsx`**
- Agregar `form_submission` y `form_creation` al `EVENT_CONFIG` con un icono apropiado (e.g. `FileText`) y colores diferenciados.

### 3. Conversión de moneda con TRM en tiempo real

**Concepto**: Cada empresa almacena sus ventas en la moneda en que fueron cargadas (por defecto COP). Al alternar la vista COP/USD, se aplica la TRM actual para convertir. Se usa una API gratuita (exchangerate-api.com o frankfurter.app) para obtener la tasa.

**Nuevo: `src/lib/exchangeRate.ts`**
- Helper que consulta `https://api.frankfurter.app/latest?from=USD&to=COP` (gratuita, sin API key)
- Cache en memoria (localStorage + timestamp) por 1 hora para no repetir llamadas
- Exporta `getExchangeRate(from, to): Promise<number>` y `convertCurrency(value, from, to): Promise<number>`

**`src/components/crm/CompanyTable.tsx`**
- Al hacer toggle COP/USD, llamar al helper de tasa de cambio y multiplicar/dividir los valores de ventas antes de formatearlos
- Mostrar un tooltip "TRM: $X,XXX" junto al badge de moneda para que el usuario sepa la tasa usada

**`src/components/crm/CompanyProfile.tsx`**
- Mismo comportamiento: al alternar moneda en el perfil, convertir valores usando la TRM
- En la sección de ventas, agregar un selector "Moneda principal de esta empresa" (COP o USD) que se guarde como metadata en la empresa. Esto requiere:

**DB migration**: Agregar columna `sales_currency text NOT NULL DEFAULT 'COP'` a la tabla `companies`.

**`src/contexts/CRMContext.tsx`**  
- Mapear `sales_currency` al cargar/guardar empresas

**`src/types/crm.ts`**
- Agregar `salesCurrency: string` al tipo `Company`

**`src/components/crm/CompanyForm.tsx`**
- Agregar selector de "Moneda principal" (COP/USD) en el formulario de edición de empresa

**`src/components/crm/CRMFilters.tsx`**
- Al filtrar por ventas min/max con una moneda seleccionada, convertir los valores de las empresas a esa moneda antes de comparar

**`src/components/crm/SalesChart.tsx`**
- Usar la moneda de vista para formatear el eje Y

### Archivos a modificar/crear

1. `supabase/migrations/` — columna `sales_currency` en `companies`
2. `src/lib/exchangeRate.ts` (nuevo) — helper de TRM con cache
3. `src/components/crm/CompanyTimeline.tsx` — navegación temporal + event types de formularios
4. `supabase/functions/form-verify/index.ts` — insertar history al submit
5. `src/types/crm.ts` — `salesCurrency` en Company
6. `src/contexts/CRMContext.tsx` — mapear sales_currency
7. `src/components/crm/CompanyForm.tsx` — selector moneda principal
8. `src/components/crm/CompanyTable.tsx` — conversión con TRM
9. `src/components/crm/CompanyProfile.tsx` — conversión con TRM + selector moneda empresa
10. `src/components/crm/CRMFilters.tsx` — conversión en filtros
11. `src/components/crm/SalesChart.tsx` — formato dinámico con conversión
12. `src/lib/calculations.ts` — helper `convertAndFormat`

