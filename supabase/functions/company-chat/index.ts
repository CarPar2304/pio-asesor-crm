import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import OpenAI from "npm:openai@4.96.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    // Get last user message for embedding
    const lastUserMessage = [...messages].reverse().find((m: any) => m.role === "user")?.content || "";

    // Generate embedding for the query
    const embResponse = await openai.embeddings.create({
      model: embeddingModel,
      input: lastUserMessage,
    });
    const queryEmbedding = embResponse.data[0].embedding;

    // Search similar companies via RPC
    const { data: matches, error: matchErr } = await supabase.rpc("match_companies", {
      query_embedding: JSON.stringify(queryEmbedding),
      match_threshold: 0.3,
      match_count: 10,
    });

    if (matchErr) {
      console.error("match_companies error:", matchErr);
    }

    // Build context from matches
    let contextBlock = "";
    if (matches?.length) {
      contextBlock = matches
        .map((m: any, i: number) => `--- Empresa ${i + 1} (similitud: ${(m.similarity * 100).toFixed(1)}%) ---\n${m.content}`)
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
