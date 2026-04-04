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
    const model = settings.model || "gpt-4.1";
    const reasoningEffort = settings.reasoning_effort || "high";
    const webSearchEnabled = settings.web_search_enabled !== false;
    const customPrompt = settings.prompt || "";

    const prompt = `Eres un experto en gestión de taxonomías para CRM de ecosistemas de innovación, startups y empresas de base tecnológica en Colombia y Latinoamérica.

Tu MISIÓN PRINCIPAL es organizar COMPLETAMENTE la taxonomía. Esto significa:
1. TODOS los valores huérfanos (sin gestionar) DEBEN quedar organizados: vinculados, fusionados o eliminados.
2. Las verticales y sub-verticales existentes deben estar limpias, sin duplicados ni inconsistencias.
3. Las verticales que aplican a múltiples categorías deben compartirse.

═══════════════════════════════════════
DEFINICIONES DEL SISTEMA DE CLASIFICACIÓN
═══════════════════════════════════════
${definitions || "No hay definiciones configuradas aún. Usa tu criterio de experto en ecosistemas de innovación."}

═══════════════════════════════════════
ÁRBOL TAXONÓMICO ACTUAL (COMPLETO)
═══════════════════════════════════════
${taxonomyTree}

═══════════════════════════════════════
VALORES SIN GESTIONAR (HUÉRFANOS) — PRIORIDAD MÁXIMA
═══════════════════════════════════════
⚠️ TODOS estos valores DEBEN ser procesados. No dejes ninguno sin una acción asignada.

Verticales huérfanas (existen en empresas pero no están vinculadas a ninguna categoría):
${orphanVerticals.length > 0 ? orphanVerticals.map((v: any) => `- "${v.name}" (${v.count} empresas)`).join("\n") : "Ninguna"}

Sub-verticales huérfanas:
${orphanSubVerticals.length > 0 ? orphanSubVerticals.map((v: any) => `- "${v.name}" (${v.count} empresas)`).join("\n") : "Ninguna"}

═══════════════════════════════════════
CONTEO DE USO POR EMPRESA
═══════════════════════════════════════
${companyCounts}

═══════════════════════════════════════
INSTRUCCIONES DETALLADAS
═══════════════════════════════════════

Para cada valor huérfano, decide UNA de estas acciones:

1. **VINCULAR (link)** — Si el valor huérfano corresponde a una vertical/sub-vertical existente en la taxonomía pero no está vinculado:
   - Vincula a la categoría correcta (para verticales) o a la vertical correcta (para sub-verticales).
   - Si aplica a múltiples categorías, usa COMPARTIR en vez de vincular.

2. **FUSIONAR (merge)** — Si el valor huérfano es un sinónimo o variante de un término existente:
   - Fusiona con el término ya gestionado.
   - Ejemplo: "Fintech" y "FinTech" → fusionar. "IoT" y "Internet of Things" → fusionar.

3. **RENOMBRAR (rename)** — Si el nombre tiene errores tipográficos, capitalización inconsistente o podría ser más claro.

4. **COMPARTIR (share)** — Si una vertical aplica a más de una categoría (ej: "SaaS" en Startup, "IoT" en EBT y Startup).

5. **MOVER (move)** — Si una vertical está en la categoría incorrecta.

6. **ELIMINAR (delete)** — SOLO si no tiene empresas asociadas Y no aporta valor a la taxonomía.

REGLAS CRÍTICAS:
- ⚠️ NO dejes NINGÚN valor huérfano sin acción. Cada uno debe tener una sugerencia.
- Prioriza VINCULAR sobre crear nuevos términos.
- Si un huérfano no coincide con nada existente pero tiene empresas, VINCÚLALO a la categoría más apropiada.
- SaaS NUNCA como vertical de EBT. Es exclusiva de Startup.
- Si una vertical como "HealthTech", "EdTech", "FinTech" aplica a múltiples categorías, sugiere COMPARTIR.
- Sé agresivo fusionando: si dos términos significan esencialmente lo mismo, fusiona.
- Prioriza consistencia de nombres (PascalCase para verticales tech: "HealthTech", "EdTech", "FinTech", "AgriTech").
- Las sub-verticales huérfanas deben vincularse a la vertical más apropiada.

PRIORIDADES:
- HIGH: todos los valores huérfanos con empresas, fusiones de duplicados
- MEDIUM: compartir verticales entre categorías, renombramientos de consistencia
- LOW: eliminar términos vacíos, reorganizaciones menores

${customPrompt ? `\nINSTRUCCIONES ADICIONALES DEL USUARIO:\n${customPrompt}` : ""}

Responde ÚNICAMENTE llamando la función suggest_taxonomy_changes. DEBES incluir una sugerencia para CADA valor huérfano listado arriba.`;

    console.log(`Calling OpenAI ${model} (reasoning: ${reasoningEffort}, web: ${webSearchEnabled}) for taxonomy organization...`);
    console.log(`Orphan verticals: ${orphanVerticals.length}, Orphan sub-verticals: ${orphanSubVerticals.length}`);

    const tools: any[] = [];
    if (webSearchEnabled) {
      tools.push({ type: "web_search" as any });
    }
    tools.push({
      type: "function",
      name: "suggest_taxonomy_changes",
      description: "Return structured taxonomy reorganization suggestions. MUST include a suggestion for every orphan value.",
      parameters: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description: "Brief overall assessment of the taxonomy health (2-3 sentences). Include count of orphans processed.",
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
      orphanVerticalsInput: orphanVerticals.length,
      orphanSubVerticalsInput: orphanSubVerticals.length,
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
