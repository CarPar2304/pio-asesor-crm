import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import OpenAI from "npm:openai@4.96.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function buildManagedVerticalsBlock(managedVerticals: any[]) {
  if (!managedVerticals?.length) return "Ninguna vertical gestionada.";
  return managedVerticals.map((v: any) => {
    const cats = v.categories?.length ? v.categories.join(", ") : "SIN CATEGORÍA";
    const subs = v.sub_verticals?.length
      ? v.sub_verticals.map((sv: any) => `${sv.name} [id:${sv.id}]`).join(", ")
      : "ninguna";
    return `- "${v.name}" [id:${v.id}] — categorías: [${cats}] — ${v.company_count} empresas — sub-verticales: [${subs}]`;
  }).join("\n");
}

function buildManagedSubVerticalsBlock(managedSubVerticals: any[]) {
  if (!managedSubVerticals?.length) return "Ninguna sub-vertical gestionada.";
  return managedSubVerticals.map((sv: any) => {
    const verts = sv.verticals?.length
      ? sv.verticals.map((v: any) => `${v.name} [id:${v.id}]`).join(", ")
      : "SIN VERTICAL";
    return `- "${sv.name}" [id:${sv.id}] — verticales: [${verts}] — ${sv.company_count} empresas`;
  }).join("\n");
}

