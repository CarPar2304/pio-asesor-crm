

# Company Chat v7 — Volver al RAG simple + tools solo para acciones

## Decisión

Revertimos la arquitectura híbrida (read-tools + RAG) y volvemos al **RAG puro original**: el contexto se construye 100% desde búsqueda vectorial sobre `company_embeddings`, `offer_embeddings`, `pipeline_embeddings`, `ally_embeddings` y embeddings de tareas. El modelo recibe ese contexto en el system/user prompt y responde con base en él. **Cero read-tools.**

Las tools solo quedan para **acciones** (mutaciones), porque escribir requiere precisión y confirmación que el RAG no garantiza.

## Por qué

- El usuario reporta que la arquitectura con read-tools (find_company_by_name, list_companies, get_company_profile, etc.) responde de forma incoherente: en un turno dice que tiene a Qash inscrita en Venezuela Tech Week y al siguiente dice que no la encuentra para moverla. Esto pasa porque cada tool consulta la BD por separado con criterios distintos (fuzzy vs exacto, joins distintos), y el modelo no mantiene coherencia entre llamadas.
- El RAG vectorial original recuperaba TODO el contexto relevante en un solo paso al inicio del turno, y el modelo respondía sobre un snapshot consistente.
- Acciones sí necesitan tools — pero deben resolver la entidad usando el **mismo contexto RAG** que el modelo ya vio, no re-buscar en BD.

---

## Cambios

### 1. `supabase/functions/company-chat/index.ts` — reescritura

**Eliminar:**
- Todas las read-tools: `find_company_by_name`, `find_offer_by_name`, `list_companies`, `count_companies`, `list_offers`, `get_offer_summary`, `get_company_profile`, `get_company_contacts`, `get_overdue_tasks`, `get_company_history`, `search_semantic`, y los executors asociados.
- La lógica de "router decide path / hybrid / exact / semantic" en este archivo (el router queda, pero su salida se usa solo como hint de intención, no para enrutar a paths distintos).
- El system prompt actual con su lista negra de tags y formato fijo — se reemplaza por el prompt original RAG.

**Mantener / restaurar:**
- Recuperación RAG inicial: para cada turno, vectorizar la pregunta del usuario, hacer match contra los 5 stores (company, offer, pipeline, ally, task embeddings) con un top-K razonable (ej. 8 por store), armar un bloque de **CONTEXTO** estructurado por sección y meterlo en el system prompt.
- Conservar historial de la conversación (últimos N turnos) para continuidad.
- Modelo: `gpt-5.4-mini` directo a OpenAI con `OPENAI_API_KEY`. Sin Lovable AI.

**Nuevas/conservadas tools — solo acciones:**
- `create_task(company_name, title, description?, due_date, assigned_to?)`
- `complete_task(task_id_or_title, company_name)`
- `create_milestone(company_name, type, title, description?, date)`
- `log_action(company_name, type, description, date?, notes?)` — llamada, reunión, nota, etc.
- `move_pipeline(company_name, offer_name, target_stage_name)`

**Resolución de entidades para acciones:**
- Las acciones reciben `company_name` / `offer_name` como string del usuario.
- El executor server-side hace la resolución usando `find_company_by_name` y `find_offer_by_name` RPC (siguen existiendo en BD, no como tools del modelo) con threshold de similitud.
- Si hay ambigüedad o no encuentra → devuelve `executed: false` con `error` y lista de candidatos. El modelo traduce eso a una pregunta natural.
- **Caso Qash**: cuando el modelo ya mencionó en contexto previo que Qash está inscrita en Venezuela Tech Week, al pedir `move_pipeline("Qash", "Venezuela Tech Week", "Seleccionada")`, el executor resuelve fuzzy ambos nombres y verifica que existe `pipeline_entries` para ese par. Si existe → mueve. Si no existe pero la empresa sí está en otra oferta similar → devuelve candidatos. Esto resuelve la incoherencia actual.

