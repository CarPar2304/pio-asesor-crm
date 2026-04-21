

# Company Chat v6 — Analista humano, sin andamiaje, con trazabilidad completa

## Decisión arquitectónica

Mantenemos **RAG + Tools**. Lo que cambia es la voz, el formato, el razonamiento y la trazabilidad. **Modelo: `gpt-5.4-mini` sin reasoning**, vía OpenAI directo con `OPENAI_API_KEY` (cero Lovable AI). Router queda en `gpt-5-nano` (suficiente para clasificar, ya funciona bien al 90%).

---

## Cambios

### 1. Prompt nuevo de `company-chat` — voz humana, sin pistas técnicas

Reescritura completa del system prompt con estos principios (NO con ejemplos rígidos de salida; el modelo debe razonar el formato según la pregunta):

**a) Persona**
- Eres un analista del equipo de Pioneros Globales (Cámara de Comercio de Cali). Hablas como una persona del equipo, no como un sistema. Claro, breve, español natural.

**b) Lista negra (PROHIBIDO escribir literalmente)**
- Etiquetas tipo `[CRM]`, `[Pipeline]`, `[Tareas]`, `[Contexto]`, `[Histórico]`, `[Semántico]`.
- Frases tipo "Nivel de evidencia", "evidencia parcial/full", "se consultó contexto semántico", "según el RAG", "según las tools".
- Nombres de tools (`find_offer_by_name`, `list_companies`, `search_semantic`, etc.), términos técnicos (`pg_trgm`, `embedding`, `envelope`, `router`, `intent`).
- Si la evidencia es parcial, lo dice en español llano ("No tengo registro de…", "Solo encontré información parcial sobre…").

**c) Principios de formato (no plantillas fijas)**
- Markdown limpio: tablas GFM cuando hay listas comparables, negrillas para nombres y cifras, títulos `###` solo si aportan.
- Para datos tabulares (varias empresas, varias ofertas, varias tareas): tabla con columnas relevantes a la pregunta.
- Para una sola entidad: prosa estructurada con lo más importante arriba.
- Contactos: cada contacto en una sola línea con todos los campos disponibles separados por `·`; los faltantes se omiten (no se rellenan con "N/A" ni con `—` para todos; el modelo decide si poner guion o nada según contexto). El objetivo es **consistencia entre respuestas**, no rigidez en el separador.
- Confirmaciones de acción: una línea con `✅` cuando se ejecuta, `⚠️` cuando falta info, `❌` cuando falla.

**d) Pensamiento estratégico**
- Cuando la pregunta es interpretativa ("la más estratégica", "cuál priorizar", "cuál cuadra mejor"): NO respondas con un solo registro literal. Trae múltiples candidatos con sus señales (ventas, etapa, vertical, hitos, antigüedad), pondéralas, recomienda con argumento explícito. Si te falta información para decidir bien, dilo y sugiere qué mirar.

**e) Vacíos en lenguaje humano**
- "No tengo a *X* en el CRM." / "¿Te refieres a *A*, *B* o *C*?" / "Tengo a *X* pero todavía no hay contactos cargados." Sin tags.

**f) Acciones (resolver → confirmar → ejecutar → confirmar éxito/fallo)**
- Resolver entidad (empresa/oferta) primero. Si hay ambigüedad → preguntar.
- Si falta campo obligatorio (fecha, título) → preguntar en lenguaje natural ("¿Para cuándo la quieres?"), NO inventar.
- Ejecutar y confirmar en una línea. Si la tool devuelve `executed: false` o error, decir EXACTAMENTE qué falló, no fingir éxito.

**g) Eliminar la sección "FORMATO FIJO HYBRID"** que obligaba `### Estado actual / ### Histórico / ### Contexto / ### Nivel de evidencia` — esa es la fuente del problema visual.

### 2. Modelo y conexión

- `gpt-5.4-mini` sin reasoning, llamado directo a `https://api.openai.com/v1/chat/completions` con `OPENAI_API_KEY` (ya está así).
- Migración de datos en `feature_settings` `company_chat`: `model: "gpt-5.4-mini"`, `reasoningEffort: "none"` (o quitar el campo). Tool `insert` (no migración de schema).

### 3. Trazabilidad — toda acción del agente queda en el timeline

Hoy las acciones del agente (`create_task`, `create_milestone`, `log_action`, `move_pipeline`, `complete_task`) NO escriben en `company_history`. Las acciones manuales sí lo hacen vía `logHistory` desde el frontend. Resultado: el timeline omite lo que hace el chat.

**Cambio en `supabase/functions/company-chat-actions/index.ts`** (cada handler de mutación):
- Después de cada mutación exitosa, insertar fila en `company_history` con:
  - `company_id`: la empresa afectada.
  - `event_type`: `task_created` | `task_completed` | `milestone_created` | `action_logged` | `pipeline_moved` (mismos valores que usa la UI).
  - `title`: descripción humana ("Tarea creada: «Llamar a Juan»", "Movida a etapa Seleccionados en Venzuela Tech Week", etc.).
  - `description`: detalle relevante.
  - `metadata`: `{ source: "chat_agent", ...campos de la mutación }`.
  - `performed_by`: `auth.uid()` extraído del JWT del request (la edge function ya recibe el token del cliente; lo decodificamos para obtener el user id). Esto cumple "asociado al usuario de la sesión".

