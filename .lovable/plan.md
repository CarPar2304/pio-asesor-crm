

# Company Chat v4 — Acciones reales, no solo consulta

Mantengo intacta la arquitectura actual (router 4 caminos, jerarquía de verdad, formato fijo `hybrid`, tools de lectura, panel de salud). Le agrego una capa de **acciones ejecutables** sin duplicar lógica de negocio.

---

## 1. Principio de no duplicación

Toda acción del CRM ya está implementada en el frontend (`CRMContext`, `PortfolioContext`) e incluye efectos colaterales críticos:

| Acción | Lógica actual incluye |
|---|---|
| Crear tarea | insert + notificación al asignado + `triggerVectorize` + `logHistory('task_created')` |
| Cerrar tarea | update status=completed + `triggerVectorize` + `logHistory('task_completed')` |
| Crear hito | insert + `logHistory('milestone')` |
| Registrar acción (call/meeting) | insert + `logHistory('action')` |
| Mover en pipeline | update stage_id + `triggerVectorize('pipeline')` + `logHistory('pipeline_move')` |

**Regla**: el chat NO replica esta lógica en SQL crudo. Se centraliza en una **edge function única `company-chat-actions`** que reproduce exactamente la misma secuencia (insert + notificación + history + vectorize), garantizando que el resultado sea **indistinguible** de hacerlo desde la UI.

Esto evita: timelines inconsistentes, embeddings desactualizados, notificaciones perdidas, tareas que no aparecen en `get_overdue_tasks`.

---

## 2. Router ampliado — 4 modos de operación

El `chat-router` actual clasifica `exact | semantic | hybrid | clarify`. Lo extiendo con un **eje ortogonal de operación**:

```json
{
  "operation": "query | action | mixed | clarify",
  "path": "exact | semantic | hybrid | clarify",   // solo aplica si operation incluye query
  "intent": "...",
  "actions_intent": [
    { "kind": "create_task | complete_task | create_milestone | log_action | move_pipeline",
      "confidence": 0.0-1.0,
      "missing_fields": [] }
  ],
  "entities": { ... },
  "evidence_level": "...",
  "clarification_question": null,
  "rewritten_query": "..."
}
```

| operation | Cuándo | Comportamiento |
|---|---|---|
| `query` | Solo pregunta. | Igual que hoy. |
| `action` | Solo ejecuta. | Resuelve entidades → confirma si falta algo → ejecuta vía `company-chat-actions` → confirma con tag `[Ejecutado]`. |
| `mixed` | Pregunta + ejecuta en un mismo turno. | Primero query (formato fijo hybrid si aplica), luego acción, luego confirmación. |
| `clarify` | Ambigüedad fuerte (empresa, etapa, fecha, o consulta vs acción). | Pregunta antes de ejecutar. Nunca actúa. |

**Disparadores típicos** (el LLM del router los detecta, no regex):
- Verbos imperativos: *crea, agrega, mueve, pasa, marca, cierra, registra, anota*.
- Frases híbridas: *"qué pasó con X y créame una tarea para retomar"*.

---

## 3. Catálogo de action-tools (nuevas)

Mismo contrato de envoltura que las tools de lectura, pero con `mutation: true`:

```json
{
  "tool": "create_task",
  "mutation": true,
  "executed": true,
  "result": { "task_id": "...", "company_id": "...", "title": "...", "due_date": "..." },
  "side_effects": ["history:task_created", "vectorize:companies", "notification:user_xyz"],
  "warnings": [],
  "ambiguity": null,
  "timestamp": "ISO"
}
```

| Tool | Reutiliza | Inputs mínimos | Validaciones |
|---|---|---|---|
| `create_task` | `CRMContext.addTask` | `company_id`, `title`, `due_date` | empresa existe; due_date válido; `assigned_to` opcional resuelto por nombre |
| `complete_task` | `CRMContext.updateTask({status:'completed'})` | `task_id` o (`company_id` + match por título) | tarea existe, no completada ya |
| `create_milestone` | `CRMContext.addMilestone` | `company_id`, `type`, `title`, `date` | type ∈ enum válido |
| `log_action` | `CRMContext.addAction` | `company_id`, `type` (call/meeting/...), `description`, `date` | type ∈ enum válido |
| `move_pipeline` | `PortfolioContext.moveCompanyToStage` | `company_id` + `offer_id` (resolver entry_id), `target_stage_id` (resolver por nombre) | la empresa está en esa oferta; etapa pertenece a la oferta |