function buildCategoriesBlock(categories: any[]) {
  if (!categories?.length) return "Sin categorías.";
  return categories.map((c: any) => {
    const verts = c.verticals?.length
      ? c.verticals.map((v: any) => v.name).join(", ")
      : "ninguna";
    return `- "${c.name}" — ${c.company_count} empresas — verticales vinculadas: [${verts}]`;
  }).join("\n");
}

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
    const {
      taxonomyTree,
      definitions,
      categories: categoriesData,
      managedVerticals,
      managedSubVerticals,
      orphanVerticals,
      orphanSubVerticals,
      companyCounts,
      diagnostics,
    } = body;

    const client = new OpenAI({ apiKey: OPENAI_API_KEY });

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

    const orphanVerticalsBlock = orphanVerticals?.length > 0
      ? orphanVerticals.map((v: any) => `- "${v.name}" (${v.count} empresas)`).join("\n")
      : "Ninguna";

    const orphanSubVerticalsBlock = orphanSubVerticals?.length > 0
      ? orphanSubVerticals.map((v: any) => `- "${v.name}" (${v.count} empresas)`).join("\n")
      : "Ninguna";

    const prompt = `Eres un experto en gestión de taxonomías para CRM de ecosistemas de innovación, startups y empresas de base tecnológica en Colombia y Latinoamérica.

Tu misión es realizar un ANÁLISIS INTEGRAL Y EXHAUSTIVO de toda la taxonomía. No te limites a una sola tarea. Debes cubrir TODAS estas áreas en una sola pasada:

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
ÁREA 1: HUÉRFANOS — Organizar TODOS los valores sin gestionar
▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
Cada valor huérfano DEBE recibir una acción: link, merge, rename, share o delete.
NO dejes NINGÚN huérfano sin procesar. Si no encaja en nada existente, créalo con link.

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
ÁREA 2: FUSIONES entre verticales YA GESTIONADAS
▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
Analiza TODAS las verticales gestionadas buscando:
- Sinónimos o variantes: "FoodTech" vs "FoodTech: alimentos", "IA / Machine Learning" vs "IA + Soluciones de Negocio"
- Subconjuntos: si una vertical es un caso particular de otra más general
- Duplicados con distinta capitalización o formato
Sugiere merge del menos usado al más usado.

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
ÁREA 3: FUSIONES entre sub-verticales YA GESTIONADAS
▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
Misma lógica que Área 2 pero para sub-verticales. Busca duplicados, sinónimos y subconjuntos.

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
ÁREA 4: COMPARTIR verticales entre categorías
▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
Usa las DEFINICIONES de cada categoría para determinar si una vertical debería estar disponible en más de una categoría.
Ejemplo: "HealthTech" puede aplicar a Startup, EBT y Disruptiva. "FinTech" a Startup y EBT.
Revisa CADA vertical gestionada y evalúa si debería compartirse según las definiciones.

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
ÁREA 5: RENOMBRAMIENTOS de consistencia
▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
- PascalCase para verticales tech: "HealthTech", "EdTech", "FinTech", "AgriTech"
- Eliminar sufijos innecesarios como ": salud", ": alimentos", ": procesos industriales"
- Corregir errores tipográficos

═══════════════════════════════════════
DEFINICIONES DEL SISTEMA DE CLASIFICACIÓN
═══════════════════════════════════════
${definitions || "No hay definiciones configuradas. Usa tu criterio de experto."}

═══════════════════════════════════════
ÁRBOL TAXONÓMICO LEGIBLE
═══════════════════════════════════════
${taxonomyTree}

═══════════════════════════════════════
CATEGORÍAS ESTRUCTURADAS (con verticales vinculadas)
═══════════════════════════════════════
${buildCategoriesBlock(categoriesData)}

═══════════════════════════════════════
VERTICALES GESTIONADAS (con relaciones completas)
═══════════════════════════════════════
${buildManagedVerticalsBlock(managedVerticals)}

═══════════════════════════════════════
SUB-VERTICALES GESTIONADAS (con relaciones completas)
═══════════════════════════════════════
${buildManagedSubVerticalsBlock(managedSubVerticals)}

═══════════════════════════════════════
VALORES HUÉRFANOS — PRIORIDAD MÁXIMA
═══════════════════════════════════════
⚠️ TODOS deben tener una acción asignada. No dejes ninguno.

Verticales huérfanas:
${orphanVerticalsBlock}

Sub-verticales huérfanas:
${orphanSubVerticalsBlock}

═══════════════════════════════════════
CONTEO DE USO
═══════════════════════════════════════
${companyCounts}

═══════════════════════════════════════
DIAGNÓSTICO DEL PAYLOAD VALIDADO
═══════════════════════════════════════
${diagnostics ? JSON.stringify(diagnostics, null, 2) : "No disponible"}

═══════════════════════════════════════
ACCIONES DISPONIBLES
═══════════════════════════════════════
1. link — Vincular un huérfano a una categoría (para verticales) o a una vertical (para sub-verticales). Incluye destination_name (categoría o vertical) y destination_id si es vertical.
2. merge — Fusionar un término (huérfano O gestionado) con otro gestionado. Incluye target_id (vacío si huérfano) y destination_id.
3. rename — Renombrar un término. Incluye target_id (vacío si huérfano) y new_name.
4. share — Compartir una vertical gestionada con una categoría adicional. target_id = ID de la vertical, destination_name = nombre de la categoría destino.
5. move — Mover una vertical de una categoría a otra. target_id = ID vertical, destination_name = categoría destino.
6. delete — Eliminar un término sin empresas y sin valor. target_id (vacío si huérfano).

REGLAS CRÍTICAS:
- ⚠️ CERO huérfanos deben quedar sin acción.
- Analiza fusiones entre verticales GESTIONADAS (no solo huérfanos).
- Analiza fusiones entre sub-verticales GESTIONADAS.
- Evalúa sharing de verticales entre categorías usando las DEFINICIONES.
- SaaS NUNCA como vertical de EBT.
- Sé agresivo fusionando sinónimos y variantes.
- Incluye target_id y destination_id siempre que los IDs estén disponibles en el contexto.

PRIORIDADES:
- HIGH: huérfanos con empresas, fusiones de duplicados gestionados
- MEDIUM: compartir verticales entre categorías, renombramientos
- LOW: eliminar vacíos, reorganizaciones menores

${customPrompt ? "\nINSTRUCCIONES ADICIONALES DEL USUARIO:\n" + customPrompt : ""}

Responde ÚNICAMENTE llamando la función suggest_taxonomy_changes.`;

    console.log("Calling OpenAI " + model + " (reasoning: " + reasoningEffort + ", web: " + webSearchEnabled + ")");
    console.log("Payload: " + (diagnostics ? JSON.stringify(diagnostics) : "no diagnostics"));
    console.log("Orphan verticals: " + (orphanVerticals?.length || 0) + ", Orphan sub-verticals: " + (orphanSubVerticals?.length || 0));
    console.log("Managed verticals: " + (managedVerticals?.length || 0) + ", Managed sub-verticals: " + (managedSubVerticals?.length || 0));

    const tools: any[] = [];
    if (webSearchEnabled) {
      tools.push({ type: "web_search" as any });
    }
    tools.push({
      type: "function",
      name: "suggest_taxonomy_changes",
      description: "Return structured taxonomy reorganization suggestions covering ALL 5 areas: orphans, vertical merges, sub-vertical merges, category sharing, and renames.",
      parameters: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description: "Assessment covering all 5 areas analyzed. Include counts: orphans processed, merges proposed, shares proposed, renames proposed.",
          },
          suggestions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "Unique ID (e.g. 'sug-1')" },
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
                target_id: { type: "string", description: "ID of the item if known (from the structured data), empty string if orphan" },
                destination_name: { type: ["string", "null"], description: "For merge/move/link/share: destination name" },
                destination_id: { type: ["string", "null"], description: "For merge/move/link/share: destination ID from the structured data" },
                new_name: { type: ["string", "null"], description: "For rename: the new name" },
                reason: { type: "string", description: "Brief explanation" },
                affected_companies: { type: "number", description: "Number of companies affected" },
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

    result._meta = {
      model,
      reasoning_effort: reasoningEffort,
      orphan_verticals: orphanVerticals?.length || 0,
      orphan_sub_verticals: orphanSubVerticals?.length || 0,
      managed_verticals: managedVerticals?.length || 0,
      managed_sub_verticals: managedSubVerticals?.length || 0,
      diagnostics: diagnostics || null,
    };

    console.log("Taxonomy organize result:", {
      suggestionsCount: result.suggestions?.length || 0,
      orphanVerticalsInput: orphanVerticals?.length || 0,
      orphanSubVerticalsInput: orphanSubVerticals?.length || 0,
      managedVerticalsInput: managedVerticals?.length || 0,
      managedSubVerticalsInput: managedSubVerticals?.length || 0,
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
