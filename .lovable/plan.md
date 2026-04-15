

## Plan: Moneda dinámica en exports + Auto-vectorización

### Parte 1: Moneda dinámica en exportaciones

**`src/lib/exportExcel.ts`**
- Recibir `currencyCode` como parámetro
- Cambiar labels `(COP)` por la moneda dinámica usando `currencyLabel()`

**`src/components/crm/ExportDialog.tsx`**
- Pasar `currencyCode` desde el contexto de perfil al export

**`src/lib/exportProfilePdf.ts`**
- Recibir `currencyCode` como parámetro
- Usar `formatSales()` y `formatFullSales()` en vez de `formatCOP()` hardcodeado
- Cambiar labels de "Ventas (COP)" a moneda dinámica

**Componentes que llaman a estos exports** (CompanyProfile, etc.) — pasar la moneda del contexto.

---

### Parte 2: Incluir pipeline_notes en vectorización de pipeline

**`supabase/functions/vectorize-companies/index.ts`**
- En `vectorizePipeline()`: hacer fetch de `pipeline_notes` y agregar el contenido de las notas al texto del pipeline por oferta
- Agregar modo `tasks` que vectorice las tareas como parte de la información de empresas (re-vectoriza empresas afectadas)

---

### Parte 3: Botón de vectorizar tareas en admin

**`src/components/admin/ChatSettings.tsx`**
- Agregar un 4to botón "Vectorizar Tareas" en la grid de portafolio
- Este botón invoca `vectorize-companies` con `mode: 'companies'` (ya incluye tareas) o un nuevo modo `tasks` que re-vectorice solo empresas con tareas

---

### Parte 4: Auto-vectorización en cada mutación

Crear un helper `triggerVectorize` reutilizable que invoque la edge function en background (fire-and-forget, sin bloquear UI).

**`src/lib/vectorizeHelper.ts`** (nuevo)
```typescript
export function triggerVectorize(mode: string, extra?: object) {
  supabase.functions.invoke('vectorize-companies', { 
    body: { mode, ...extra } 
  }).catch(console.error); // fire-and-forget
}
```

**`src/contexts/CRMContext.tsx`**
- En `addCompany()`: después del insert exitoso, llamar `triggerVectorize('companies', { companyIds: [newId] })`
- En `updateCompany()`: llamar `triggerVectorize('companies', { companyIds: [company.id] })`
- En `addTask()`, `updateTask()`: llamar `triggerVectorize('companies', { companyIds: [companyId] })`

**`src/contexts/PortfolioContext.tsx`**
- En `createOffer()`: llamar `triggerVectorize('offers')`
- En `updateOffer()`: llamar `triggerVectorize('offers')`
- En `createAlly()`: llamar `triggerVectorize('allies')`
- En `updateAlly()`: llamar `triggerVectorize('allies')`
- En `addCompanyToStage()`: llamar `triggerVectorize('pipeline')`
- En `moveCompanyToStage()`: llamar `triggerVectorize('pipeline')`
- En `removeEntry()`: llamar `triggerVectorize('pipeline')`

**`src/components/portfolio/PipelineNotesPanel.tsx`**
- Después de insertar una nota: llamar `triggerVectorize('pipeline')`

---

### Archivos a modificar/crear
1. `src/lib/exportExcel.ts` — moneda dinámica
2. `src/lib/exportProfilePdf.ts` — moneda dinámica
3. `src/components/crm/ExportDialog.tsx` — pasar moneda
4. `src/lib/vectorizeHelper.ts` (nuevo) — helper fire-and-forget
5. `supabase/functions/vectorize-companies/index.ts` — incluir pipeline_notes en vectorización
6. `src/contexts/CRMContext.tsx` — auto-vectorize en add/update company y tasks
7. `src/contexts/PortfolioContext.tsx` — auto-vectorize en create/update offer, ally, pipeline moves
8. `src/components/portfolio/PipelineNotesPanel.tsx` — auto-vectorize al crear nota
9. `src/components/admin/ChatSettings.tsx` — botón "Vectorizar Tareas"
10. Componentes que invocan PDF export — pasar currencyCode

