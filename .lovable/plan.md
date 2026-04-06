

## Plan: Feature "Chat" con Base de Datos Vectorial

### Resumen

Crear un chat tipo burbuja flotante que permita consultar sobre las empresas del CRM usando búsqueda semántica con pgvector. Incluye: tabla de embeddings, Edge Function para vectorizar empresas, Edge Function para el chat con RAG, componente de burbuja flotante, y panel de administración para gestionar la vectorización.

---

### Arquitectura

```text
┌──────────────┐    ┌─────────────────────┐    ┌──────────────────┐
│  Chat Bubble │───▶│  EF: company-chat   │───▶│  OpenAI (chat)   │
│  (Frontend)  │    │  1. Embed query     │    │  gpt-4.1-mini    │
│  Markdown    │    │  2. RPC search      │    └──────────────────┘
│  rendering   │    │  3. Build prompt    │
└──────────────┘    │  4. Stream response │
                    └─────────┬───────────┘
                              │
                    ┌─────────▼───────────┐
                    │  company_embeddings  │
                    │  (pgvector table)    │
                    └─────────────────────┘

┌──────────────┐    ┌──────────────────────┐
│  Admin Panel │───▶│  EF: vectorize-co.   │──▶ OpenAI Embeddings
│  "Vectorizar"│    │  Batch embed all     │    text-embedding-3-small
└──────────────┘    └──────────────────────┘
```

---

### 1. Migración de Base de Datos

- Habilitar extensión `vector`: `create extension if not exists vector with schema extensions;`
- Crear tabla `company_embeddings`:
  - `id uuid PK`
  - `company_id uuid NOT NULL UNIQUE` (referencia a companies)
  - `content text NOT NULL` (texto plano usado para el embedding)
  - `embedding extensions.vector(1536)` (dimensión de text-embedding-3-small)
  - `updated_at timestamptz`
  - `created_at timestamptz`
- RLS: authenticated puede SELECT; solo service_role inserta/actualiza (via Edge Functions)
- Crear función RPC `match_companies`:
  ```sql
  create or replace function match_companies(
    query_embedding extensions.vector(1536),
    match_threshold float default 0.5,
    match_count int default 10
  ) returns table (
    id uuid, company_id uuid, content text, similarity float
  )
  ```
  Usa `<=>` (cosine distance) para ordenar resultados.

### 2. Edge Function: `vectorize-companies`

- Recibe `POST` sin body (o con `{ companyIds?: string[] }` para parciales)
- Consulta todas las empresas con sus contactos, acciones, propiedades custom, y campos custom
- Para cada empresa, construye un texto enriquecido:
  - Nombre comercial, razón social, NIT, categoría, vertical, sub-vertical, descripción, ciudad, sitio web, ventas por año, exportaciones
  - Contactos principales
  - Propiedades custom
- Hace batch de embeddings con OpenAI `text-embedding-3-small` (puede enviar hasta ~100 textos por request)
- Upsert en `company_embeddings` (insert on conflict update)
- Retorna resumen: total procesadas, errores, duración

### 3. Edge Function: `company-chat`

- Recibe `{ messages: Array<{role, content}> }`
- Extrae el último mensaje del usuario
- Genera embedding de la query con `text-embedding-3-small`
- Llama RPC `match_companies` para obtener las 8-10 empresas más relevantes
- Construye system prompt con el contexto de empresas encontradas
- Llama a OpenAI chat completions con streaming (modelo configurable desde `feature_settings` key `company_chat`)
- Retorna SSE stream al cliente
- Maneja errores 429/402

### 4. Componente: `ChatBubble.tsx`

- Burbuja flotante fija en esquina inferior derecha (botón circular con icono MessageCircle)
- Al hacer clic, abre panel de chat con animación
- Input de texto + botón enviar
- Historial de mensajes con scroll
- Mensajes del asistente renderizados con `react-markdown` (instalar dependencia)
  - Configurar para que `h1` y `h2` no se rendericen (solo `h3` en adelante, usando `## ` y `### `)
  - Soporte de **negrillas**, listas, tablas
- Indicador de "escribiendo..." durante streaming
- Se monta en `Layout.tsx` para estar disponible en todas las páginas

### 5. Admin: `ChatSettings.tsx`

- Nueva sección en Settings del perfil (junto a Company Fit, Taxonomía, Company Radar)
- Configuración:
  - Modelo del chat (gpt-4.1-mini, gpt-4.1, o4-mini)
  - Modelo de embeddings (text-embedding-3-small, text-embedding-3-large)
  - Reasoning effort
  - Prompt base del sistema
- Botón "Vectorizar empresas" con:
  - Progress bar durante la vectorización
  - Estadísticas: última vectorización, total empresas vectorizadas, fecha
- Se guarda en `feature_settings` con key `company_chat`

### 6. Archivos a Crear/Modificar

**Crear:**
- `supabase/migrations/XXXX_company_embeddings.sql` — tabla + extensión + RPC
- `supabase/functions/vectorize-companies/index.ts` — Edge Function de vectorización
- `supabase/functions/company-chat/index.ts` — Edge Function de chat con RAG
- `src/components/chat/ChatBubble.tsx` — Componente burbuja flotante
- `src/components/admin/ChatSettings.tsx` — Panel admin

**Modificar:**
- `src/components/Layout.tsx` — Agregar `<ChatBubble />` 
- `src/pages/ProfilePage.tsx` — Agregar "Chat" al array FEATURES y renderizar `ChatSettings`

**Instalar:**
- `react-markdown` — Para renderizar markdown en mensajes

---

### Detalles Técnicos

- **Embedding model**: `text-embedding-3-small` (1536 dimensiones), usando OPENAI_API_KEY ya configurado
- **Batch processing**: Enviar embeddings en lotes de 50 empresas para evitar timeouts
- **Chat streaming**: SSE token-by-token como los otros Edge Functions del proyecto
- **Markdown config**: Componentes custom para `react-markdown` que mapean `h1`→`h3`, `h2`→`h4` para evitar títulos grandes; tablas con estilos Tailwind

