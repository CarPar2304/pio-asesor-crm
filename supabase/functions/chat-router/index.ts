// ============================================================
// chat-router — classifies a user turn into one of 4 paths
// (exact / semantic / hybrid / clarify) using Lovable AI gateway
// with tool calling for structured output.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM = `Eres un router de intención para el chat de un CRM.
Clasifica el último mensaje del usuario y decide cómo debe responderse.

CAMINOS:
- "exact"    → Pide hechos verificables (lista, conteo, contacto, etapa, tarea, responsable, NIT…). Debe responderse SOLO con consultas SQL.
- "semantic" → Pregunta abierta de contexto/resumen/antecedentes/exploración. RAG semántico.
- "hybrid"   → Cruza hechos exactos + interpretación/contexto (ej: "qué se ha hecho con X y cómo va").
- "clarify"  → Hay ambigüedad real (filtro, periodo o entidad poco clara). Hay que preguntar antes de responder.

INTENTS DE NEGOCIO (escoge UNO):
perfil_empresa | contacto | estado_comercial | tareas_pendientes | historial_seguimiento |
listado_filtrado | conteo | comparacion | resumen_ejecutivo | otro

EVIDENCE_LEVEL preliminar (será reevaluado tras ejecutar tools):
- "full": pregunta clara y resoluble.
- "partial": pregunta resoluble pero con riesgo de evidencia incompleta.
- "none": no hay manera evidente de responder con datos del CRM.

Extrae entidades mencionadas. company_mentions deben ser nombres tal como aparecen.
date_range solo si el usuario lo pide explícitamente (ej: "últimos 3 meses").
NUNCA inventes filtros que el usuario no mencionó.

Llama SIEMPRE a la tool route_query.`;

const TOOL = {
  type: "function",
  function: {
    name: "route_query",
    description: "Clasifica la intención del usuario y extrae entidades.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", enum: ["exact", "semantic", "hybrid", "clarify"] },
        intent: {
          type: "string",
          enum: [
            "perfil_empresa", "contacto", "estado_comercial", "tareas_pendientes",
            "historial_seguimiento", "listado_filtrado", "conteo", "comparacion",
            "resumen_ejecutivo", "otro",
          ],
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
        clarification_question: { type: "string", description: "Solo si path=clarify" },
        rewritten_query: { type: "string", description: "Versión limpia para embedding semántico" },
      },
      required: ["path", "intent", "entities", "evidence_level", "rewritten_query"],
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

    if (!resp.ok) {
      const t = await resp.text();
      console.error("router gateway error", resp.status, t);
      return new Response(JSON.stringify({
        path: "semantic", intent: "otro", entities: {}, evidence_level: "partial",
        rewritten_query: messages[messages.length - 1]?.content || "",
        _fallback: true, _error: t,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await resp.json();
    const call = data.choices?.[0]?.message?.tool_calls?.[0];
    let parsed: any = null;
    try { parsed = call?.function?.arguments ? JSON.parse(call.function.arguments) : null; } catch { /* */ }

    if (!parsed) {
      return new Response(JSON.stringify({
        path: "semantic", intent: "otro", entities: {}, evidence_level: "partial",
        rewritten_query: messages[messages.length - 1]?.content || "", _fallback: true,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

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
