import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import OpenAI from "npm:openai@4.96.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

function buildCompanyContent(
  company: Record<string, any>,
  contacts: Record<string, any>[] = [],
  customProps: Record<string, any>[] = [],
  actions: Record<string, any>[] = [],
  milestonesList: Record<string, any>[] = [],
  tasksList: Record<string, any>[] = [],
  pipelineEntries: Record<string, any>[] = [],
  stageMap: Map<string, any> = new Map(),
  offerMap: Map<string, any> = new Map(),
  profileMap: Map<string, string> = new Map(),
) {
  const parts: string[] = [];

  parts.push(`Nombre comercial: ${company.trade_name}`);
  if (company.legal_name) parts.push(`Razón social: ${company.legal_name}`);
  if (company.nit) parts.push(`NIT: ${company.nit}`);
  if (company.category) parts.push(`Categoría: ${company.category}`);
  if (company.vertical) parts.push(`Vertical: ${company.vertical}`);
  if (company.economic_activity) parts.push(`Sub-vertical / Actividad económica: ${company.economic_activity}`);
  if (company.description) parts.push(`Descripción: ${company.description}`);
  if (company.city) parts.push(`Ciudad: ${company.city}`);
  if (company.website) parts.push(`Sitio web: ${company.website}`);
  if (company.exports_usd) parts.push(`Exportaciones USD: ${company.exports_usd}`);

  if (company.sales_by_year && typeof company.sales_by_year === "object") {
    const salesEntries = Object.entries(company.sales_by_year as Record<string, number>)
      .filter(([, v]) => v > 0)
      .sort(([a], [b]) => Number(b) - Number(a));
    if (salesEntries.length > 0) {
      parts.push(`Ventas: ${salesEntries.map(([y, v]) => `${y}: $${Number(v).toLocaleString()}`).join(", ")}`);
    }
  }

  if (contacts.length > 0) {
    const contactText = contacts
      .map((c) => {
        const segments = [`${c.name}${c.position ? ` (${c.position})` : ""}`];
        if (c.email) segments.push(`Email: ${c.email}`);
        if (c.phone) segments.push(`Celular: ${c.phone}`);
        return segments.join(" - ");
      })
      .join("; ");
    parts.push(`Contactos: ${contactText}`);
  }

  if (customProps.length > 0) {
    const propsText = customProps.map((p) => `${p.name}: ${p.value || ""}`).join("; ");
    parts.push(`Propiedades: ${propsText}`);
  }

  if (actions.length > 0) {
    const actionsText = actions.slice(0, 10)
      .map((a) => `${a.date} - ${a.type}: ${a.description}${a.notes ? ` (${a.notes})` : ""}`)
      .join("; ");
    parts.push(`Acciones recientes: ${actionsText}`);
  }

  if (milestonesList.length > 0) {
    const milestonesText = milestonesList.slice(0, 10)
      .map((m) => `${m.date} - ${m.type}: ${m.title}${m.description ? ` - ${m.description}` : ""}`)
      .join("; ");
    parts.push(`Hitos: ${milestonesText}`);
  }

  if (tasksList.length > 0) {
    const tasksText = tasksList.slice(0, 10)
      .map((t) => {
        const assignedName = t.assigned_to ? (profileMap.get(t.assigned_to) || "Sin asignar") : "Sin asignar";
        const offerName = t.offer_id ? (offerMap.get(t.offer_id)?.name || "") : "";
        return `${t.title} (Estado: ${t.status}, Vence: ${t.due_date}, Asignado a: ${assignedName}${offerName ? `, Oferta: ${offerName}` : ""})`;
      })
      .join("; ");
    parts.push(`Tareas: ${tasksText}`);
  }

  if (pipelineEntries.length > 0) {
    const pipelineText = pipelineEntries
      .map((pe) => {
        const stage = stageMap.get(pe.stage_id);
        const offer = offerMap.get(pe.offer_id);
        const assignedName = pe.assigned_to ? (profileMap.get(pe.assigned_to) || "Sin asignar") : "Sin asignar";
        return `Oferta: ${offer?.name || "Desconocida"} (Producto: ${offer?.product || "N/A"}) → Etapa: ${stage?.name || "Desconocida"}, Gestor: ${assignedName}${pe.notes ? `, Notas: ${pe.notes}` : ""}`;
      })
      .join("; ");
    parts.push(`Pipeline / Portafolio: ${pipelineText}`);
  }

  return parts.join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    if (!messages?.length) {
      return new Response(JSON.stringify({ error: "Messages required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const openai = new OpenAI({ apiKey: openaiKey });

    // Get config
    const { data: settingsRow } = await supabase
      .from("feature_settings")
      .select("config")
      .eq("feature_key", "company_chat")
      .single();

    const config = (settingsRow?.config || {}) as Record<string, any>;
    const chatModel = config.model || "gpt-4.1-mini";
    const embeddingModel = config.embeddingModel || "text-embedding-3-small";
    const reasoningEffort = config.reasoningEffort || "none";
    const customPromptAddition = config.systemPrompt || "";

    const lastUserMessage = [...messages].reverse().find((m: any) => m.role === "user")?.content?.trim() || "";
    const recentMessages = messages.slice(-4);
    const retrievalQuery = recentMessages
      .map((m: any) => `${m.role === "user" ? "Usuario" : "Asistente"}: ${m.content}`)
      .join("\n\n") || lastUserMessage;

    // Generate embedding for the retrieval query
    const embResponse = await openai.embeddings.create({
      model: embeddingModel,
      input: retrievalQuery,
    });
    const queryEmbedding = embResponse.data[0].embedding;

    // Search similar companies via RPC
    // Determine how many results to fetch based on query intent
    const wantsAll = /\btodas?\b|\btodos?\b|\bcada\b|\blistado\b|\bcompleto\b|\bgeneral\b/i.test(retrievalQuery);
    const isContactLookup = /\bcelulares?\b|\bteléfonos?\b|\btelefonos?\b|\bcontactos?\b|\bcorreos?\b|\bemails?\b/i.test(retrievalQuery);
    const isFollowUp = /\besta?s?\b|\besa?s?\b|\besto\b|\bagrega(?:le|r)?\b|\bañade(?:le|r)?\b|\bactualiza(?:r)?\b|\bcompleta(?:r)?\b|\bincluye(?:r)?\b|\btabla\b/i.test(lastUserMessage) && recentMessages.length > 1;
    const matchCount = wantsAll ? 100 : isContactLookup || isFollowUp ? 40 : 15;
    const matchThreshold = wantsAll ? 0.15 : isContactLookup || isFollowUp ? 0.18 : 0.25;

    const { data: matches, error: matchErr } = await supabase.rpc("match_companies", {
      query_embedding: JSON.stringify(queryEmbedding),
      match_threshold: matchThreshold,
      match_count: matchCount,
    });

    if (matchErr) {
      console.error("match_companies error:", matchErr);
    }

    const normalizedConversation = normalizeText(retrievalQuery);
    const { data: companyNameRows, error: companyNamesErr } = await supabase
      .from("companies")
      .select("id, trade_name, legal_name");

    if (companyNamesErr) {
      console.error("company name lookup error:", companyNamesErr);
    }

    const mentionedCompanyIds = Array.from(new Set(
      (companyNameRows || [])
        .filter((company: any) =>
          [company.trade_name, company.legal_name]
            .filter((name): name is string => Boolean(name))
            .some((name) => {
              const normalizedName = normalizeText(name);
              return normalizedName.length >= 4 && normalizedConversation.includes(normalizedName);
            })
        )
        .map((company: any) => company.id)
    ));

    let directMatches: any[] = [];
    if (mentionedCompanyIds.length > 0) {
      const [
        directCompaniesRes, directContactsRes, directPropsRes,
        directActionsRes, directMilestonesRes, directTasksRes,
        directPipelineRes, directStagesRes, directOffersRes, directProfilesRes,
      ] = await Promise.all([
        supabase.from("companies").select("*").in("id", mentionedCompanyIds),
        supabase.from("contacts").select("*").in("company_id", mentionedCompanyIds),
        supabase.from("custom_properties").select("*").in("company_id", mentionedCompanyIds),
        supabase.from("company_actions").select("*").in("company_id", mentionedCompanyIds).order("date", { ascending: false }),
        supabase.from("milestones").select("*").in("company_id", mentionedCompanyIds).order("date", { ascending: false }),
        supabase.from("company_tasks").select("*").in("company_id", mentionedCompanyIds).order("due_date", { ascending: false }),
        supabase.from("pipeline_entries").select("*").in("company_id", mentionedCompanyIds),
        supabase.from("pipeline_stages").select("*"),
        supabase.from("portfolio_offers").select("id, name, product, status"),
        supabase.from("profiles").select("user_id, name"),
      ]);

      const directCompanies = directCompaniesRes.data || [];
      const directContacts = directContactsRes.data || [];
      const directProps = directPropsRes.data || [];
      const directActions = directActionsRes.data || [];
      const directMilestones = directMilestonesRes.data || [];
      const directTasks = directTasksRes.data || [];
      const directPipeline = directPipelineRes.data || [];
      const dStageMap = new Map((directStagesRes.data || []).map((s: any) => [s.id, s]));
      const dOfferMap = new Map((directOffersRes.data || []).map((o: any) => [o.id, o]));
      const dProfileMap = new Map((directProfilesRes.data || []).map((p: any) => [p.user_id, p.name]));

      directMatches = directCompanies.map((company: any) => ({
        id: `direct-${company.id}`,
        company_id: company.id,
        content: buildCompanyContent(
          company,
          directContacts.filter((c: any) => c.company_id === company.id),
          directProps.filter((p: any) => p.company_id === company.id),
          directActions.filter((a: any) => a.company_id === company.id),
          directMilestones.filter((m: any) => m.company_id === company.id),
          directTasks.filter((t: any) => t.company_id === company.id),
          directPipeline.filter((pe: any) => pe.company_id === company.id),
          dStageMap,
          dOfferMap,
          dProfileMap,
        ),
        similarity: 1,
        source: "direct",
      }));
    }

    const combinedMatches = Array.from(
      new Map(
        [...directMatches, ...(matches || [])].map((match: any) => [match.company_id, match])
      ).values()
    );

    console.log("company-chat retrieval", {
      lastUserMessage,
      retrievalQueryLength: retrievalQuery.length,
      mentionedCompanyIds: mentionedCompanyIds.length,
      semanticMatches: matches?.length || 0,
      combinedMatches: combinedMatches.length,
      isContactLookup,
      isFollowUp,
      wantsAll,
    });

    // Build context from matches
    let contextBlock = "";
    if (combinedMatches.length) {
      contextBlock = combinedMatches
        .map((m: any, i: number) => `--- Empresa ${i + 1}${m.source === "direct" ? " (mencionada en la conversación)" : ` (similitud: ${(m.similarity * 100).toFixed(1)}%)`} ---\n${m.content}`)
        .join("\n\n");
    }

    const systemPrompt = `Eres un asistente inteligente del CRM "Pioneros Globales" de la Cámara de Comercio de Cali. Tu rol es ayudar a los asesores a consultar información sobre las empresas registradas en el sistema.

REGLAS DE FORMATO:
- Usa markdown para formatear tus respuestas
- Usa **negrillas** para resaltar datos importantes
- Usa listas con viñetas para enumerar
- Cuando necesites comparar datos, usa tablas GFM válidas:
  - Primera fila: encabezados separados por | (ejemplo: | Empresa | Ventas | Ciudad |)
  - Segunda fila: separadores (ejemplo: | --- | --- | --- |)
  - Filas de datos: una por línea (ejemplo: | Acme | $500M | Cali |)
  - NUNCA uses || como separador. Cada celda debe tener exactamente un | antes y uno después.
  - Siempre deja una línea en blanco antes y después de la tabla.
- Para títulos usa solo ### (nivel 3) o #### (nivel 4), nunca # o ##
- Sé conciso pero completo

REGLAS DE CONTENIDO:
- Responde SOLO con información de las empresas proporcionadas en el contexto
- Si no encuentras información relevante, indícalo claramente
- Puedes hacer análisis comparativos, resúmenes y recomendaciones basadas en los datos
- Incluye nombres de empresas, categorías, verticales y métricas cuando sea relevante
- Si el usuario hace una pregunta de seguimiento como "agrega el celular a esta tabla", prioriza las empresas mencionadas recientemente en la conversación
- Si el usuario pregunta algo fuera de tu alcance, sugiere vectorizar las empresas para tener datos actualizados

${customPromptAddition ? `\nINSTRUCCIONES ADICIONALES DEL ADMINISTRADOR:\n${customPromptAddition}` : ""}

CONTEXTO DE EMPRESAS RELEVANTES:
${contextBlock || "No se encontraron empresas relevantes para esta consulta. Sugiere al usuario que vectorice las empresas desde la configuración."}`;

    // Build request body
    const isReasoningModel = /^o\d/.test(chatModel);
    const requestBody: any = {
      model: chatModel,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      stream: true,
    };

    if (isReasoningModel && reasoningEffort && reasoningEffort !== "none") {
      requestBody.reasoning = { effort: reasoningEffort };
    }

    const response = await openai.chat.completions.create(requestBody);

    // Stream response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of response as any) {
            const content = chunk.choices?.[0]?.delta?.content;
            if (content) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`));
            }
            if (chunk.choices?.[0]?.finish_reason) {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            }
          }
        } catch (err) {
          console.error("Stream error:", err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (err) {
    console.error("company-chat error:", err);

    const status = (err as any)?.status === 429 ? 429 : (err as any)?.status === 402 ? 402 : 500;
    const message =
      status === 429
        ? "Demasiadas solicitudes, intenta de nuevo en un momento."
        : status === 402
        ? "Se agotaron los créditos de IA."
        : err instanceof Error
        ? err.message
        : "Error desconocido";

    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
