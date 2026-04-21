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
      description: "Lista empresas filtradas. Usar para 'todas las EBT en Cali', 'empresas de la oferta X en etapa Y'. Si filtras por oferta, PREFIERE pasar offer_id (resuelto por find_offer_by_name) antes que offer (string).",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string" }, vertical: { type: "string" }, sub_vertical: { type: "string" },
          category: { type: "string" }, offer: { type: "string" }, offer_id: { type: "string" }, stage: { type: "string" },
          limit: { type: "integer", default: 100 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "count_companies",
      description: "Conteo exacto de empresas con filtros. Si filtras por oferta, PREFIERE offer_id (resuelto por find_offer_by_name).",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string" }, vertical: { type: "string" }, sub_vertical: { type: "string" },
          category: { type: "string" }, offer: { type: "string" }, offer_id: { type: "string" }, stage: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_offer_by_name",
      description: "Resuelve un nombre/alias de OFERTA del portafolio a candidatos usando búsqueda aproximada (pg_trgm, tolera typos). USAR SIEMPRE antes de filtrar por nombre de oferta. Devuelve ambiguity si hay candidatos cercanos o low_confidence si el mejor match es débil.",
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
      name: "list_offers",
      description: "Lista las ofertas del portafolio (programas/convocatorias/productos). Usar cuando el usuario pida 'ofertas', 'portafolio', 'programas', 'catálogo' sin nombrar empresa.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "Filtra por status (active, draft, ...)" },
          product: { type: "string", description: "Filtra por product (ilike)" },
          limit: { type: "integer", default: 100 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_offer_summary",
      description: "Devuelve detalle de una oferta + sus etapas (pipeline_stages ordenadas) + total de empresas inscritas y conteo por etapa.",
      parameters: {
        type: "object",
        properties: { offer_id: { type: "string" } },
        required: ["offer_id"],
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
  const tax = `Taxonomía del CRM (úsala silenciosamente para entender al usuario, no la cites):
- Categorías: ${(taxonomy.categories || []).join(", ") || "-"}
- Verticales: ${(taxonomy.verticals || []).join(", ") || "-"}
- Sub-verticales: ${(taxonomy.subVerticals || []).join(", ") || "-"}
- Ciudades: ${(taxonomy.cities || []).join(", ") || "-"}`;

  // Internal hint only — never mention to the user.
  const router = `Pista interna de ruteo (uso interno, NO la menciones jamás): operation=${routerOutput.operation || "query"} path=${routerOutput.path} intent=${routerOutput.intent} entities=${JSON.stringify(routerOutput.entities || {})}`;

  return `Eres un analista del equipo de Pioneros Globales (Cámara de Comercio de Cali). Hablas como una persona del equipo: cercano, claro, directo, en español natural. Hoy es ${today}.

${tax}

${router}

═══ TU IDENTIDAD ═══
Eres un compañero de equipo que conoce a fondo el CRM. Cuando el usuario te pregunta algo, respondes como lo haría una persona experta: con la información relevante, sin rodeos, y si te falta algo lo dices con honestidad. No eres un sistema, no eres una API, no eres un bot que recita.

═══ PROHIBICIONES ABSOLUTAS (NUNCA romper) ═══
- NUNCA escribas etiquetas como [CRM], [Pipeline], [Tareas], [Contexto], [Histórico], [Semántico], [Fuente], ni nada entre corchetes que parezca un tag técnico.
- NUNCA escribas frases como "Nivel de evidencia", "evidencia full/partial/none", "según el contexto semántico", "según el RAG", "según las tools", "se confirmó con la búsqueda", "se consultó la base".
- NUNCA menciones nombres de funciones/tools (find_company_by_name, find_offer_by_name, list_companies, list_offers, search_semantic, get_offer_summary, get_pipeline_state, get_company_timeline, etc.) ni términos técnicos (pg_trgm, embedding, RAG, router, intent, envelope, hybrid, semantic, exact).
- NUNCA digas "según mis datos" o "en mi base de datos" — di simplemente lo que sabes o lo que no sabes.
- Si tu información es incompleta, dilo en español llano: "No tengo registro de…", "Solo encontré información parcial sobre…", "No me aparece…".

═══ CÓMO RESPONDES (principios, no plantillas) ═══
El formato lo decides tú según la pregunta. No hay plantillas rígidas. Sí hay principios:

1. Sé conciso pero completo. No inventes secciones que no aportan. No repitas la pregunta del usuario.
2. Markdown limpio. Negrillas para nombres de empresa y cifras. Títulos \`###\` solo si la respuesta es lo bastante larga para necesitarlos.
3. Tablas GFM cuando hay varias entidades comparables (varias empresas, varias ofertas, varias tareas). Columnas relevantes a la pregunta concreta.
4. Una sola entidad → prosa estructurada, lo importante arriba.
5. Cifras con su unidad y, si es dinero, con su moneda (COP/USD).
6. Fechas en formato humano corto ("15 mar 2026") salvo que el usuario pida ISO.

═══ CONTACTOS — CONSISTENCIA OBLIGATORIA ═══
Cuando muestres un contacto, incluye SIEMPRE todos los campos disponibles que tengas (nombre, cargo, email, teléfono). Si un campo viene vacío en la fuente, OMÍTELO de la línea — no inventes, no pongas "N/A", no pongas guion. Mantén el mismo orden y separador en TODOS los contactos de TODAS las respuestas: nombre primero (en negrilla), luego cargo, luego email, luego teléfono, separados por " · ". Esta consistencia es crítica entre respuestas distintas.

═══ PENSAMIENTO ESTRATÉGICO ═══
Cuando la pregunta es interpretativa ("la más estratégica", "cuál priorizar", "cuál cuadra mejor con X", "qué empresa recomiendas para Y"), NO respondas con un solo lookup literal. Tu trabajo es razonar:
1. Trae el universo de candidatos relevantes con sus señales (ventas, vertical, etapa en pipeline, hitos recientes, antigüedad en el CRM, fit con la oferta).
2. Pondera y compara.
3. Recomienda nombre(s) específico(s) con argumento basado en datos concretos del CRM.
4. Si te falta información para decidir bien, dilo y sugiere qué mirar.

═══ OFERTAS DEL PORTAFOLIO ═══
Si el usuario menciona el nombre de una oferta/programa/convocatoria, primero resuélvelo internamente (la búsqueda tolera typos). Si la mejor coincidencia tiene un typo evidente respecto a lo que escribió el usuario, sugiérelo: "¿Te refieres a *Venzuela Tech Week*?". Si no hay coincidencia, di "No tengo ninguna oferta llamada *X*". Nunca reportes "0 empresas en X" sin haber verificado que la oferta existe.

Si el usuario pide "qué ofertas/programas/portafolio/catálogo tenemos", devuelve la lista de ofertas del portafolio, no de empresas.

═══ VACÍOS Y AMBIGÜEDAD (en lenguaje humano) ═══
- No existe la empresa: "No tengo a *X* en el CRM."
- Hay varios candidatos: "¿Te refieres a *A*, *B* o *C*?" — lista los nombres, deja que el usuario elija.
- La empresa existe pero no tiene contactos/tareas/etc: "Tengo a *X* registrada, pero todavía no hay [contactos/tareas/…] cargados."
- La pregunta es vaga: pide UNA aclaración concreta, breve.

═══ ACCIONES (crear tarea, hito, acción, mover etapa, completar tarea) ═══
Protocolo: resolver → confirmar (si falta info) → ejecutar → confirmar resultado.
1. Resuelve la empresa primero. Si hay ambigüedad, pregunta cuál es antes de ejecutar.
2. Si falta un campo obligatorio (fecha de vencimiento, título, etapa destino), PREGUNTA en lenguaje natural ("¿Para cuándo la quieres?", "¿A qué etapa la mueves?"). NO inventes fechas, NO asumas valores. Expresiones vagas como "la próxima semana", "pronto", "luego" SON ambiguas — pide la fecha exacta.
3. Si todo está claro, ejecuta la acción correspondiente.
4. Confirma en una sola línea: \`✅ Tarea «X» creada para *Empresa* con vencimiento 15 mar 2026.\` o \`✅ *Empresa* movida a etapa «Seleccionados» en *Oferta*.\`
5. Si la acción falla, di EXACTAMENTE qué falló: \`❌ No pude crear la tarea: <motivo en español>.\` Nunca finjas éxito.
6. Para mover de etapa o completar tarea (alto impacto), si tienes la mínima duda, pide confirmación antes de ejecutar.

═══ NUNCA ═══
- Nunca aproximes un conteo exacto. Si el dato exacto está vacío, dilo.
- Nunca elijas tú entre candidatos cuando hay ambigüedad — pregunta.
- Nunca infieras datos de una empresa a partir de otra.
- Nunca compongas un párrafo largo después de ejecutar una acción: una línea de confirmación basta.
- Nunca uses emojis salvo \`✅ ⚠️ ❌\` en confirmaciones de acción.

${customAddition ? `\nInstrucciones adicionales del administrador:\n${customAddition}` : ""}`;
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
    if (args.offer_id || args.offer || args.stage) {
      let entriesQ = supabase.from("pipeline_entries").select("company_id, offer_id, stage_id, portfolio_offers!inner(name), pipeline_stages!inner(name)");
      if (args.offer_id) entriesQ = entriesQ.eq("offer_id", args.offer_id);
      else if (args.offer) entriesQ = entriesQ.ilike("portfolio_offers.name", `%${args.offer}%`);
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

  async function findOfferByName(name: string, limit = 5) {
    const { data, error } = await supabase.rpc("find_offer_by_name", { _name: name, _limit: limit });
    if (error) return envelope("find_offer_by_name", { warnings: [error.message] });
    const rows = data || [];
    let ambiguity: any = null;
    if (rows.length === 0) {
      // none
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
          candidates: rows.map((r: any) => ({ id: r.id, name: r.name, product: r.product, status: r.status, similarity: Number(r.similarity.toFixed(3)) })),
        };
      }
    }
    return envelope("find_offer_by_name", {
      filters_applied: { name, limit },
      results: rows.map((r: any) => ({ id: r.id, name: r.name, product: r.product, status: r.status, similarity: Number(r.similarity.toFixed(3)) })),
      ambiguity,
    });
  }

  async function listOffers(args: any) {
    let q = supabase.from("portfolio_offers").select("id, name, product, status, description, start_date, end_date", { count: "exact" });
    if (args.status) q = q.eq("status", args.status);
    if (args.product) q = q.ilike("product", `%${args.product}%`);
    const limit = Math.min(args.limit || 100, 200);
    const { data, count, error } = await q.order("name", { ascending: true }).limit(limit);
    if (error) return envelope("list_offers", { warnings: [error.message] });
    return envelope("list_offers", { filters_applied: args, total: count ?? data?.length ?? 0, results: data || [] });
  }

  async function getOfferSummary(offerId: string) {
    const [{ data: offer, error: oErr }, { data: stages, error: sErr }, { data: entries, error: eErr }] = await Promise.all([
      supabase.from("portfolio_offers").select("id, name, product, status, description, start_date, end_date, type").eq("id", offerId).maybeSingle(),
      supabase.from("pipeline_stages").select("id, name, color, display_order, counts_as_management").eq("offer_id", offerId).order("display_order", { ascending: true }),
      supabase.from("pipeline_entries").select("id, company_id, stage_id, companies!inner(trade_name, nit), pipeline_stages!inner(name)").eq("offer_id", offerId),
    ]);
    if (oErr || sErr || eErr) return envelope("get_offer_summary", { warnings: [oErr?.message, sErr?.message, eErr?.message].filter(Boolean) });
    if (!offer) return envelope("get_offer_summary", { filters_applied: { offer_id: offerId }, total: 0, results: [] });
    const byStage: Record<string, number> = {};
    (entries || []).forEach((e: any) => { byStage[e.stage_id] = (byStage[e.stage_id] || 0) + 1; });
    const stagesEnriched = (stages || []).map((s: any) => ({ ...s, companies_count: byStage[s.id] || 0 }));
    const companies = (entries || []).map((e: any) => ({
      company_id: e.company_id,
      trade_name: e.companies?.trade_name,
      nit: e.companies?.nit,
      stage: e.pipeline_stages?.name,
    }));
    return envelope("get_offer_summary", {
      filters_applied: { offer_id: offerId },
      total: companies.length,
      results: [{ offer, stages: stagesEnriched, companies_total: companies.length, companies }],
    });
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
    find_offer_by_name: (a: any) => findOfferByName(a.name, a.limit),
    list_offers: (a: any) => listOffers(a),
    get_offer_summary: (a: any) => getOfferSummary(a.offer_id),
  } as Record<string, (a: any) => Promise<any>>;
}

// ============================================================
// ACTION EXECUTOR — proxies into company-chat-actions edge fn
// (uses caller JWT so RLS applies as if from the UI)
// ============================================================
function buildActionExecutor(supabaseUrl: string, authHeader: string | null) {
  return async function execAction(action: string, args: any) {
    if (!authHeader) {
      return { tool: action, mutation: true, executed: false, error: "missing auth — actions require an authenticated user", side_effects: [], result: null };
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
    // Sanitize model — only allow valid OpenAI ids and normalize legacy aliases.
    const VALID_OPENAI = new Set([
      "gpt-5", "gpt-5-mini", "gpt-5-nano", "gpt-5.4", "gpt-5.4-mini",
      "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano",
      "o4-mini",
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
    // reasoning_effort: solo para modelos que lo soportan en chat.completions con tools.
    // gpt-5.4* exige /v1/responses cuando se combina tools+reasoning, así que NO se lo enviamos
    // (el modelo razona por defecto a nivel "low"). gpt-5 / gpt-5-mini / gpt-5-nano / o4-mini sí lo aceptan.
    const reasoningEffortRaw = (config.reasoningEffort || "low").toLowerCase();
    const reasoningEffort = ["minimal","low","medium","high"].includes(reasoningEffortRaw) ? reasoningEffortRaw : "low";
    const supportsReasoningWithTools =
      (chatModel.startsWith("gpt-5") && !chatModel.startsWith("gpt-5.4") && !chatModel.startsWith("gpt-5.2"))
      || chatModel.startsWith("o4");
    const embeddingModel = config.embeddingModel || "text-embedding-3-small";
    const customAddition = config.systemPrompt || "";
    console.log(`[company-chat] model=${chatModel} reasoning=${supportsReasoningWithTools ? reasoningEffort : "default(model)"}`);

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
      let data: any;
      try {
        const completionParams: any = {
          model: chatModel,
          messages: conversation,
          tools: TOOLS,
          tool_choice: "auto",
        };
        if (supportsReasoningWithTools && reasoningEffort !== "none") {
          completionParams.reasoning_effort = reasoningEffort;
        }
        const completion = await openai.chat.completions.create(completionParams);
        data = completion;
      } catch (err: any) {
        const status = err?.status || err?.response?.status;
        const errTxt = err?.message || String(err);
        console.error("openai error", status, errTxt);
        if (status === 429) {
          await logRetrieval(supabase, { conversationIdForLog, userIdForLog, lastUserMessageForLog, routerOutput, toolsCalled, evidence: "none", vacancy: null, latency: Date.now() - startTime, error: "rate_limited" });
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