### 2. Prompt del agente — vuelta al original con ajustes mínimos

Tono: analista del equipo de Pioneros Globales (Cámara de Comercio de Cali), responde en español natural sobre el CONTEXTO recuperado. Sin tags técnicos. Para acciones: confirma con ✅ o explica con ⚠️/❌ qué falló en lenguaje humano. Para preguntas estratégicas, razona sobre el contexto recuperado y argumenta. Si el contexto no trae lo necesario, lo dice ("No tengo registro de eso en lo que recuperé").

No se incluyen ejemplos rígidos de salida (como pidió el usuario antes).

### 3. `supabase/functions/company-chat-actions/index.ts` — mantener

Los handlers de acciones ya escriben en `company_history` con `performed_by` desde JWT y `metadata.source = "chat_agent"` (cambio v6 que sí gustó). Se mantiene tal cual. Solo se ajusta:
- `move_pipeline`: aceptar `company_name` + `offer_name` (strings) y resolver server-side con `find_company_by_name` + `find_offer_by_name`. Verificar que existe el `pipeline_entry` antes de actualizar; si no existe, devolver error claro `"X no está inscrita en Y"` con lista de ofertas donde sí está, para que el modelo proponga.
- Mismo patrón resolver-server-side para `create_task`, `complete_task`, `create_milestone`, `log_action`.

### 4. `supabase/functions/chat-router/index.ts` — simplificar o quitar

Como ya no hay paths distintos en el agente, el router pierde sentido. **Opción A**: eliminarlo. **Opción B**: mantenerlo pero solo como clasificador de intención (consulta vs acción) para decidir si el modelo debe priorizar tools o solo conversar. Recomendación: **eliminarlo** — el modelo con buen prompt distingue solo.

### 5. Asegurar que los embeddings de tareas existan

Verificar si hay `task_embeddings` o si las tareas se incluyen dentro de `company_embeddings`. Si no existen como store independiente, incluir las tareas pendientes/recientes de cada empresa dentro del chunk de contexto de empresa (ya lo hace la función `vectorize-companies`). Confirmar antes de implementar.

### 6. Pruebas que deben pasar

1. "¿Cuántas empresas en Cali?" → respuesta basada en lo recuperado por RAG (puede no ser exacto en conteos masivos, y eso está OK — el agente lo dice).
2. "Perfil de TuCash" → datos del contexto vectorial, prosa natural.
3. "¿Qué empresas están en Venezuela Tech Week en etapa Seleccionada?" → responde con lo que trae el RAG de pipeline.
4. **"Pasa a Qash de inscrita a seleccionada en Venezuela Tech Week"** → llama `move_pipeline`, executor resuelve fuzzy ambos nombres, verifica `pipeline_entries`, ejecuta, registra en `company_history`, confirma con ✅.
5. "Cuál es la más estratégica para Venezuela Tech Week" → razona sobre el contexto RAG y argumenta.
6. "Créame una tarea para TuCash de seguimiento mañana" → ejecuta, queda en timeline con el usuario de la sesión.
7. "Empresa Acme XYZ" inexistente → "No tengo registro de Acme XYZ en lo que encontré."

---

## Archivos tocados

- `supabase/functions/company-chat/index.ts` — reescritura: RAG-first, eliminar read-tools, mantener solo action tools, prompt original simplificado.
- `supabase/functions/company-chat-actions/index.ts` — endurecer resolución server-side de entidades en cada acción + mensajes de error con candidatos.
- `supabase/functions/chat-router/index.ts` — eliminar (o dejar como no-op).
- (No tocar) UI del chat, tablas, embeddings, `vectorize-companies`.

## Out of scope

- No cambiar embeddings ni re-vectorizar.
- No cambiar UI.
- No agregar nuevas action tools más allá de las 5 existentes.
- Cero Lovable AI — todo OpenAI directo.

