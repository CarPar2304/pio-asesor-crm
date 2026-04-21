// ============================================================
// company-chat — RAG-first analyst (v7)
// ============================================================
// Architecture:
//   1. Embed the user's last message + lightweight context.
//   2. Retrieve top-K chunks in parallel from the 4 vector stores:
//        company_embeddings, offer_embeddings, pipeline_embeddings,
//        ally_embeddings (tasks/actions/milestones live inside
//        company_embeddings as chunk_type='task' etc).
//   3. Build a single CONTEXTO block and feed it to the model.
//   4. The model answers in natural Spanish using ONLY that context.
//   5. Action tools (5 mutations) remain available; the executor
//      resolves entity names server-side (fuzzy via RPC) before
//      writing — so the model never re-queries the DB for facts.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import OpenAI from "npm:openai@4.96.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ============================================================
// ACTION TOOLS — only mutations. Entity names are passed as strings;
// the action executor resolves them server-side via fuzzy RPCs.
// ============================================================
const ACTION_TOOLS = [
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Crea una tarea para una empresa. Pasa el nombre de la empresa tal como aparece en el contexto recuperado. Requiere fecha exacta YYYY-MM-DD (NO inventes ni asumas fechas vagas como 'mañana' o 'la próxima semana' — pregunta).",
      parameters: {
        type: "object",
        properties: {
          company_name: { type: "string", description: "Nombre de la empresa (trade_name) tal como aparece en el contexto." },
          title: { type: "string" },
          description: { type: "string" },
          due_date: { type: "string", description: "YYYY-MM-DD" },
          offer_name: { type: "string", description: "Opcional: nombre de la oferta asociada." },
        },
        required: ["company_name", "title", "due_date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_task",
      description: "Marca una tarea como completada. Pasa el título de la tarea y el nombre de la empresa.",
      parameters: {
        type: "object",
        properties: {
          task_title: { type: "string" },
          company_name: { type: "string" },
        },
        required: ["task_title", "company_name"],
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
          company_name: { type: "string" },
          type: { type: "string", enum: ["capital", "new-markets", "alliances", "awards", "other"] },
          title: { type: "string" },
          description: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD; por defecto hoy" },
        },
        required: ["company_name", "type", "title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_action",
      description: "Registra una acción/interacción con la empresa (call, meeting, email, mentoring, diagnostic, routing, other).",
      parameters: {
        type: "object",
        properties: {
          company_name: { type: "string" },
          type: { type: "string", enum: ["call", "meeting", "email", "mentoring", "diagnostic", "routing", "other"] },
          description: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD; por defecto hoy" },
          notes: { type: "string" },
        },
        required: ["company_name", "type", "description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "move_pipeline",
      description: "Mueve una empresa a otra etapa dentro de una oferta del portafolio. Pasa los nombres tal cual aparecen en el contexto recuperado.",
      parameters: {
        type: "object",
        properties: {
          company_name: { type: "string" },
          offer_name: { type: "string" },
          target_stage_name: { type: "string" },
        },
        required: ["company_name", "offer_name", "target_stage_name"],
      },
    },
  },
];

const ACTION_TOOL_NAMES = new Set(ACTION_TOOLS.map((t) => t.function.name));

// ============================================================
// SYSTEM PROMPT — RAG analyst, no technical scaffolding
// ============================================================
function buildSystemPrompt(taxonomy: any, contextBlock: string, customAddition: string) {
  const today = new Date().toISOString().split("T")[0];

  return `Eres un analista del equipo de Pioneros Globales (Cámara de Comercio de Cali). Hablas como una persona del equipo: cercano, claro, directo, en español natural. Hoy es ${today}.

Conoces el CRM porque te pasan un bloque de CONTEXTO recuperado para cada pregunta. Tu trabajo es responder usando ESE contexto. No tienes manera de "consultar la base" más allá del contexto recuperado.

═══ TAXONOMÍA (úsala silenciosamente) ═══
- Categorías: ${(taxonomy.categories || []).join(", ") || "-"}
- Verticales: ${(taxonomy.verticals || []).join(", ") || "-"}
- Sub-verticales: ${(taxonomy.subVerticals || []).join(", ") || "-"}
- Ciudades: ${(taxonomy.cities || []).join(", ") || "-"}

═══ CONTEXTO RECUPERADO PARA ESTE TURNO ═══
${contextBlock || "(Sin resultados relevantes en la búsqueda)"}

═══ PROHIBICIONES ABSOLUTAS ═══
- Nunca escribas etiquetas como [CRM], [Pipeline], [Contexto], [Histórico], [Semántico], [Fuente], ni nada entre corchetes que parezca técnico.
- Nunca digas "según el contexto", "según el RAG", "según la búsqueda", "evidencia parcial/full", "nivel de evidencia", "se consultó". Habla como humano.
- Nunca menciones nombres de funciones internas, embeddings, vectores, ni cualquier término técnico de implementación.
- Si el contexto no trae lo que el usuario pide, dilo en español llano: "No tengo registro de…", "No me aparece…", "Solo veo información parcial sobre…".

═══ FORMATO (principios, no plantillas) ═══
- Markdown limpio. Negrillas para nombres de empresa y cifras.
- Tablas cuando hay varias entidades comparables; prosa cuando es una sola.
- Cifras con su unidad y moneda (COP/USD). Fechas humanas ("15 mar 2026").
- Sé conciso. No repitas la pregunta. No inventes secciones de relleno.

═══ CONTACTOS — CONSISTENCIA ═══
Si muestras un contacto, usa SIEMPRE el mismo orden y separador en toda la respuesta y entre respuestas: **Nombre** · Cargo · Email · Teléfono. Omite los campos que vengan vacíos en el contexto — no inventes ni pongas "N/A".

═══ PENSAMIENTO ESTRATÉGICO ═══
Para preguntas interpretativas ("la más estratégica", "cuál priorizar", "cuál cuadra mejor"), no respondas con un solo registro literal. Razona sobre el universo de candidatos del contexto, compara señales (vertical, ventas, etapa en pipeline, hitos, antigüedad), recomienda con argumento explícito, y di qué te falta para tener más certeza si aplica.

═══ ACCIONES (crear tarea, hito, acción, mover etapa, completar tarea) ═══
Tienes herramientas para mutar el CRM. Protocolo:
1. Si el usuario pide una acción y la empresa o la oferta están claras en el contexto recuperado, ejecuta directamente con los nombres tal como aparecen.
2. Si falta un dato obligatorio (fecha exacta, título, etapa destino), PREGUNTA en lenguaje natural. Expresiones vagas como "mañana", "la próxima semana", "pronto" son ambiguas — pide la fecha exacta.
3. Tras ejecutar, confirma en una sola línea: \`✅ Tarea «X» creada para *Empresa* con vencimiento 15 mar 2026.\` o \`✅ *Empresa* movida a «Seleccionados» en *Oferta*.\`
4. Si la herramienta devuelve un error o \`executed: false\`, traduce el motivo a español natural: \`❌ No pude moverla: *Qash* no está inscrita en *Venezuela Tech Week*. Sí aparece en: …\`. Nunca finjas éxito.
5. Para mover etapa o completar tarea (alto impacto), si tienes la mínima duda, pide confirmación antes de ejecutar.

═══ VACÍOS Y AMBIGÜEDAD ═══
- No existe la empresa en el contexto: "No tengo a *X* en lo que encontré."
- Hay varios candidatos: lista los nombres y pregunta cuál.
- La pregunta es vaga: pide UNA aclaración concreta y breve.

═══ NUNCA ═══
- Nunca inventes datos que no estén en el contexto.
- Nunca repitas la pregunta del usuario.
- Nunca uses emojis salvo \`✅ ⚠️ ❌\` en confirmaciones de acción.
${customAddition ? `\nInstrucciones adicionales del administrador:\n${customAddition}` : ""}`;
}

// ============================================================
// RAG retrieval — embed query, hit 4 stores in parallel
// ============================================================
async function retrieveContext(supabase: any, openai: OpenAI, embeddingModel: string, query: string) {
  if (!query?.trim()) return { block: "", stats: { company: 0, offer: 0, pipeline: 0, ally: 0 } };

  let vec: string;
  try {
    const emb = await openai.embeddings.create({ model: embeddingModel, input: query });
    vec = JSON.stringify(emb.data[0].embedding);
  } catch (e) {
    console.error("[rag] embedding failed", e);
    return { block: "", stats: { company: 0, offer: 0, pipeline: 0, ally: 0 } };
  }

  const [companyR, offerR, pipelineR, allyR] = await Promise.all([
    supabase.rpc("match_company_chunks", { query_embedding: vec, match_threshold: 0.25, match_count: 14 }),
    supabase.rpc("match_offers", { query_embedding: vec, match_threshold: 0.25, match_count: 8 }),
    supabase.rpc("match_pipeline", { query_embedding: vec, match_threshold: 0.25, match_count: 10 }),
    supabase.rpc("match_allies", { query_embedding: vec, match_threshold: 0.25, match_count: 6 }),
  ]);

  const companyRows: any[] = companyR.data || [];
  const offerRows: any[] = offerR.data || [];
  const pipelineRows: any[] = pipelineR.data || [];
  const allyRows: any[] = allyR.data || [];

  // Hydrate company names for company chunks
  const companyIds = Array.from(new Set(companyRows.map((r) => r.company_id).filter(Boolean)));
  const companyMap = new Map<string, string>();
  if (companyIds.length) {
    const { data } = await supabase.from("companies").select("id, trade_name").in("id", companyIds);
    (data || []).forEach((c: any) => companyMap.set(c.id, c.trade_name));
  }
  // Hydrate offer names
  const offerIds = Array.from(new Set([...offerRows.map((r) => r.offer_id), ...pipelineRows.map((r) => r.offer_id)].filter(Boolean)));
  const offerMap = new Map<string, string>();
  if (offerIds.length) {
    const { data } = await supabase.from("portfolio_offers").select("id, name").in("id", offerIds);
    (data || []).forEach((o: any) => offerMap.set(o.id, o.name));
  }
  // Hydrate ally names
  const allyIds = Array.from(new Set(allyRows.map((r) => r.ally_id).filter(Boolean)));
  const allyMap = new Map<string, string>();
  if (allyIds.length) {
    const { data } = await supabase.from("allies").select("id, name").in("id", allyIds);
    (data || []).forEach((a: any) => allyMap.set(a.id, a.name));
  }

  // Group company chunks by company for readability
  const grouped = new Map<string, any[]>();
  for (const r of companyRows) {
    const key = r.company_id || "unknown";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(r);
  }

  const sections: string[] = [];

  if (grouped.size) {
    const lines: string[] = ["## Empresas relevantes"];
    for (const [cid, chunks] of grouped) {
      const name = companyMap.get(cid) || "(empresa)";
      lines.push(`\n### ${name}`);
      // Sort: profile first, then financials, contact, action, milestone, task, pipeline, history
      const order = ["profile", "financials", "contact", "pipeline", "task", "action", "milestone", "history"];
      chunks.sort((a, b) => (order.indexOf(a.chunk_type) - order.indexOf(b.chunk_type)) || (b.similarity - a.similarity));
      for (const c of chunks.slice(0, 6)) {
        lines.push(`- (${c.chunk_type}) ${c.content}`);
      }
    }
    sections.push(lines.join("\n"));
  }

  if (offerRows.length) {
    const lines: string[] = ["## Ofertas del portafolio"];
    for (const r of offerRows.slice(0, 8)) {
      const name = offerMap.get(r.offer_id) || "(oferta)";
      lines.push(`- **${name}**: ${r.content}`);
    }
    sections.push(lines.join("\n"));
  }

  if (pipelineRows.length) {
    const lines: string[] = ["## Pipeline (estado en ofertas)"];
    for (const r of pipelineRows.slice(0, 10)) {
      const name = offerMap.get(r.offer_id) || "(oferta)";
      lines.push(`- **${name}**: ${r.content}`);
    }
    sections.push(lines.join("\n"));
  }

  if (allyRows.length) {
    const lines: string[] = ["## Aliados"];
    for (const r of allyRows.slice(0, 6)) {
      const name = allyMap.get(r.ally_id) || "(aliado)";
      lines.push(`- **${name}**: ${r.content}`);
    }
    sections.push(lines.join("\n"));
  }

  return {
    block: sections.join("\n\n"),
    stats: { company: companyRows.length, offer: offerRows.length, pipeline: pipelineRows.length, ally: allyRows.length },
  };
}

// ============================================================
// ACTION EXECUTOR — proxies into company-chat-actions edge fn
// ============================================================
function buildActionExecutor(supabaseUrl: string, authHeader: string | null) {
  return async function execAction(action: string, args: any) {
    if (!authHeader) {
      return { tool: action, mutation: true, executed: false, error: "Acción requiere usuario autenticado.", side_effects: [], result: null };
    }
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/company-chat-actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({ action, args }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok && !json?.tool) {
        return { tool: action, mutation: true, executed: false, error: json?.error || `HTTP ${resp.status}`, side_effects: [], result: null };
      }
      return json;
    } catch (e) {
      return { tool: action, mutation: true, executed: false, error: e instanceof Error ? e.message : "network error", side_effects: [], result: null };
    }
  };
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

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const openai = new OpenAI({ apiKey: openaiKey });

  let userIdForLog: string | null = null;
  let conversationIdForLog: string | null = null;
  let lastUserMessageForLog = "";
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

    // Capture authenticated user
    const authHeader = req.headers.get("Authorization");
    try {
      if (authHeader?.startsWith("Bearer ")) {
        const supaAnon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") || "");
        const { data: { user } } = await supaAnon.auth.getUser(authHeader.replace("Bearer ", ""));
        userIdForLog = user?.id || null;
      }
    } catch { /* ignore */ }

    // Settings
    const { data: settingsRow } = await supabase.from("feature_settings").select("config").eq("feature_key", "company_chat").single();
    const config = (settingsRow?.config || {}) as any;
    const VALID_OPENAI = new Set([
      "gpt-5", "gpt-5-mini", "gpt-5-nano", "gpt-5.4", "gpt-5.4-mini",
      "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "o4-mini",
    ]);
    const sanitizeModel = (m: string | undefined): string => {
      if (!m) return "gpt-5.4-mini";
      const cleaned = m.replace(/^google\//, "").replace(/^openai\//, "").trim();
      if (cleaned === "gpt-5.2-mini") return "gpt-5.4-mini";
      if (cleaned === "gpt-5.2") return "gpt-5.4";
      if (cleaned.startsWith("gemini")) return "gpt-5.4-mini";
      return VALID_OPENAI.has(cleaned) ? cleaned : "gpt-5.4-mini";
    };
    const chatModel = sanitizeModel(config.model);
    const embeddingModel = config.embeddingModel || "text-embedding-3-small";
    const customAddition = config.systemPrompt || "";

    // Taxonomy (silent hint)
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

    // ---- 1. Build retrieval query: last user message + brief recent context ----
    const recentUserTurns = messages.filter((m: any) => m.role === "user").slice(-3).map((m: any) => m.content).join(" \n ");
    const retrievalQuery = recentUserTurns || lastUserMessageForLog;
    const { block: contextBlock, stats } = await retrieveContext(supabase, openai, embeddingModel, retrievalQuery);
    console.log(`[company-chat] model=${chatModel} retrieval stats=`, stats);

    // ---- 2. LLM with action-only tools ----
    const systemPrompt = buildSystemPrompt(taxonomy, contextBlock, customAddition);
    const conversation: any[] = [{ role: "system", content: systemPrompt }, ...messages];
    const execAction = buildActionExecutor(supabaseUrl, authHeader);

    const MAX_ITERS = 4;
    let iter = 0;
    let finalContent = "";

    while (iter < MAX_ITERS) {
      iter++;
      let data: any;
      try {
        const completionParams: any = {
          model: chatModel,
          messages: conversation,
          tools: ACTION_TOOLS,
          tool_choice: "auto",
        };
        const completion = await openai.chat.completions.create(completionParams);
        data = completion;
      } catch (err: any) {
        const status = err?.status || err?.response?.status;
        const errTxt = err?.message || String(err);
        console.error("openai error", status, errTxt);
        if (status === 429) {
          return new Response(JSON.stringify({ error: "Demasiadas solicitudes. Intenta de nuevo en un momento." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        if (status === 401 || status === 403) {
          return new Response(JSON.stringify({ error: "OPENAI_API_KEY inválida o sin permisos." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        throw new Error(`openai ${status || ""}: ${errTxt}`);
      }
      const msg = data.choices?.[0]?.message;
      if (!msg) throw new Error("empty response from gateway");

      conversation.push(msg);

      const calls = msg.tool_calls || [];
      if (!calls.length) {
        finalContent = msg.content || "";
        break;
      }

      // Execute action tools (sequentially is fine — small N)
      const results = await Promise.all(calls.map(async (tc: any) => {
        const name = tc.function?.name;
        let args: any = {};
        try { args = JSON.parse(tc.function?.arguments || "{}"); } catch { /* */ }
        if (!ACTION_TOOL_NAMES.has(name)) {
          return { tool_call_id: tc.id, role: "tool", name, content: JSON.stringify({ error: `unknown tool ${name}` }) };
        }
        const out = await execAction(name, args);
        toolsCalled.push({ tool: name, args, executed: !!out.executed, error: out.error || null });
        return { tool_call_id: tc.id, role: "tool", name, content: JSON.stringify(out) };
      }));
      conversation.push(...results);
    }

    // Stream the final content as SSE so the client (which expects streaming) keeps working
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
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
    logRetrieval(supabase, {
      conversationIdForLog, userIdForLog, lastUserMessageForLog,
      retrievalStats: stats, toolsCalled,
      latency: Date.now() - startTime, error: null,
    }).catch((e) => console.error("log error:", e));

    return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
  } catch (err) {
    console.error("company-chat error:", err);
    await logRetrieval(supabase, {
      conversationIdForLog, userIdForLog, lastUserMessageForLog,
      retrievalStats: null, toolsCalled,
      latency: Date.now() - startTime, error: err instanceof Error ? err.message : "Unknown",
    }).catch(() => {});
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function logRetrieval(supabase: any, p: any) {
  try {
    await supabase.from("chat_retrieval_logs").insert({
      conversation_id: p.conversationIdForLog,
      user_id: p.userIdForLog,
      user_message: p.lastUserMessageForLog || "",
      tools_called: p.toolsCalled || [],
      router_output: p.retrievalStats ? { rag_stats: p.retrievalStats } : {},
      latency_ms: p.latency,
      error: p.error,
      operation: (p.toolsCalled || []).length ? "action" : "query",
    });
  } catch (e) {
    console.error("logRetrieval failed:", e);
  }
}
