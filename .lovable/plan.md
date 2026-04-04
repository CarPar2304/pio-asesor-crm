

## Company Fit — Plan de implementación

### Resumen

Feature de IA dentro del formulario de edición que analiza una empresa usando OpenAI (modelo `gpt-5.4` con `web_search`), consulta RUES, y devuelve clasificación + datos para revisión manual antes de guardar.

### Requisito previo: API Key de OpenAI

Necesito que me proporciones tu API key de OpenAI. La almacenaré como secret de Supabase (`OPENAI_API_KEY`) para que solo la edge function tenga acceso.

### Arquitectura

```text
CompanyForm.tsx ── POST ──> Edge Function (company-fit)
                                │
                                ├─ OpenAI Responses API (gpt-5.4 + web_search)
                                ├─ RUES API (datos.gov.co)
                                │
                  <── JSON ─────┘
```

### Archivos a crear/modificar

**1. Secret: `OPENAI_API_KEY`**
- Se te pedirá el token vía la herramienta de secrets.

**2. Edge Function: `supabase/functions/company-fit/index.ts`**

Lógica:
- Recibe datos de la empresa + taxonomía actual (categorías, verticales, sub-verticales)
- **Paso 1**: Consulta RUES (datos.gov.co) con NIT (con y sin dígito de verificación) y por razón social. Hasta 4 intentos con variaciones.
- **Paso 2**: Llama a OpenAI Responses API usando `web_search` tool:
  ```typescript
  import OpenAI from "npm:openai";
  const client = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });
  const response = await client.responses.create({
    model: "gpt-5.4",
    tools: [{ type: "web_search" }],
    input: promptCompleto,
  });
  ```
- El prompt incluye: las reglas de clasificación completas (Startup / EBT / Tecnología No Startup / Disruptiva), la taxonomía existente, datos actuales de la empresa, e instrucciones para inferir género de contactos, buscar logo URL, y determinar estado.
- **Tool calling** para structured output con los campos: `category`, `vertical`, `subVertical`, `description`, `logoUrl`, `legalName`, `nit`, `tradeName`, `contacts` (con género), `companyStatus`, `confidence`, `reasoning`, `isNewVertical`, `isNewSubVertical`.

Respuesta JSON:
```typescript
{
  category: string;
  vertical: string;
  subVertical: string;
  description: string;
  logoUrl: string | null;
  legalName: string | null;
  nit: string | null;
  tradeName: string | null;
  contacts: Array<{ id: string; gender: 'male' | 'female' }>;
  companyStatus: 'active' | 'inactive' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  isNewVertical: boolean;
  isNewSubVertical: boolean;
  ruesData: object | null;
}
```

**3. Modificar: `src/components/crm/CompanyForm.tsx`**

- Botón "Company Fit" con icono Sparkles en el header del diálogo (solo en modo edición o cuando hay website).
- Estado `companyFitLoading` para controlar animaciones.
- Al hacer clic:
  - Skeleton loaders en campos: categoría, vertical, sub-vertical, descripción, logo, razón social, NIT, género de contactos.
  - Barra de progreso animada con color primario y texto que cambia: "Analizando sitio web..." → "Consultando RUES..." → "Clasificando empresa..."
  - Llamar al edge function con datos actuales + taxonomía del contexto.
- Al recibir respuesta:
  - Poblar campos del formulario temporalmente (sin guardar).
  - Badge sutil "IA" en campos modificados.
  - Soporte para cargar logo desde URL (fetch blob → upload a storage).
- Manejo de errores: toast con mensaje, campos vuelven a estado original.

**4. Actualizar: `supabase/config.toml`**

Agregar configuración de la edge function `company-fit`.

### Resumen de cambios

| Archivo | Acción |
|---|---|
| Secret `OPENAI_API_KEY` | Agregar vía herramienta de secrets |
| `supabase/functions/company-fit/index.ts` | Crear |
| `supabase/config.toml` | Agregar función |
| `src/components/crm/CompanyForm.tsx` | Agregar botón, skeletons, lógica de carga, URL logo |

No se requieren migraciones de base de datos.

