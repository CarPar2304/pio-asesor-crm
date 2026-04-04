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
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { categories, verticals, subVerticals, companyCounts, currentDefinitions } = body;

    // Fetch settings for model config
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: settingsRow } = await supabaseAdmin
      .from("feature_settings")
      .select("config")
      .eq("feature_key", "taxonomy_organize")
      .single();

    const settings = (settingsRow?.config as any) || {};
    const model = settings.model || "gpt-4.1-mini";

    // Also get company_fit base prompt for context
    const { data: fitSettings } = await supabaseAdmin
      .from("feature_settings")
      .select("config")
      .eq("feature_key", "company_fit")
      .single();
    
    const fitConfig = (fitSettings?.config as any) || {};
    const baseClassificationContext = fitConfig.base_prompt ? 
      fitConfig.base_prompt.substring(0, 2000) : 
      `Clasificación de empresas:
- STARTUP: Producto/servicio con base tecnológica, modelo escalable y replicable (SaaS, plataforma, marketplace, API).
- EBT (Empresa de Base Tecnológica): Tecnología propia real pero modelo NO escalable tipo startup. NUNCA "SaaS" como vertical.
- DISRUPTIVA: Propuesta moderna/innovadora SIN tecnología propia como núcleo.`;

    const client = new OpenAI({ apiKey: OPENAI_API_KEY });

    const verticalsList = verticals.map((v: any) => 
      `- ${v.name} (categorías: ${v.categories.join(", ") || "sin asignar"})`
    ).join("\n");

    const subVerticalsList = subVerticals.map((sv: any) => 
      `- ${sv.name} (verticales: ${sv.verticals.join(", ") || "sin asignar"})`
    ).join("\n");

    const countsText = companyCounts?.byCategory?.map((c: any) => 
      `- ${c.name}: ${c.count} empresas`
    ).join("\n") || "";

    const prompt = `Eres un experto en taxonomías de CRM para ecosistemas de innovación y startups en Colombia y Latinoamérica.

CONTEXTO DE CLASIFICACIÓN DEL SISTEMA:
${baseClassificationContext}

CATEGORÍAS ACTUALES:
${categories.join(", ")}

VERTICALES:
${verticalsList}

SUB-VERTICALES:
${subVerticalsList}

CONTEO POR CATEGORÍA:
${countsText}

${currentDefinitions ? `DEFINICIONES ACTUALES (para mejorar/complementar):\n${currentDefinitions}\n` : ""}

TU TAREA:
Genera definiciones claras, concisas y consistentes para CADA categoría, vertical y sub-vertical del sistema.

REGLAS:
1. Cada definición debe ser de 1-2 oraciones máximo.
2. Las definiciones deben ser coherentes con el contexto de clasificación del sistema.
3. Para categorías: explica el criterio principal de clasificación (qué tipo de empresa va aquí).
4. Para verticales: explica el dominio/industria que cubre.
5. Para sub-verticales: explica la especialización específica dentro de la vertical.
6. Usa lenguaje técnico pero accesible.
7. No uses definiciones genéricas tipo diccionario. Sé específico al ecosistema tech/innovación.
8. Si una vertical como "SaaS" NO debería estar en EBT, mencionalo en la definición.

FORMATO DE SALIDA:
Responde ÚNICAMENTE llamando la función generate_definitions.`;

    console.log(`Calling OpenAI ${model} for taxonomy definitions...`);

    const response = await client.responses.create({
      model,
      tools: [
        {
          type: "function",
          name: "generate_definitions",
          description: "Return formatted definitions for all taxonomy terms",
          parameters: {
            type: "object",
            properties: {
              definitions: {
                type: "string",
                description: "Formatted definitions text with sections for CATEGORÍAS, VERTICALES, and SUB-VERTICALES. Each item as '- Name: Definition.' format.",
              },
            },
            required: ["definitions"],
            additionalProperties: false,
          },
        },
      ],
      input: prompt,
    });

    let result: any = null;
    for (const item of response.output) {
      if (item.type === "function_call" && item.name === "generate_definitions") {
        try {
          result = JSON.parse(item.arguments);
        } catch {
          result = null;
        }
        break;
      }
    }

    if (!result) {
      return new Response(
        JSON.stringify({ error: "No se obtuvieron definiciones de la IA" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Definitions generated successfully");

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("taxonomy-definitions error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
