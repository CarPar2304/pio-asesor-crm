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
    const { taxonomyTree, definitions, orphanVerticals, orphanSubVerticals, companyCounts } = body;

    const client = new OpenAI({ apiKey: OPENAI_API_KEY });

    // Fetch settings for model config dynamically
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
    const reasoningEffort = settings.reasoning_effort || "high";
    const webSearchEnabled = settings.web_search_enabled !== false;
    const customPrompt = settings.prompt || "";

    const prompt = `Eres un experto en gestión de taxonomías para CRM de ecosistemas de innovación, startups y empresas de base tecnológica en Colombia y Latinoamérica.

═══════════════════════════════════════
DEFINICIONES DEL SISTEMA DE CLASIFICACIÓN
═══════════════════════════════════════
${definitions || "No hay definiciones configuradas aún."}

═══════════════════════════════════════
ÁRBOL TAXONÓMICO ACTUAL (COMPLETO)
═══════════════════════════════════════
${taxonomyTree}

═══════════════════════════════════════
VALORES SIN GESTIONAR (HUÉRFANOS)
═══════════════════════════════════════
Verticales huérfanas (existen en empresas pero no están vinculadas a ninguna categoría):
${orphanVerticals.length > 0 ? orphanVerticals.map((v: any) => `- "${v.name}" (${v.count} empresas)`).join("\n") : "Ninguna"}

Sub-verticales huérfanas:
${orphanSubVerticals.length > 0 ? orphanSubVerticals.map((v: any) => `- "${v.name}" (${v.count} empresas)`).join("\n") : "Ninguna"}

═══════════════════════════════════════
CONTEO DE USO POR EMPRESA
═══════════════════════════════════════
${companyCounts}

═══════════════════════════════════════
TU TAREA
═══════════════════════════════════════

Analiza la taxonomía completa y sugiere acciones de organización. Para cada sugerencia, especifica:

1. **FUSIONAR** - Dos o más términos que significan lo mismo o son muy similares deben fusionarse en uno.
2. **RENOMBRAR** - Nombres inconsistentes, con errores tipográficos, o que podrían ser más claros.
3. **ELIMINAR** - Términos redundantes, vacíos, o que no tienen empresas asociadas y no aportan valor.
4. **MOVER** - Verticales o sub-verticales que están en la categoría incorrecta.
5. **VINCULAR** - Valores huérfanos que deberían integrarse en la taxonomía gestionada.
6. **COMPARTIR** - Verticales que aplican a más de una categoría.

REGLAS IMPORTANTES:
- NO sugieras eliminar términos que tienen empresas asociadas a menos que exista un claro reemplazo (fusión).
- Prioriza la consistencia de nombres (capitalización, formato).
- Respeta las definiciones del sistema: SaaS NUNCA como vertical de EBT.
- Sé conservador: solo sugiere cambios con alta confianza.
- Explica brevemente POR QUÉ sugieres cada cambio.
- Agrupa las sugerencias por prioridad: alta, media, baja.
${customPrompt ? `\nINSTRUCCIONES ADICIONALES:\n${customPrompt}` : ""}

Responde ÚNICAMENTE llamando la función suggest_taxonomy_changes.`;

    console.log(`Calling OpenAI ${model} (reasoning: ${reasoningEffort}, web: ${webSearchEnabled}) for taxonomy organization...`);

    const tools: any[] = [];
    if (webSearchEnabled) {
      tools.push({ type: "web_search" as any });
    }
    tools.push({
      type: "function",
      name: "suggest_taxonomy_changes",
      description: "Return structured taxonomy reorganization suggestions",
      parameters: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description: "Brief overall assessment of the taxonomy health (2-3 sentences)",
          },
          suggestions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "Unique ID for this suggestion (e.g. 'sug-1')" },
                action: {
                  type: "string",
                  enum: ["merge", "rename", "delete", "move", "link", "share"],
                },
                priority: {
                  type: "string",
                  enum: ["high", "medium", "low"],
                },
                target_type: {
                  type: "string",
                  enum: ["category", "vertical", "sub_vertical"],
                },
                target_name: { type: "string", description: "Name of the item to act on" },
                target_id: { type: "string", description: "ID of the item if known, empty string if orphan" },
                destination_name: { type: ["string", "null"], description: "For merge/move/link/share: destination name" },
                destination_id: { type: ["string", "null"], description: "For merge/move/link/share: destination ID if known" },
                new_name: { type: ["string", "null"], description: "For rename: the new name" },
                reason: { type: "string", description: "Brief explanation of why this change is suggested" },
                affected_companies: { type: "number", description: "Number of companies affected by this change" },
              },
              required: ["id", "action", "priority", "target_type", "target_name", "reason", "affected_companies"],
            },
          },
        },
        required: ["summary", "suggestions"],
        additionalProperties: false,
      },
    });

    const response = await client.responses.create({
      model,
      reasoning: { effort: reasoningEffort as any },
      tools,
      input: prompt,
    });

    console.log("OpenAI response received, output items:", response.output.length);

    let result: any = null;
    for (const item of response.output) {
      if (item.type === "function_call" && item.name === "suggest_taxonomy_changes") {
        try {
          result = JSON.parse(item.arguments);
        } catch {
          result = null;
        }
        break;
      }
    }

    if (!result) {
      console.error("No structured response from AI");
      return new Response(
        JSON.stringify({ error: "No se obtuvieron sugerencias estructuradas de la IA" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Taxonomy organize result:", {
      suggestionsCount: result.suggestions?.length || 0,
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("taxonomy-organize error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