Cada executor llama a la edge function `company-chat-actions` que hace **exactamente** la misma secuencia que el contexto del frontend (inserts + `company_history` + `notifications` + invocación a `vectorize-companies`/`vectorize-pipeline`).

---

## 4. Reglas de comportamiento del LLM (system prompt extendido)

Se añaden estas reglas al prompt actual, sin tocar las existentes:

1. **Distinguir consulta vs acción**: si `operation = query`, prohibido llamar action-tools. Si `operation = action`, solo se llama una tool de lectura para **resolver IDs** (ej. `find_company_by_name`), nunca para componer una respuesta narrativa.
2. **Confirmación implícita vs explícita**: 
   - Acciones de bajo riesgo (`create_task`, `log_action`, `create_milestone`) → ejecutar directo si no hay ambigüedad.
   - Acciones de alto impacto (`move_pipeline`, `complete_task`) → si el router marca `confidence < 0.8` o falta cualquier `missing_field`, **preguntar primero** ("¿Confirmas mover *Acme* de **Diagnóstico** a **Negociación** en la oferta *Aceleración 2026*?").
3. **Resolución de entidades antes de actuar**: empresa, etapa, oferta, asignado deben pasar por `find_company_by_name` / lookup de taxonomía. Si hay `ambiguity`, no ejecutar — devolver lista y preguntar.
4. **Datos mínimos faltantes**: si falta `due_date` en una tarea, o `target_stage_id` en un movimiento, preguntar (no inventar fechas como "mañana" sin que el usuario lo diga).
5. **Trazabilidad obligatoria en respuesta**: toda acción ejecutada se cierra con un bloque:
   ```
   ### Acciones ejecutadas
   - ✅ [Ejecutado] Tarea creada: "Llamar a Juan" para Acme S.A.S. — vence 2026-04-25 — asignada a ti.
   - ✅ [Ejecutado] Acme S.A.S. movida a Negociación en Aceleración 2026.
   ```
   y termina con `Nivel de evidencia` como hoy.
6. **Modo mixed**: el formato es `query block` (con su formato fijo si es hybrid) + separador + `### Acciones ejecutadas`.
7. **Si una acción falla** (RLS, validación, conflicto): declarar el error, no esconderlo, no re-intentar silenciosamente.

---

## 5. Garantías de consistencia inmediata

Para que `"¿en qué etapa está Acme?"` justo después de `"pásala a negociación"` devuelva el dato nuevo:

- La edge function `company-chat-actions` hace los inserts/updates **y espera confirmación** antes de responder al chat.
- `company-chat` siempre lee con queries frescas (no hay caché propio: cada turno consulta tablas).
- El frontend (`ChatBubble`) ya recarga `CRMContext.refresh()` y `PortfolioContext` al detectar `side_effects` en la respuesta del chat → invalida los datos en la UI sin recargar la página.
- `triggerVectorize` se dispara para que las consultas semánticas posteriores también reflejen el cambio (con el sistema de hash incremental ya en producción, esto es barato).

---

## 6. Trazabilidad obligatoria

Toda mutación pasa por `logHistory()` (tabla `company_history`) con el mismo `event_type` que usa la UI:
- `task_created`, `task_completed`, `milestone`, `action`, `pipeline_move`.

Adicionalmente, la tabla `chat_retrieval_logs` (ya existente) se extiende con dos campos:
- `actions_executed jsonb` — lista de tools de mutación ejecutadas con sus IDs resultantes.
- `actions_failed jsonb` — fallidas con motivo.

Esto permite al admin auditar desde el `ChatHealthPanel` qué hace el chat, no solo qué responde.

---

## 7. No regresión — qué NO se toca

- Tools de lectura existentes (9 tools): sin cambios.
- Formato fijo hybrid, política de vacío (4 casos), jerarquía de verdad: intactos.
- UI del chat (`ChatBubble`, `ChatMessageList`, persistencia, streaming): sin cambios funcionales; solo añade refetch tras `side_effects`.
- Panel admin de prompt y modelo: intacto.
- `chat-router` actual: extendido (campos nuevos), no reemplazado. Si el router falla devolviendo los nuevos campos, el chat opera en modo `query` puro como hoy (fallback seguro).

---

## 8. Manejo de ambigüedad — matriz de decisión

