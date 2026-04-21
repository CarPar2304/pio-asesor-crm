

# Company Chat v5 — Cobertura completa de Portfolio y resolución difusa de ofertas

## Problema detectado

Caso real reproducido: el usuario pregunta por la oferta **"Venezuela Tech Week"**. En la BD existe como **"Venzuela Tech Week"** (typo real). El asistente responde "0 empresas en la oferta", técnicamente cierto pero **engañoso**: nunca verifica si la oferta existe, no detecta el typo, no sugiere la oferta similar.

Causas raíz:
1. **No existe ninguna tool sobre `portfolio_offers`** (find/list/get). El modelo no puede resolver nombres difusos de oferta ni listar el catálogo.
2. **Filtros con `ilike '%X%'`** sobre nombre de oferta no toleran typos.
3. **"Lista las ofertas"** cae en `list_companies` porque no hay alternativa.

Lo que SÍ funciona y se mantiene intacto:
- Conteos por ciudad, perfil de empresa, contactos, pipeline state, tareas vencidas, timeline, semantic search.
- Formato fijo hybrid, jerarquía de verdad, router 4 caminos, action tools.
- Modelo `gpt-5.4-mini` con OpenAI directa (no Lovable AI). Reasoning lo aplica el modelo a su nivel por defecto al combinar con tools en `chat.completions`.

---

## Cambios

### 1. Nuevas read-tools de Portfolio en `company-chat`

- **`find_offer_by_name(name, limit?)`** — resolución fuzzy de ofertas usando `pg_trgm` (mismo patrón que `find_company_by_name`). Devuelve `ambiguity` si hay varios candidatos cercanos o `low_confidence` si el mejor match < 0.4. Con esto, "Venezuela Tech Week" resuelve a "Venzuela Tech Week" como sugerencia.
- **`list_offers(status?, product?, limit?)`** — lista ofertas del portfolio con filtros opcionales.
- **`get_offer_summary(offer_id)`** — devuelve la oferta + sus etapas (`pipeline_stages`) + conteo de empresas inscritas. Útil para "qué empresas están en X oferta y en qué etapa".

### 2. Migración SQL — RPC fuzzy de ofertas

Crear `public.find_offer_by_name(_name text, _limit int)` análogo al de empresas (usa `name % _name` con `similarity()` ordenado desc, `search_path=public`).

### 3. Reglas adicionales en system prompt de `company-chat`

- Si el usuario menciona un nombre de oferta:
  - **SIEMPRE** primero `find_offer_by_name`. Si `ambiguity` → preguntar al usuario cuál es. NO ejecutar `list_companies(offer=...)` con el string crudo.
- Si la pregunta es "qué ofertas tenemos / lista las ofertas / catálogo" → usar `list_offers`, NUNCA `list_companies`.
- Cuando `list_companies` reciba `offer`, internamente preferir `offer_id` (resuelto por `find_offer_by_name`) en vez de string fuzzy.

### 4. `list_companies` y `count_companies` — aceptar `offer_id`

Ampliar parámetros: si llega `offer_id`, filtrar por `pipeline_entries.offer_id` directo (exact); si llega `offer` (string), seguir usando `ilike` como hoy (compatibilidad).

### 5. Router (`chat-router`) — nuevo intent

Agregar `intent: "catalogo_ofertas"` al enum y mejor detección: cuando el usuario diga "ofertas / portfolio / programas / convocatorias", marcar `intent=catalogo_ofertas` y `path=exact`.

### 6. Pruebas end-to-end (curl) que deben pasar

1. "¿Cuántas empresas hay en Cali?" → conteo exacto. ✓ (ya funciona)
2. "Dame el perfil de TuCash" → formato fijo con datos. ✓ (ya funciona)
3. **"Hay una oferta que se llama Venezuela Tech Week"** → debe sugerir "¿Te refieres a *Venzuela Tech Week*?" (fuzzy match).
4. **"Lista las ofertas"** → tabla con ofertas del portfolio (no empresas).
5. **"Qué empresas están en Venzuela Tech Week"** → resuelve oferta exacta → cuenta/lista empresas inscritas con su etapa.
6. "¿Cuántas tareas vencidas hay?" → conteo desde `get_overdue_tasks`.
7. "Cuéntame la historia de TuCash" → timeline + formato hybrid.
8. **Empresa inexistente "Acme XYZ"** → caso A "no encontré".
9. **Empresa ambigua "Tech"** → caso B con candidatos.

---

## Archivos tocados

- `supabase/functions/company-chat/index.ts` — agregar 3 tools de portfolio + ejecutores + reglas en prompt + soporte `offer_id` en list/count.
- `supabase/functions/chat-router/index.ts` — nuevo intent `catalogo_ofertas`.
- Nueva migración SQL — RPC `find_offer_by_name` + índice `gin (name gin_trgm_ops)` en `portfolio_offers` si no existe.
- (No tocar) `ChatSettings.tsx`, modelo y reasoning ya configurados.

---

## Out of scope

- No se cambia el modelo (`gpt-5.4-mini` se queda — funciona y es rápido).
- No se cambia la conexión a OpenAI (sigue directo con `OPENAI_API_KEY`, sin Lovable AI).
- No se agregan tools sobre Aliados ni Notas del pipeline (siguiente iteración si se necesita).

