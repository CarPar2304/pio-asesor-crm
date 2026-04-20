

# Company Chat — Plan de ejecución (v3 final)

Mantengo la arquitectura híbrida y reglas de negocio aprobadas. Incorporo los 5 ajustes finales solicitados.

---

## 1. Jerarquía de verdad (regla maestra)

```text
1. DATOS EXACTOS DEL CRM   → tools SQL. Única fuente válida para hechos.
2. ESTADO ACTUAL           → posición vigente en pipeline, tareas abiertas, asignados.
3. HISTÓRICO               → company_history + acciones/hitos/tareas cerradas (con fecha).
4. CONTEXTO SEMÁNTICO      → RAG. SOLO como apoyo narrativo, NUNCA como hecho.
```

---

## 2. Router de intención (4 caminos)

`chat-router` (edge function, LLM ligero, tool calling) clasifica cada turno:

| Camino | Cuándo | Comportamiento |
|---|---|---|
| `exact` | Hecho verificable (lista, conteo, contacto, etapa, tarea) | Solo tools SQL. Vacío → "no hay resultados". No aproxima. |
| `semantic` | Pregunta abierta de contexto/resumen/antecedentes | Solo `search_semantic`. **La respuesta se presenta explícitamente como "contexto" o "indicios relevantes", nunca como verdad exacta del CRM.** Toda salida abre con un disclaimer corto: *"Esto es contexto recuperado, no necesariamente el estado actual."* |
| `hybrid` | Cruza hecho + interpretación | SQL para identidad/estado + RAG para narrativa. **Formato fijo obligatorio (ver §5).** |
| `clarify` | Ambigüedad real | No responde el contenido; pide precisión con opciones concretas. |

Salida del router (JSON):
```json
{
  "path": "exact|semantic|hybrid|clarify",
  "intent": "perfil_empresa|contacto|estado_comercial|tareas_pendientes|historial_seguimiento|listado_filtrado|conteo|comparacion|resumen_ejecutivo|otro",
  "entities": { "company_mentions": [], "city": null, "vertical": null, "offer": null, "stage": null, "assigned_to": null, "date_range": null, "only_overdue": false },
  "evidence_level": "full|partial|none",
  "clarification_question": null,
  "rewritten_query": "..."
}
```

---

## 3. Definición operativa de `evidence_level`

| Valor | Definición operativa | Cómo se decide |
|---|---|---|
| `full` | Todas las entidades clave de la pregunta fueron resueltas por tools exactas y devolvieron datos completos (sin `truncated`, sin `warnings` críticos, sin ambigüedad). | Toda tool requerida devolvió `total > 0` y `truncated = false` y `ambiguity = null`. |
| `partial` | Se obtuvo respuesta a **parte** de la pregunta pero falta evidencia para otra parte. Casos: (a) alguna tool exacta devolvió `total = 0` mientras otras devolvieron datos, (b) `truncated = true` (se llegó al límite), (c) hay `warnings` no críticos, (d) la respuesta combina datos exactos con apoyo RAG porque la parte exacta era insuficiente, (e) algunas entidades pedidas se resolvieron y otras no. | Cualquiera de las condiciones (a)–(e) sin llegar a `none`. |
| `none` | No se pudo encontrar evidencia suficiente para responder. La empresa/entidad no existe, o todas las tools devolvieron vacío, o sólo hay coincidencias semánticas débiles (similarity < umbral). | Todas las tools exactas requeridas devolvieron `total = 0` Y semantic devolvió < 3 chunks o todos con score < 0.3. |

El system prompt obliga a **declarar explícitamente** el nivel y, en caso de `partial`/`none`, qué falta.

---

## 4. Política de "vacío y ambigüedad" (4 casos distintos)

El modelo debe elegir y **declarar uno** de estos 4 casos cuando una búsqueda no produce un resultado limpio. Cada tool devuelve metadata suficiente para discriminar:

| Caso | Definición | Señal en respuesta de tool | Respuesta esperada del chat |
|---|---|---|---|
| **A. No existe** | La entidad consultada no aparece en ninguna tabla del CRM. | `find_company_by_name` → `total=0`, `ambiguity=null`, sin candidatos trgm > 0.3 | "No encontré ninguna empresa llamada *X* en el CRM." |
| **B. No encontré coincidencia confiable** | Hay candidatos con similitud baja o múltiples sin ganador claro. | `find_company_by_name` → `ambiguity.kind = "low_confidence"` o `"multiple_matches"` | "No tengo coincidencia confiable. Posibles candidatos: [lista]. ¿A cuál te refieres?" |
| **C. Existe pero sin datos en ese frente** | La entidad existe (resuelta sin ambigüedad) pero la tool específica devuelve vacío. | `get_company_contacts` → `total=0` con `company_id` resuelto | "*Acme S.A.S.* existe en el CRM, pero **no tiene contactos registrados**." |
| **D. Hay ambigüedad** | La pregunta misma es ambigua (filtro, periodo o entidad poco clara). | Router devuelve `path="clarify"` con `clarification_question` | "Para responder bien necesito precisar: ¿[pregunta]?" |

**Prohibido fusionar casos.** Si A se confunde con C, el modelo está mintiendo.

---

## 5. Formato fijo obligatorio para respuestas `hybrid`

Toda respuesta clasificada como `hybrid` se renderiza con esta estructura, sin excepciones (omitir una sección sólo si está vacía y declararlo):

```markdown
### Estado actual
[Datos vigentes traídos por tools SQL. Cada hecho con tag de fuente: [CRM], [Pipeline], [Tareas].]

### Histórico relevante
[Eventos pasados ordenados cronológicamente desc. Cada uno con fecha explícita y tag [Histórico AAAA-MM-DD].]

### Contexto / observaciones
[Síntesis o matices basados en RAG, marcados como interpretación. Tag [Contexto].]

### Nivel de evidencia
[full | partial | none] — [breve justificación: qué se encontró completo, qué falta, qué se infirió.]
```