| Situación | Decisión |
|---|---|
| Empresa no resuelta o ambigua (`find_company_by_name.ambiguity`) | Pedir aclaración con candidatos. No ejecutar. |
| Etapa destino no existe en la oferta | Listar etapas válidas de esa oferta y preguntar. |
| Empresa no está en la oferta mencionada | Decirlo y ofrecer agregarla (acción explícita aparte). |
| Tarea a cerrar: múltiples coinciden por título | Listar y preguntar cuál. |
| Falta `due_date` en `create_task` | Preguntar fecha. No asumir "mañana". |
| Mensaje borderline ("¿le creo una tarea?" como pregunta) | `clarify` con: "¿Quieres que la cree ahora?" |
| Mensaje compuesto sin separador claro | Tratar como `mixed` solo si ambas partes son inequívocas; si no, `clarify`. |

---

## 9. Mesa de pruebas — 9 escenarios mínimos

| # | Mensaje | operation | path | Tools | Respuesta esperada |
|---|---|---|---|---|---|
| 1 | "¿Qué tareas tiene Acme?" | query | exact | `find_company_by_name` → `get_overdue_tasks(company_id)` + lectura tareas | Lista de tareas. Sin acciones. |
| 2 | "Créame una tarea para llamar a Acme mañana" | action | — | `find_company_by_name` → `create_task` | "✅ Tarea creada: 'Llamar a Acme' — vence 2026-04-21." |
| 3 | "Pasa a Acme a negociación" (única oferta donde está) | action | — | `find_company_by_name` → `get_pipeline_state` (resuelve entry+oferta) → `move_pipeline` | "✅ Acme movida de **Diagnóstico** a **Negociación** en Aceleración 2026." |
| 4 | "Pasa a Acme a negociación" (en 2 ofertas distintas) | clarify | — | `find_company_by_name` → `get_pipeline_state` → ambiguity | "Acme está en 2 ofertas. ¿En cuál? - Aceleración 2026 - Mentoría Q2" |
| 5 | "¿En qué etapa va Acme?" | query | exact | `find_company_by_name` → `get_pipeline_state` | Estado actual con [Pipeline]. |
| 6 | "Muévela a diagnóstico y deja una nota de seguimiento" | action (compuesta) | — | `move_pipeline` + `log_action(type=other, description=nota)` | 2 líneas en `### Acciones ejecutadas`. |
| 7 | "Qué ha pasado con Acme y crea una tarea para retomar contacto" | mixed | hybrid | `get_company_timeline` + `search_semantic` (consulta) → `create_task` (acción) | Bloque hybrid completo + `### Acciones ejecutadas`. |
| 8 | "Marca como hecha la tarea de la propuesta de Acme" (varias coinciden) | clarify | — | `find_company_by_name` → buscar tareas con "propuesta" → ambiguity | Lista de tareas candidatas y pregunta cuál. |
| 9 | "Registra que tuvimos una reunión con el CEO de Acme ayer" | action | — | `find_company_by_name` → `log_action(type=meeting, date=ayer)` | "✅ Reunión registrada para Acme — 2026-04-19." |

Después de #2, ejecutar #1 debe mostrar la tarea recién creada. Después de #3, ejecutar #5 debe mostrar **Negociación**. Esto es la prueba de consistencia inmediata.

---

## 10. Orden de ejecución

1. **Extender `chat-router`**: agregar `operation` y `actions_intent` al tool schema. Sin romper consumidores actuales (campos opcionales con defaults).
2. **Crear edge function `company-chat-actions`**: 5 endpoints internos (create_task, complete_task, create_milestone, log_action, move_pipeline) que replican exactamente la secuencia de `CRMContext`/`PortfolioContext`. Validación con Zod. Auth por JWT del usuario que invoca el chat.
3. **Extender `company-chat`**: registrar las 5 nuevas tools, agregar reglas al system prompt, ramificar ejecución según `operation`, componer bloque `### Acciones ejecutadas`, escribir `actions_executed` en `chat_retrieval_logs`.
4. **Frontend `ChatBubble`**: detectar `side_effects` o `actions_executed` en la respuesta y disparar `CRMContext.refresh()` + `PortfolioContext.refresh()` para que la UI refleje el cambio sin recargar.
5. **Migración mínima de DB**: agregar `actions_executed jsonb`, `actions_failed jsonb` a `chat_retrieval_logs`. Sin más cambios de schema.
6. **Panel `ChatHealthPanel`**: nueva pestaña "Acciones" con conteo por tipo, tasa de éxito y últimas 50 acciones ejecutadas.
7. **Pruebas end-to-end** de los 9 escenarios.

---

## Out of scope (para próximas iteraciones)

- Acciones destructivas (`delete_task`, `delete_company`, `remove_pipeline_entry`).
- Edición masiva (mover varias empresas en un turno).
- Crear contactos / empresas nuevas desde chat.
- Asignación inteligente por carga de trabajo.