**Detalle técnico**: la edge function debe leer `Authorization: Bearer <jwt>` del request, crear el cliente de Supabase con ese token (no service role para esta inserción) o pasar el `user_id` extraído como `performed_by` usando service role. Patrón: usar `supabase.auth.getUser(token)` para obtener el id real, luego insertar con service role pasando `performed_by` explícito.

**Eventos cubiertos**:
| Acción del chat | Evento en historial |
|---|---|
| `create_task` | `task_created` |
| `complete_task` | `task_completed` |
| `create_milestone` | `milestone_created` |
| `log_action` (llamada, reunión, nota) | `action_logged` con tipo en metadata |
| `move_pipeline` | `pipeline_moved` con etapa origen/destino |

### 4. Heterogeneidad de contactos — corrección de raíz

El tool `get_company_contacts` ya devuelve campos estructurados, pero el prompt anterior dejaba al modelo decidir cuántos campos mostrar. **Regla nueva en el prompt** (sin ejemplo rígido): "Cuando muestres un contacto, incluye SIEMPRE todos los campos disponibles que tengas en el envelope (nombre, cargo, email, teléfono). Si un campo está vacío en la fuente, omítelo de la línea — no lo inventes ni pongas placeholder. Mantén el mismo orden y separador en toda la respuesta y entre respuestas."

Esto resuelve el problema sin convertir el agente en plantilla.

### 5. Razonamiento estratégico real

Regla en el prompt: "Para preguntas interpretativas, llama a las tools necesarias para obtener un universo de candidatos + señales. Razona sobre los datos que recibiste antes de responder. La respuesta debe contener: (i) qué interpretaste de la pregunta, (ii) qué señales miraste, (iii) tu recomendación con nombre(s) y argumentos basados en datos del CRM, (iv) qué te falta para tener más certeza si aplica. Nunca respondas a una pregunta interpretativa con un solo lookup literal."

Sin plantilla fija de cuántos párrafos ni qué orden — el modelo razona.

### 6. Acciones que fallan (caso "crear tarea")

Reforzar en el executor de `create_task`: si llega sin `due_date` o con fecha inválida, devolver `{ executed: false, error: "missing_due_date", message: "Falta la fecha de vencimiento." }`. El prompt manda traducir esos errores a una pregunta natural al usuario en vez de reintentar inventando.

### 7. Router — sin cambios de modelo

`gpt-5-nano` se queda. Solo verificar que el intent `catalogo_ofertas` (ya agregado) esté bien detectado.

---

## Archivos tocados

- `supabase/functions/company-chat/index.ts` — reescritura del system prompt (eliminar formato fijo hybrid + añadir lista negra, principios de formato, razonamiento estratégico, regla de contactos, política de errores).
- `supabase/functions/company-chat-actions/index.ts` — añadir `logHistory` server-side en cada handler de mutación, con `performed_by` resuelto desde el JWT.
- Tool `insert` para actualizar `feature_settings` → `gpt-5.4-mini` sin reasoning.
- (No tocar) `chat-router`, UI del chat, `company_history` schema, lógica de mutaciones.

---

## Pruebas que deben pasar (curl directo)

1. "¿Cuántas empresas hay en Cali?" → conteo limpio, sin tags ni "evidencia".
2. "Perfil de TuCash" → prosa estructurada con datos clave, contacto principal con todos los campos disponibles.
3. "Contacto principal de TuCash, de Crehana y de Truora" → MISMO formato en los tres (mismo orden de campos, mismo separador).
4. "Lista las ofertas" → tabla limpia, sin `[CRM]`.
5. **"Cuál es la empresa más estratégica para Venezuela Tech Week"** → análisis razonado: candidatos + señales + recomendación argumentada + qué le falta.
6. "Créame una tarea para TuCash de seguimiento la próxima semana" → si "próxima semana" es ambiguo, pregunta fecha exacta; con fecha clara ejecuta y confirma. **Verifica en `company_history` de TuCash que aparece `task_created` con `performed_by` = usuario de la sesión y `metadata.source = "chat_agent"`.**
7. "Mueve TuCash a Seleccionados en Venzuela Tech Week" → ejecuta + entrada en `company_history` con `pipeline_moved`.
8. "Empresa Acme XYZ" inexistente → "No tengo a *Acme XYZ* en el CRM." sin tags.
9. Pregunta vaga "Cuéntame sobre Tech" → pide aclaración con candidatos (sin nombrar tools).

---

## Out of scope

- No cambiar UI del chat.
- No agregar tools nuevas.
- No re-vectorizar.
- No cambiar el router (queda con `gpt-5-nano` minimal — clasifica bien).
- No usar Lovable AI bajo ninguna circunstancia (todo OpenAI directo con `OPENAI_API_KEY`).