---

## 6. Reglas de comportamiento (system prompt nuevo)

1. **Sin aproximación en datos exactos**: tool exacta vacía → declarar uno de los 4 casos de §4. Nunca rellenar con vectores.
2. **Ambigüedad de empresa**: `find_company_by_name` con `ambiguity` → no elegir, preguntar.
3. **Separación estado vs histórico**: en `hybrid`, formato fijo §5.
4. **Camino `semantic`**: siempre marcar la respuesta como contexto/indicios, no como hecho.
5. **Evidencia parcial declarada**: en cada respuesta, cerrar con su `evidence_level` y justificación.
6. **Cita de fuente por bloque**: `[CRM]`, `[Pipeline]`, `[Tareas]`, `[Histórico fecha]`, `[Contexto]`.
7. **No mezclar empresas**: prohibido inferir un dato de A a partir de B.

---

## 7. Catálogo de tools (contrato unificado)

Envoltura común:
```json
{
  "tool": "...",
  "filters_applied": {},
  "total": 0,
  "results": [],
  "truncated": false,
  "timestamp": "ISO",
  "warnings": [],
  "ambiguity": null
}
```

| Tool | Camino | Devuelve | Notas |
|---|---|---|---|
| `find_company_by_name(name, limit?)` | exact/hybrid | candidatos por `pg_trgm` + normalización | Caso A vs B se resuelve aquí. |
| `get_company_profile(id)` | exact | **Solo identidad, taxonomía, financiero, descripción, ciudad, web.** NO incluye contactos. | Separado conceptualmente. |
| `get_company_contacts(id)` | exact | **Solo lista de contactos** con primario destacado. | Tool independiente. No mezclar con profile. |
| `list_companies(filters)` | exact | empresas filtradas, paginadas | |
| `count_companies(filters)` | exact | total + breakdown opcional | |
| `get_pipeline_state(company_id?, offer_id?, stage_id?)` | exact | posiciones actuales con asignado | |
| `get_overdue_tasks(filters)` | exact | tareas vencidas con responsable | |
| `get_company_timeline(id, limit?, since?)` | hybrid | eventos cronológicos del histórico | Sin `slice(0,N)` arbitrario. |
| `search_semantic(query, chunk_types?, company_ids?)` | semantic/hybrid | chunks rankeados con metadata | Sólo apoyo narrativo. |

---

## 8. Chunks granulares (vectorización incremental)

**Migración DB**:
```sql
ALTER TABLE company_embeddings
  ADD COLUMN chunk_type text NOT NULL DEFAULT 'legacy',
  ADD COLUMN chunk_key  text NOT NULL DEFAULT 'main',
  ADD COLUMN metadata   jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN content_hash text;
CREATE UNIQUE INDEX ON company_embeddings(company_id, chunk_type, chunk_key);
CREATE INDEX ON company_embeddings USING gin(metadata);
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX ON companies USING gin(trade_name gin_trgm_ops);
CREATE INDEX ON companies USING gin(legal_name gin_trgm_ops);
```

Tipos de chunk por empresa: `profile`, `financials`, `contact` (1 por contacto), `action` (1 por acción), `milestone`, `task`, `pipeline_position`, `history_event`. Encabezado canónico:
```text
[EMPRESA] Acme S.A.S. (NIT 901...) | id=uuid
[TIPO] action | [FECHA] 2026-03-12
[METADATA] tipo=meeting, autor=Laura, oferta=Aceleración 2026
[CONTENIDO] Reunión de seguimiento sobre…
```

`triggerVectorize({entity, entityId, changedChunks?})`. Hash por chunk → no se llama embeddings si no cambió. Eliminar llamadas masivas sin id. Cron diario "rebuild full".

Nuevos RPCs: `match_company_chunks(query, threshold, count, chunk_types[], company_ids[])`, `find_company_by_name(name, limit)`.

---

## 9. Trazabilidad

Tabla `chat_retrieval_logs`: `intent`, `path`, `tools_called`, `evidence_level`, `vacancy_case` (A/B/C/D/null), `latency_ms`, `tokens`. Habilita iteración basada en datos.

---

## 10. Lo que NO cambia
UI del chat, streaming SSE, persistencia de conversaciones, panel admin de prompt/modelo, render markdown/GFM, taxonomía CRM como guía.

## 11. Lo que SÍ cambia
- 4 regex (`wantsAll`, `isContactLookup`, `isFollowUp`, `isPortfolioQuery`) → router LLM.
- `directMatches` (carga todas las companies) → `find_company_by_name` con `pg_trgm`.
- `slice(0,10)` y `slice(0,15)` → eliminados; cada item es chunk independiente.
- `UPSERT onConflict company_id` global → upsert por `(entity_id, chunk_type, chunk_key)`.
- System prompt monolítico con datos pre-cargados → system prompt con reglas + tools.

## 12. Out of scope
- Cambio de modelo de embeddings.
- Reescritura de UI.
- Migración manual de embeddings legacy (se reemplazan vía rebuild incremental; quedan como `chunk_type='legacy'`).

## 13. Orden de ejecución
1. Migración DB (chunks + `pg_trgm`) + RPCs nuevos.
2. Refactor `vectorize-companies` a chunks incrementales con hash.
3. Edge function `chat-router`.
4. Refactor `company-chat`: tools (con `get_company_profile` y `get_company_contacts` separadas) + nuevo system prompt con jerarquía de verdad, política de vacío/ambigüedad y formato fijo `hybrid`.
5. Tabla `chat_retrieval_logs` y panel mínimo en Stats/Admin.

