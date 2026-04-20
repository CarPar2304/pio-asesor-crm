// ============================================================
// chat-router — classifies a user turn into:
//   - operation: query | action | mixed | clarify
//   - path:      exact | semantic | hybrid | clarify  (for the query side)
//   - actions_intent: which mutations the user is asking for
// Uses Lovable AI Gateway with tool calling for structured output.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM = `Eres un router de intención para el chat de un CRM.
Clasifica el último mensaje del usuario en dos ejes ortogonales: OPERACIÓN y CAMINO de consulta.

═══ EJE 1 — OPERATION ═══
- "query"   → El usuario solo pregunta, no pide ejecutar nada.
- "action"  → El usuario pide ejecutar una mutación (crear, mover, cerrar, registrar, agregar). Imperativos como: crea, créame, agrega, mueve, pasa, marca, cierra, resuelve, completa, registra, anota.
- "mixed"   → El mensaje contiene una pregunta Y una acción claramente diferenciables ("qué pasó con X y créame una tarea para retomar").
- "clarify" → Hay ambigüedad fuerte (no se sabe qué empresa, qué etapa, fecha, o si es consulta o acción). NO ejecutar nada.

═══ EJE 2 — PATH (solo si operation incluye query: query|mixed) ═══
- "exact"    → Hechos verificables (lista, conteo, contacto, etapa, tarea, NIT). Solo SQL.
- "semantic" → Pregunta abierta de contexto/resumen/antecedentes. RAG.
- "hybrid"   → Cruza hecho + interpretación.
- "clarify"  → Ambigüedad real en la pregunta misma.
Si operation=action, devuelve path="exact" (placeholder, no se usa para narrativa).
Si operation=clarify, devuelve path="clarify".

═══ ACTIONS_INTENT ═══
Si operation incluye una acción (action|mixed), llena actions_intent con UNA entrada por cada mutación pedida:
- kind: "create_task" | "complete_task" | "create_milestone" | "log_action" | "move_pipeline"
- confidence: 0..1 — qué tan claro está el intent (1 = imperativo + datos completos; 0.5 = imperativo pero faltan campos; <0.5 = borderline).
- missing_fields: array con los campos críticos que el usuario NO especificó:
   * create_task: ["title","due_date","company"] según falte
   * complete_task: ["task_identifier","company"]
   * create_milestone: ["title","type","date","company"]
   * log_action: ["type","description","date","company"]
   * move_pipeline: ["target_stage","company","offer"]
NO inventes valores. Si falta la fecha, inclúyela en missing_fields (no asumas "mañana").

═══ INTENTS DE NEGOCIO (para query) ═══
perfil_empresa | contacto | estado_comercial | tareas_pendientes | historial_seguimiento |
listado_filtrado | conteo | comparacion | resumen_ejecutivo | otro

═══ EVIDENCE_LEVEL preliminar ═══
- "full": pregunta clara y resoluble.
- "partial": resoluble pero con riesgo de evidencia incompleta.
- "none": no hay manera evidente de responder con datos del CRM.

Extrae entidades mencionadas (company_mentions con nombres tal cual aparecen).
NUNCA inventes filtros que el usuario no mencionó.

Llama SIEMPRE a la tool route_query.`;

const TOOL = {
  type: "function",
  function: {
    name: "route_query",
    description: "Clasifica intención (operación + camino) y extrae entidades + acciones detectadas.",
    parameters: {
      type: "object",
      properties: {
        operation: { type: "string", enum: ["query", "action", "mixed", "clarify"] },
        path: { type: "string", enum: ["exact", "semantic", "hybrid", "clarify"] },
        intent: {
          type: "string",
          enum: [
            "perfil_empresa", "contacto", "estado_comercial", "tareas_pendientes",
            "historial_seguimiento", "listado_filtrado", "conteo", "comparacion",
            "resumen_ejecutivo", "otro",
          ],
        },
        actions_intent: {
          type: "array",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["create_task", "complete_task", "create_milestone", "log_action", "move_pipeline"] },
              confidence: { type: "number" },
              missing_fields: { type: "array", items: { type: "string" } },
            },
            required: ["kind", "confidence"],
          },
        },
        entities: {
          type: "object",
          properties: {
            company_mentions: { type: "array", items: { type: "string" } },
            city: { type: "string" },
            vertical: { type: "string" },
            sub_vertical: { type: "string" },
            category: { type: "string" },
            offer: { type: "string" },
            stage: { type: "string" },
            assigned_to: { type: "string" },
            date_range: {
              type: "object",
              properties: { from: { type: "string" }, to: { type: "string" } },
            },
            only_overdue: { type: "boolean" },
          },
        },
        evidence_level: { type: "string", enum: ["full", "partial", "none"] },
        clarification_question: { type: "string", description: "Solo si operation=clarify o path=clarify" },
        rewritten_query: { type: "string", description: "Versión limpia para embedding semántico" },
      },
      required: ["operation", "path", "intent", "entities", "evidence_level", "rewritten_query"],
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, taxonomy } = await req.json();
    if (!Array.isArray(messages) || !messages.length) {
      return new Response(JSON.stringify({ error: "messages required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const recent = messages.slice(-4);
    const taxonomyHint = taxonomy
      ? `\nTAXONOMÍA del CRM (úsala para detectar filtros):\n- Categorías: ${(taxonomy.categories || []).join(", ") || "-"}\n- Verticales: ${(taxonomy.verticals || []).join(", ") || "-"}\n- Sub-verticales: ${(taxonomy.subVerticals || []).join(", ") || "-"}\n- Ciudades: ${(taxonomy.cities || []).join(", ") || "-"}`
      : "";

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: SYSTEM + taxonomyHint },
          ...recent,
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "route_query" } },
      }),
    });

    const fallback = (extra: any = {}) => ({
      operation: "query",
      path: "semantic",
      intent: "otro",
      actions_intent: [],
      entities: {},
      evidence_level: "partial",
      rewritten_query: messages[messages.length - 1]?.content || "",
      ...extra,
      _fallback: true,
    });

    if (!resp.ok) {
      const t = await resp.text();
      console.error("router gateway error", resp.status, t);
      return new Response(JSON.stringify(fallback({ _error: t })), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const call = data.choices?.[0]?.message?.tool_calls?.[0];
    let parsed: any = null;
    try { parsed = call?.function?.arguments ? JSON.parse(call.function.arguments) : null; } catch { /* */ }

    if (!parsed) {
      return new Response(JSON.stringify(fallback()), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Defensive defaults — never let consumers crash on missing fields.
    parsed.operation ||= "query";
    parsed.path ||= "semantic";
    parsed.actions_intent ||= [];
    parsed.entities ||= {};
    parsed.evidence_level ||= "partial";
    parsed.rewritten_query ||= messages[messages.length - 1]?.content || "";

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("chat-router error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
