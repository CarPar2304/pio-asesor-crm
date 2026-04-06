
Objetivo

- Hacer que las respuestas del chat rendericen tablas reales mientras se van completando.
- Corregir el filtro y orden por ventas para que usen una sola regla: el último año con dato registrado por empresa.
- Dejar el orden/paginación consistentes entre grid, tabla y cambio de página.

Hallazgos

- `ChatBubble.tsx` usa `react-markdown`, pero no `remark-gfm`; por eso los `|` se muestran como texto y no como tablas.
- El prompt de `company-chat` pide “usar tablas”, pero no obliga a generar sintaxis Markdown GFM válida; por eso la IA está devolviendo pseudo-tablas con `||`.
- Hoy hay 3 lógicas distintas para ventas:
  - las cards usan `getLastYearSales()`,
  - `Index.tsx` filtra y ordena con `filters.activeYear`,
  - `CompanyTable.tsx` vuelve a ordenar localmente solo el subset ya paginado.
  Esa inconsistencia explica el filtro `> 10M`, el orden raro con empresas sin ventas y los resultados distintos entre páginas/vistas.

Plan

1. Arreglar el render de tablas del chat
- Añadir `remark-gfm`.
- En `src/components/chat/ChatBubble.tsx`, activar `remarkPlugins={[remarkGfm]}` sobre `ReactMarkdown`.
- Mantener el re-render por chunk, para que el contenido se vuelva a parsear completo en cada actualización y la tabla aparezca apenas el bloque ya sea válido.
- Si hace falta, normalizar saltos de línea del mensaje antes de renderizar para ayudar a que los bloques de tabla se cierren bien durante streaming.

2. Forzar a la IA a emitir tablas válidas
- Ajustar `supabase/functions/company-chat/index.ts` para pedir explícitamente tablas GFM reales:
  - fila de encabezado,
  - fila separadora `| --- | --- |`,
  - una fila por línea,
  - nunca usar `||` como pseudo-separador.
- Con esto, el cliente no dependerá de “interpretar” formatos ambiguos.

3. Unificar la lógica de ventas
- Crear/fortalecer en `src/lib/calculations.ts` un helper único para “últimas ventas comparables” por empresa.
- Esa función será la fuente de verdad para:
  - filtro mínimo/máximo de ventas,
  - orden por ventas,
  - valor mostrado en tabla cuando se está comparando por ventas.
- Empresas sin ventas quedarán siempre al final al ordenar por ventas, para evitar empates falsos con valor `0`.

4. Corregir el bug de filtro y orden en el CRM
- En `src/pages/Index.tsx`, reemplazar el uso de `c.salesByYear[filters.activeYear]` por el helper de “último año con dato”.
- Hacer el sort global antes de paginar y usar exactamente esa misma lista para grid y tabla.
- Mover la corrección de página fuera del render a un `useEffect`, para evitar estados intermedios raros cuando cambian filtros/páginas.

5. Corregir la tabla del CRM para que no rompa el orden
- Quitar el sort local de `src/components/crm/CompanyTable.tsx` sobre `paginatedItems`.
- Conectar los headers de la tabla al mismo estado de orden global del padre, o volverla solo presentacional.
- Así el orden será idéntico en grid, tabla y navegación por páginas.

6. Ajustar la UI para que la regla quede clara
- Cambiar labels/chips de ventas a algo como “Ventas (último dato)” para que no parezca que depende del año visible.
- En la tabla, mostrar el año del dato junto al valor si cada empresa puede estar comparándose con años distintos.
- Hacer que la lista de años del selector salga de los datos reales y no de un rango fijo `2020–2025`.

Archivos a tocar

- `package.json`
- `src/components/chat/ChatBubble.tsx`
- `supabase/functions/company-chat/index.ts`
- `src/lib/calculations.ts`
- `src/pages/Index.tsx`
- `src/components/crm/CompanyTable.tsx`
- `src/components/crm/CRMFilters.tsx`
- posiblemente `src/types/crm.ts` si conviene tipar mejor la métrica de ventas comparable

Detalles técnicos

- La causa principal del chat no es CSS: es parsing Markdown incompleto.
- La causa principal del CRM no es solo paginación: es mezclar año activo, último año con dato y reordenar después de paginar.
- La corrección correcta es centralizar:
  - 1 helper para ventas,
  - 1 orden global,
  - 1 paginación al final.

Validación

- Chat: pedir una comparación que deba salir en tabla y verificar que durante el streaming se actualiza y termina renderizada como tabla real.
- Grid: aplicar `Ventas ≥ 10M` y confirmar que entren empresas cuyo último dato válido sea 2024 o 2025.
- Orden desc por ventas: confirmar que una empresa con ventas registradas quede por encima de una sin ventas, aunque esté en otra página originalmente.
- Tabla CRM: comprobar que ordenar desde headers y desde el filtro global da el mismo resultado.
- Paginación: navegar varias páginas y confirmar que el orden no cambia “por página” sino globalmente.
