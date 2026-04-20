// ============================================================
// company-chat — Hybrid CRM assistant
// ============================================================
// Architecture:
//   1. Router classifies user turn → exact | semantic | hybrid | clarify
//   2. Tools (function calling) execute based on path:
//        - exact   → SQL tools only
//        - semantic→ search_semantic only (marked as context, not fact)
//        - hybrid  → SQL identity + RAG narrative (fixed-format reply)
//        - clarify → ask the user before answering
//   3. LLM final composes answer respecting truth hierarchy.
//
// Truth hierarchy (system prompt enforces it):
//   1. Exact CRM data (SQL tools)
//   2. Current state (pipeline_state, open tasks)
//   3. History (history events, closed actions/tasks)
//   4. Semantic context — narrative support only, NEVER as fact
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import OpenAI from "npm:openai@4.96.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ISO = () => new Date().toISOString();
function envelope(tool: string, partial: any) {
  return {
    tool,
    filters_applied: partial.filters_applied || {},
    total: partial.total ?? (Array.isArray(partial.results) ? partial.results.length : 0),
    results: partial.results ?? [],
    truncated: !!partial.truncated,
    timestamp: ISO(),
    warnings: partial.warnings || [],
    ambiguity: partial.ambiguity || null,
  };
}

// ============================================================
// READ TOOLS (existing — unchanged behavior)
// ============================================================
const READ_TOOLS = [
  {
    type: "function",
    function: {
      name: "find_company_by_name",
      description: "Resuelve un nombre/alias de empresa a candidatos del CRM usando búsqueda aproximada (pg_trgm). Devuelve ambigüedad si no hay un ganador claro.",
      parameters: {
        type: "object",
        properties: { name: { type: "string" }, limit: { type: "integer", default: 5 } },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_company_profile",
      description: "Devuelve SOLO identidad, taxonomía, financiero, descripción, ciudad, web. NO incluye contactos.",
      parameters: { type: "object", properties: { company_id: { type: "string" } }, required: ["company_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_company_contacts",
      description: "Devuelve SOLO la lista de contactos de una empresa (con primario destacado).",
      parameters: { type: "object", properties: { company_id: { type: "string" } }, required: ["company_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_companies",
      description: "Lista empresas filtradas. Usar para 'todas las EBT en Cali', 'empresas de la oferta X en etapa Y'.",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string" }, vertical: { type: "string" }, sub_vertical: { type: "string" },
          category: { type: "string" }, offer: { type: "string" }, stage: { type: "string" },
          limit: { type: "integer", default: 100 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "count_companies",
      description: "Conteo exacto de empresas con filtros.",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string" }, vertical: { type: "string" }, sub_vertical: { type: "string" },
          category: { type: "string" }, offer: { type: "string" }, stage: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pipeline_state",
      description: "Posiciones actuales en pipeline. Filtrable por empresa, oferta o etapa.",
      parameters: {
        type: "object",
        properties: { company_id: { type: "string" }, offer: { type: "string" }, stage: { type: "string" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_overdue_tasks",
      description: "Tareas vencidas (due_date < hoy y status != completed).",
      parameters: {
        type: "object",
        properties: {
          company_id: { type: "string" }, assigned_to_name: { type: "string" }, limit: { type: "integer", default: 50 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_company_timeline",
      description: "Eventos cronológicos del histórico de una empresa (acciones, hitos, tareas, movimientos de pipeline, notas).",
      parameters: {
        type: "object",
        properties: {
          company_id: { type: "string" }, limit: { type: "integer", default: 30 },
          since: { type: "string", description: "ISO date — solo eventos posteriores" },
        },
        required: ["company_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_semantic",
      description: "Búsqueda semántica sobre chunks. ÚSALO SOLO para contexto/narrativa, NUNCA para hechos exactos. Marca la respuesta como contexto.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          chunk_types: {
            type: "array", items: { type: "string", enum: ["profile", "financials", "contact", "action", "milestone", "task", "pipeline", "history"] },
          },
          company_ids: { type: "array", items: { type: "string" } },
          limit: { type: "integer", default: 10 },
        },
        required: ["query"],
      },
    },
  },
];

// ============================================================
// ACTION TOOLS (new — mutations via company-chat-actions)
// ============================================================
const ACTION_TOOLS = [
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Crea una tarea para una empresa. Replica EXACTAMENTE la lógica del CRM (notificación + history + vectorize). Requiere company_id resuelto y due_date explícita (NO inventes fechas).",
      parameters: {
        type: "object",
        properties: {
          company_id: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          due_date: { type: "string", description: "YYYY-MM-DD" },
          assigned_to: { type: "string", description: "user_id (opcional, default = quien escribe)" },
          offer_id: { type: "string" },
        },
        required: ["company_id", "title", "due_date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_task",
      description: "Marca una tarea como completada. Usa el task_id exacto (resuélvelo previamente con get_overdue_tasks o get_company_timeline).",
      parameters: {
        type: "object",
        properties: { task_id: { type: "string" } },
        required: ["task_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_milestone",
      description: "Registra un hito de la empresa. type ∈ {capital, new-markets, alliances, awards, other}.",
      parameters: {
        type: "object",
        properties: {
          company_id: { type: "string" },
          type: { type: "string", enum: ["capital", "new-markets", "alliances", "awards", "other"] },
          title: { type: "string" },
          description: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD; default hoy" },
        },
        required: ["company_id", "type", "title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_action",
      description: "Registra una acción/interacción con la empresa (call, meeting, email, mentoring, diagnostic, routing, other). Equivalente a 'agregar acción' en la UI.",
      parameters: {
        type: "object",
        properties: {
          company_id: { type: "string" },
          type: { type: "string", enum: ["call", "meeting", "email", "mentoring", "diagnostic", "routing", "other"] },
          description: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD; default hoy" },
          notes: { type: "string" },
        },
        required: ["company_id", "type", "description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "move_pipeline",
      description: "Mueve una empresa a otra etapa de pipeline dentro de UNA oferta. Requiere target_stage_id resuelto y entry_id (o company_id+offer_id). Si la empresa está en varias ofertas, el modelo DEBE preguntar primero a cuál se refiere.",
      parameters: {
        type: "object",
        properties: {
          entry_id: { type: "string" },
          company_id: { type: "string" },
          offer_id: { type: "string" },
          target_stage_id: { type: "string" },
        },
        required: ["target_stage_id"],
      },
    },
  },
];

const TOOLS = [...READ_TOOLS, ...ACTION_TOOLS];
const ACTION_TOOL_NAMES = new Set(ACTION_TOOLS.map((t) => t.function.name));

// ============================================================
// SYSTEM PROMPT — behavior rules
// ============================================================
function buildSystemPrompt(routerOutput: any, taxonomy: any, customAddition: string) {
  const today = new Date().toISOString().split("T")[0];
  const tax = `TAXONOMÍA del CRM:
- Categorías: ${(taxonomy.categories || []).join(", ") || "-"}
- Verticales: ${(taxonomy.verticals || []).join(", ") || "-"}
- Sub-verticales: ${(taxonomy.subVerticals || []).join(", ") || "-"}
- Ciudades: ${(taxonomy.cities || []).join(", ") || "-"}`;

  const router = `ROUTER OUTPUT (clasificación previa de esta pregunta):
- path: ${routerOutput.path}
- intent: ${routerOutput.intent}
- entities: ${JSON.stringify(routerOutput.entities || {})}
- evidence_level (preliminar): ${routerOutput.evidence_level}
${routerOutput.clarification_question ? `- clarification_question: ${routerOutput.clarification_question}` : ""}`;

  return `Eres el asistente del CRM "Pioneros Globales" (Cámara de Comercio de Cali).
Hoy es ${today}.

${tax}

${router}

═══ JERARQUÍA DE VERDAD (REGLA MAESTRA) ═══
1. DATOS EXACTOS DEL CRM (tools SQL) — única fuente válida para hechos.
2. ESTADO ACTUAL (pipeline_state, tareas abiertas) — siempre marcado como "actual".
3. HISTÓRICO (timeline, eventos pasados) — siempre con fecha y marcado como "histórico".
4. CONTEXTO SEMÁNTICO (search_semantic) — APOYO NARRATIVO, NUNCA fuente de hechos.

═══ COMPORTAMIENTO POR CAMINO ═══
- exact   → SOLO tools SQL. Si una tool exacta devuelve total=0, declara uno de los 4 casos de vacío. Nunca rellenes con search_semantic.
- semantic→ SOLO search_semantic. Inicia la respuesta con: "Esto es contexto recuperado, no necesariamente el estado actual." Marca cada hallazgo con [Contexto].
- hybrid  → Combina SQL (identidad/estado/historial) + search_semantic (matices). Usa el FORMATO FIJO obligatorio (ver abajo).
- clarify → NO respondas el contenido. Haz UNA pregunta breve para desambiguar usando "clarification_question" como guía.

═══ POLÍTICA DE VACÍO Y AMBIGÜEDAD (4 casos, NO confundirlos) ═══
A. NO EXISTE: find_company_by_name → total=0 sin candidatos. → "No encontré ninguna empresa llamada *X* en el CRM."
B. NO HAY COINCIDENCIA CONFIABLE: ambiguity != null. → Lista candidatos y pregunta cuál es. NO elijas tú.
C. EXISTE PERO SIN DATOS EN ESE FRENTE: empresa resuelta pero la tool específica devuelve total=0. → "*Acme S.A.S.* existe en el CRM, pero no tiene [contactos / tareas / …] registrados."
D. AMBIGÜEDAD DE LA PREGUNTA: la pregunta misma no tiene filtro o periodo claro. → pregunta breve.

═══ FORMATO FIJO PARA RESPUESTAS HYBRID (obligatorio) ═══
### Estado actual
[Hechos vigentes con tag de fuente: [CRM] [Pipeline] [Tareas]. Si vacío, declárelo.]

### Histórico relevante
[Eventos pasados desc por fecha. Cada uno con [Histórico AAAA-MM-DD]. Si vacío, declárelo.]

### Contexto / observaciones
[Síntesis basada en search_semantic. Tag [Contexto]. Si vacío, omite la sección y declárelo.]

### Nivel de evidencia
[full | partial | none] — [breve justificación: qué se encontró completo, qué falta, qué se infirió.]

═══ REGLAS DE ORO ═══
1. NUNCA aproximes datos exactos. Tool exacta vacía = declarar caso A/B/C.
2. NUNCA elijas un candidato cuando find_company_by_name devuelve ambiguity. Pregunta.
3. SIEMPRE separa estado actual de histórico (en hybrid usa el formato fijo).
4. SIEMPRE cita fuente por bloque: [CRM], [Pipeline], [Tareas], [Histórico fecha], [Contexto].
5. NUNCA infieras un dato de empresa A a partir de empresa B.
6. SIEMPRE termina con una línea explícita "Nivel de evidencia: full|partial|none — …".
7. Para path=semantic: la primera línea DEBE ser el disclaimer de contexto.

═══ FORMATO ═══
- Markdown. Tablas GFM válidas (separador único |).
- Negrillas para cifras y nombres de empresa.
- Conciso pero completo.

${customAddition ? `\nINSTRUCCIONES ADICIONALES DEL ADMINISTRADOR:\n${customAddition}` : ""}`;
}

// ============================================================
// TOOL EXECUTORS
// ============================================================
function buildExecutors(supabase: any, openai: OpenAI, embeddingModel: string) {
  const profileMapPromise = supabase.from("profiles").select("user_id, name").then((r: any) => new Map((r.data || []).map((p: any) => [p.user_id, p.name])));

  async function findCompany(name: string, limit = 5) {
    const { data, error } = await supabase.rpc("find_company_by_name", { _name: name, _limit: limit });
    if (error) return envelope("find_company_by_name", { warnings: [error.message] });
    const rows = data || [];
    let ambiguity: any = null;
    if (rows.length === 0) {
      // No matches at all
    } else if (rows.length === 1 && rows[0].similarity >= 0.4) {
      // clear winner
    } else {
      const top = rows[0];
      const second = rows[1];
      const isLowConfidence = top.similarity < 0.4;
      const isClose = second && (top.similarity - second.similarity < 0.1);
      if (isLowConfidence || isClose) {
        ambiguity = {
          kind: isLowConfidence ? "low_confidence" : "multiple_matches",
          candidates: rows.map((r: any) => ({ id: r.id, trade_name: r.trade_name, legal_name: r.legal_name, nit: r.nit, similarity: Number(r.similarity.toFixed(3)) })),
        };
      }
    }
    return envelope("find_company_by_name", {
      filters_applied: { name, limit },
      results: rows.map((r: any) => ({ id: r.id, trade_name: r.trade_name, legal_name: r.legal_name, nit: r.nit, similarity: Number(r.similarity.toFixed(3)), match_field: r.match_field })),
      ambiguity,
    });
  }

  async function getProfile(companyId: string) {
    const { data, error } = await supabase.from("companies")
      .select("id, trade_name, legal_name, nit, category, vertical, economic_activity, description, city, sales_by_year, sales_currency, exports_usd, website")
      .eq("id", companyId).maybeSingle();
    if (error) return envelope("get_company_profile", { warnings: [error.message] });
    if (!data) return envelope("get_company_profile", { filters_applied: { company_id: companyId }, results: [], total: 0 });
    return envelope("get_company_profile", { filters_applied: { company_id: companyId }, results: [data], total: 1 });
  }

  async function getContacts(companyId: string) {
    const { data, error } = await supabase.from("contacts").select("*").eq("company_id", companyId).order("is_primary", { ascending: false });
    if (error) return envelope("get_company_contacts", { warnings: [error.message] });
    return envelope("get_company_contacts", { filters_applied: { company_id: companyId }, results: data || [], total: data?.length || 0 });
  }

  async function listOrCount(args: any, countOnly: boolean) {
    let q = supabase.from("companies").select("id, trade_name, legal_name, nit, category, vertical, economic_activity, city", countOnly ? { count: "exact", head: true } : { count: "exact" });
    if (args.city) q = q.ilike("city", args.city);
    if (args.vertical) q = q.ilike("vertical", args.vertical);
    if (args.sub_vertical) q = q.ilike("economic_activity", args.sub_vertical);
    if (args.category) q = q.ilike("category", args.category);

    let companyIdsFilter: string[] | null = null;
    if (args.offer || args.stage) {
      let entriesQ = supabase.from("pipeline_entries").select("company_id, offer_id, stage_id, portfolio_offers!inner(name), pipeline_stages!inner(name)");
      if (args.offer) entriesQ = entriesQ.ilike("portfolio_offers.name", `%${args.offer}%`);
      if (args.stage) entriesQ = entriesQ.ilike("pipeline_stages.name", `%${args.stage}%`);
      const { data: entries, error: eErr } = await entriesQ;
      if (eErr) return envelope(countOnly ? "count_companies" : "list_companies", { warnings: [eErr.message] });
      companyIdsFilter = Array.from(new Set((entries || []).map((e: any) => e.company_id)));
      if (!companyIdsFilter.length) {
        return envelope(countOnly ? "count_companies" : "list_companies", { filters_applied: args, total: 0, results: [] });
      }
      q = q.in("id", companyIdsFilter);
    }

    if (countOnly) {
      const { count, error } = await q;
      if (error) return envelope("count_companies", { warnings: [error.message] });
      return envelope("count_companies", { filters_applied: args, total: count || 0, results: [] });
    }
    const limit = Math.min(args.limit || 100, 200);
    const { data, count, error } = await q.limit(limit);
    if (error) return envelope("list_companies", { warnings: [error.message] });
    const total = count ?? data?.length ?? 0;
    return envelope("list_companies", { filters_applied: args, total, results: data || [], truncated: total > (data?.length || 0) });
  }

  async function pipelineState(args: any) {
    const profileMap = await profileMapPromise;
    let q = supabase.from("pipeline_entries")
      .select("id, company_id, notes, assigned_to, created_at, companies!inner(trade_name, nit), portfolio_offers!inner(id, name, product, status), pipeline_stages!inner(id, name, color)");
    if (args.company_id) q = q.eq("company_id", args.company_id);
    if (args.offer) q = q.ilike("portfolio_offers.name", `%${args.offer}%`);
    if (args.stage) q = q.ilike("pipeline_stages.name", `%${args.stage}%`);
    const { data, error } = await q.limit(200);
    if (error) return envelope("get_pipeline_state", { warnings: [error.message] });
    const results = (data || []).map((r: any) => ({
      entry_id: r.id,
      company: { id: r.company_id, trade_name: r.companies?.trade_name, nit: r.companies?.nit },
      offer: { id: r.portfolio_offers?.id, name: r.portfolio_offers?.name, product: r.portfolio_offers?.product, status: r.portfolio_offers?.status },
      stage: { id: r.pipeline_stages?.id, name: r.pipeline_stages?.name },
      assigned_to: r.assigned_to ? (profileMap.get(r.assigned_to) || "Sin asignar") : "Sin asignar",
      since: r.created_at,
      notes: r.notes || "",
    }));
    return envelope("get_pipeline_state", { filters_applied: args, results, total: results.length });
  }

  async function overdueTasks(args: any) {
    const profileMap = await profileMapPromise;
    const today = new Date().toISOString().split("T")[0];
    let q = supabase.from("company_tasks")
      .select("id, title, description, due_date, status, assigned_to, company_id, offer_id, companies!inner(trade_name)")
      .lt("due_date", today).neq("status", "completed");
    if (args.company_id) q = q.eq("company_id", args.company_id);
    if (args.assigned_to_name) {
      // resolve name → user_id
      const { data: profs } = await supabase.from("profiles").select("user_id, name").ilike("name", `%${args.assigned_to_name}%`);
      const ids = (profs || []).map((p: any) => p.user_id);
      if (!ids.length) return envelope("get_overdue_tasks", { filters_applied: args, total: 0, results: [], warnings: [`No se encontró usuario "${args.assigned_to_name}"`] });
      q = q.in("assigned_to", ids);
    }
    const limit = Math.min(args.limit || 50, 200);
    const { data, error } = await q.order("due_date", { ascending: true }).limit(limit);
    if (error) return envelope("get_overdue_tasks", { warnings: [error.message] });
    const results = (data || []).map((t: any) => ({
      id: t.id, title: t.title, description: t.description, due_date: t.due_date, status: t.status,
      company: { id: t.company_id, trade_name: t.companies?.trade_name },
      assigned_to: t.assigned_to ? (profileMap.get(t.assigned_to) || "Sin asignar") : "Sin asignar",
    }));
    return envelope("get_overdue_tasks", { filters_applied: args, results, total: results.length, truncated: results.length === limit });
  }

  async function timeline(args: any) {
    const profileMap = await profileMapPromise;
    let q = supabase.from("company_history").select("*").eq("company_id", args.company_id).order("created_at", { ascending: false });
    if (args.since) q = q.gte("created_at", args.since);
    const limit = Math.min(args.limit || 30, 100);
    const { data, error } = await q.limit(limit);
    if (error) return envelope("get_company_timeline", { warnings: [error.message] });
    const results = (data || []).map((h: any) => ({
      id: h.id, event_type: h.event_type, title: h.title, description: h.description,
      date: h.created_at?.split("T")[0],
      performed_by: h.performed_by ? (profileMap.get(h.performed_by) || "Usuario") : "Sistema",
      metadata: h.metadata || {},
    }));
    return envelope("get_company_timeline", { filters_applied: args, results, total: results.length, truncated: results.length === limit });
  }

  async function semantic(args: any) {
    try {
      const emb = await openai.embeddings.create({ model: embeddingModel, input: args.query });
      const vec = JSON.stringify(emb.data[0].embedding);
      const { data, error } = await supabase.rpc("match_company_chunks", {
        query_embedding: vec,
        match_threshold: 0.3,
        match_count: Math.min(args.limit || 10, 30),
        filter_chunk_types: args.chunk_types || null,
        filter_company_ids: args.company_ids || null,
      });
      if (error) return envelope("search_semantic", { warnings: [error.message] });
      const results = (data || []).map((r: any) => ({
        company_id: r.company_id,
        chunk_type: r.chunk_type,
        chunk_key: r.chunk_key,
        similarity: Number(r.similarity.toFixed(3)),
        metadata: r.metadata,
        content: r.content,
      }));
      return envelope("search_semantic", { filters_applied: args, results, total: results.length });
    } catch (e) {
      return envelope("search_semantic", { warnings: [e instanceof Error ? e.message : "embedding error"] });
    }
  }

  return {
    find_company_by_name: (a: any) => findCompany(a.name, a.limit),
    get_company_profile: (a: any) => getProfile(a.company_id),
    get_company_contacts: (a: any) => getContacts(a.company_id),
    list_companies: (a: any) => listOrCount(a, false),
    count_companies: (a: any) => listOrCount(a, true),
    get_pipeline_state: (a: any) => pipelineState(a),
    get_overdue_tasks: (a: any) => overdueTasks(a),
    get_company_timeline: (a: any) => timeline(a),
    search_semantic: (a: any) => semantic(a),
  } as Record<string, (a: any) => Promise<any>>;
}

// ============================================================
// MAIN
// ============================================================
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const openaiKey = Deno.env.get("OPENAI_API_KEY")!;
  const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const openai = new OpenAI({ apiKey: openaiKey });

  let userIdForLog: string | null = null;
  let conversationIdForLog: string | null = null;
  let lastUserMessageForLog = "";
  let routerOutput: any = null;
  let toolsCalled: any[] = [];

  try {
    const { messages, conversation_id } = await req.json();
    if (!messages?.length) {
      return new Response(JSON.stringify({ error: "messages required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    conversationIdForLog = conversation_id || null;
    lastUserMessageForLog = [...messages].reverse().find((m: any) => m.role === "user")?.content?.trim() || "";

    // Try to capture authenticated user (best effort)
    try {
      const authHeader = req.headers.get("Authorization");
      if (authHeader?.startsWith("Bearer ")) {
        const supaAnon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") || "");
        const { data: { user } } = await supaAnon.auth.getUser(authHeader.replace("Bearer ", ""));
        userIdForLog = user?.id || null;
      }
    } catch { /* ignore */ }

    // Settings
    const { data: settingsRow } = await supabase.from("feature_settings").select("config").eq("feature_key", "company_chat").single();
    const config = (settingsRow?.config || {}) as any;
    const chatModel = config.model || "google/gemini-3-flash-preview";
    const embeddingModel = config.embeddingModel || "text-embedding-3-small";
    const customAddition = config.systemPrompt || "";

    // Taxonomy
    const [{ data: cats }, { data: verts }, { data: subVs }, { data: cities }] = await Promise.all([
      supabase.from("crm_categories").select("name"),
      supabase.from("crm_verticals").select("name"),
      supabase.from("crm_sub_verticals").select("name"),
      supabase.from("companies").select("city").not("city", "is", null),
    ]);
    const taxonomy = {
      categories: (cats || []).map((c: any) => c.name),
      verticals: (verts || []).map((v: any) => v.name),
      subVerticals: (subVs || []).map((s: any) => s.name),
      cities: Array.from(new Set((cities || []).map((r: any) => r.city).filter(Boolean))),
    };

    // ---- 1. ROUTER ----
    let routerData: any;
    try {
      const routerResp = await fetch(`${supabaseUrl}/functions/v1/chat-router`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}` },
        body: JSON.stringify({ messages: messages.slice(-4), taxonomy }),
      });
      routerData = await routerResp.json();
    } catch (e) {
      console.error("router fetch failed, fallback:", e);
      routerData = { path: "semantic", intent: "otro", entities: {}, evidence_level: "partial", rewritten_query: lastUserMessageForLog };
    }
    routerOutput = routerData;

    // ---- 2. LLM with tools ----
    const executors = buildExecutors(supabase, openai, embeddingModel);
    const systemPrompt = buildSystemPrompt(routerData, taxonomy, customAddition);

    const conversation: any[] = [{ role: "system", content: systemPrompt }, ...messages];

    // Tool-calling loop (non-stream) — up to N iterations
    const MAX_ITERS = 6;
    let iter = 0;
    let finalContent = "";

    while (iter < MAX_ITERS) {
      iter++;
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: chatModel, messages: conversation, tools: TOOLS, tool_choice: "auto" }),
      });

      if (!resp.ok) {
        const errTxt = await resp.text();
        if (resp.status === 429) {
          await logRetrieval(supabase, { conversationIdForLog, userIdForLog, lastUserMessageForLog, routerOutput, toolsCalled, evidence: "none", vacancy: null, latency: Date.now() - startTime, error: "rate_limited" });
          return new Response(JSON.stringify({ error: "Demasiadas solicitudes. Intenta de nuevo en un momento." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        if (resp.status === 402) {
          await logRetrieval(supabase, { conversationIdForLog, userIdForLog, lastUserMessageForLog, routerOutput, toolsCalled, evidence: "none", vacancy: null, latency: Date.now() - startTime, error: "payment_required" });
          return new Response(JSON.stringify({ error: "Créditos agotados en Lovable AI. Agrega fondos en Settings." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        throw new Error(`gateway ${resp.status}: ${errTxt}`);
      }

      const data = await resp.json();
      const msg = data.choices?.[0]?.message;
      if (!msg) throw new Error("empty response from gateway");

      conversation.push(msg);

      const calls = msg.tool_calls || [];
      if (!calls.length) {
        finalContent = msg.content || "";
        break;
      }

      // Execute tools (parallel)
      const results = await Promise.all(calls.map(async (tc: any) => {
        const name = tc.function?.name;
        let args: any = {};
        try { args = JSON.parse(tc.function?.arguments || "{}"); } catch { /* */ }
        const exec = executors[name];
        if (!exec) {
          return { tool_call_id: tc.id, role: "tool", name, content: JSON.stringify({ error: `unknown tool ${name}` }) };
        }
        try {
          const out = await exec(args);
          toolsCalled.push({ tool: name, args, total: out.total, ambiguity: out.ambiguity?.kind || null });
          return { tool_call_id: tc.id, role: "tool", name, content: JSON.stringify(out) };
        } catch (e) {
          toolsCalled.push({ tool: name, args, error: String(e) });
          return { tool_call_id: tc.id, role: "tool", name, content: JSON.stringify({ error: String(e) }) };
        }
      }));
      conversation.push(...results);
    }

    // Stream the final content as SSE so the client (which expects streaming) keeps working
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        // Chunk by ~60 chars to simulate streaming (final content already known)
        const text = finalContent || "_(Sin respuesta del modelo.)_";
        const CHUNK = 80;
        for (let i = 0; i < text.length; i += CHUNK) {
          const piece = text.slice(i, i + CHUNK);
          const payload = { choices: [{ delta: { content: piece } }] };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        }
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();
      },
    });

    // Fire-and-forget log
    const evidenceFinal = inferEvidence(toolsCalled, routerOutput);
    const vacancy = inferVacancy(toolsCalled);
    logRetrieval(supabase, {
      conversationIdForLog, userIdForLog, lastUserMessageForLog,
      routerOutput, toolsCalled, evidence: evidenceFinal, vacancy,
      latency: Date.now() - startTime, error: null,
    }).catch((e) => console.error("log error:", e));

    return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
  } catch (err) {
    console.error("company-chat error:", err);
    await logRetrieval(supabase, {
      conversationIdForLog, userIdForLog, lastUserMessageForLog,
      routerOutput, toolsCalled, evidence: "none", vacancy: null,
      latency: Date.now() - startTime, error: err instanceof Error ? err.message : "Unknown",
    }).catch(() => {});
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function inferEvidence(tools: any[], router: any): "full" | "partial" | "none" {
  if (router?.path === "clarify") return "partial";
  if (!tools.length) return router?.evidence_level || "partial";
  const anyAmbiguity = tools.some((t) => t.ambiguity);
  const anyTotal = tools.some((t) => (t.total ?? 0) > 0);
  const allEmpty = tools.every((t) => (t.total ?? 0) === 0);
  if (allEmpty) return "none";
  if (anyAmbiguity) return "partial";
  if (!anyTotal) return "none";
  // partial if any tool returned 0 while others returned data
  if (tools.some((t) => (t.total ?? 0) === 0)) return "partial";
  return "full";
}

function inferVacancy(tools: any[]): string | null {
  // A=no-existe, B=low confidence, C=existe sin datos, D=clarify
  const findCalls = tools.filter((t) => t.tool === "find_company_by_name");
  if (findCalls.some((t) => t.ambiguity)) return "B";
  if (findCalls.length && findCalls.every((t) => (t.total ?? 0) === 0)) return "A";
  const otherEmpty = tools.filter((t) => t.tool !== "find_company_by_name" && t.tool !== "search_semantic" && (t.total ?? 0) === 0);
  if (otherEmpty.length && findCalls.some((t) => (t.total ?? 0) > 0)) return "C";
  return null;
}

async function logRetrieval(supabase: any, p: any) {
  try {
    await supabase.from("chat_retrieval_logs").insert({
      conversation_id: p.conversationIdForLog,
      user_id: p.userIdForLog,
      user_message: p.lastUserMessageForLog || "",
      intent: p.routerOutput?.intent || null,
      path: p.routerOutput?.path || null,
      evidence_level: p.evidence,
      vacancy_case: p.vacancy,
      tools_called: p.toolsCalled || [],
      router_output: p.routerOutput || {},
      latency_ms: p.latency,
      error: p.error,
    });
  } catch (e) {
    console.error("logRetrieval failed:", e);
  }
}
