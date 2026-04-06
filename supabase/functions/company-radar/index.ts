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
    const { query } = await req.json();
    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Se requiere una consulta de búsqueda" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Initialize Supabase admin client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Fetch all taxonomy data in parallel
    const [vertRes, svRes, cvRes, vsvRes, catRes, settingsRes, defRes] = await Promise.all([
      sb.from("crm_verticals").select("id, name"),
      sb.from("crm_sub_verticals").select("id, name"),
      sb.from("crm_category_verticals").select("category, vertical_id"),
      sb.from("crm_vertical_sub_verticals").select("vertical_id, sub_vertical_id"),
      sb.from("crm_categories").select("name, level1_label, level2_label"),
      sb.from("feature_settings").select("config").eq("feature_key", "company_radar").single(),
      sb.from("feature_settings").select("config").eq("feature_key", "taxonomy_organize").single(),
    ]);

    const verticals = vertRes.data || [];
    const subVerticals = svRes.data || [];
    const categoryVerticalLinks = cvRes.data || [];
    const verticalSubVerticalLinks = vsvRes.data || [];
    const categories = catRes.data || [];

    // Build settings
    const settings = (settingsRes.data?.config as any) || {};
    const model = settings.model || "gpt-4.1-mini";
    const reasoningEffort = settings.reasoning_effort || "medium";

    // Get taxonomy definitions from taxonomy_organize settings
    const taxonomyOrgConfig = (defRes.data?.config as any) || {};
    const definitions = taxonomyOrgConfig.definitions || {};

    // Build taxonomy tree text
    const categoryNames = categories.map((c: any) => c.name);
    
    // Build structured tree
    const taxonomyTree: string[] = [];
    for (const cat of categories) {
      const catVertIds = categoryVerticalLinks
        .filter((l: any) => l.category === cat.name)
        .map((l: any) => l.vertical_id);
      const catVerts = verticals.filter((v: any) => catVertIds.includes(v.id));
      
      const catDef = definitions[cat.name] || "";
      taxonomyTree.push(`\n📁 CATEGORÍA: "${cat.name}"${cat.level1_label ? ` (${cat.level1_label})` : ""}${catDef ? `\n   Definición: ${catDef}` : ""}`);
      
      if (catVerts.length === 0) {
        taxonomyTree.push(`   └─ (sin verticales asignadas)`);
      } else {
        for (const vert of catVerts) {
          const vertSvIds = verticalSubVerticalLinks
            .filter((l: any) => l.vertical_id === vert.id)
            .map((l: any) => l.sub_vertical_id);
          const vertSvs = subVerticals.filter((sv: any) => vertSvIds.includes(sv.id));
          
          taxonomyTree.push(`   ├─ Vertical: "${vert.name}"`);
          if (vertSvs.length > 0) {
            for (const sv of vertSvs) {
              taxonomyTree.push(`   │  └─ Sub-vertical: "${sv.name}"`);
            }
          }
        }
      }
    }

    // Also include verticals not assigned to any category
    const assignedVertIds = new Set(categoryVerticalLinks.map((l: any) => l.vertical_id));
    const unassignedVerts = verticals.filter((v: any) => !assignedVertIds.has(v.id));
    if (unassignedVerts.length > 0) {
      taxonomyTree.push(`\n📁 VERTICALES SIN CATEGORÍA ASIGNADA:`);
      for (const vert of unassignedVerts) {
        const vertSvIds = verticalSubVerticalLinks
          .filter((l: any) => l.vertical_id === vert.id)
          .map((l: any) => l.sub_vertical_id);
        const vertSvs = subVerticals.filter((sv: any) => vertSvIds.includes(sv.id));
        taxonomyTree.push(`   ├─ Vertical: "${vert.name}"`);
        if (vertSvs.length > 0) {
          for (const sv of vertSvs) {
            taxonomyTree.push(`   │  └─ Sub-vertical: "${sv.name}"`);
          }
        }
      }
    }

    // Include sub-verticals not linked to any vertical
    const assignedSvIds = new Set(verticalSubVerticalLinks.map((l: any) => l.sub_vertical_id));
    const unassignedSvs = subVerticals.filter((sv: any) => !assignedSvIds.has(sv.id));
    if (unassignedSvs.length > 0) {
      taxonomyTree.push(`\n📁 SUB-VERTICALES SIN VERTICAL ASIGNADA:`);
      for (const sv of unassignedSvs) {
        taxonomyTree.push(`   └─ "${sv.name}"`);
      }
    }

    const taxonomyText = taxonomyTree.join("\n");

    // Build the system prompt
    const customPrompt = settings.base_prompt || "";
    
    const systemPrompt = `Eres "Company Radar", un asistente inteligente de filtrado para un CRM de empresas de innovación, startups y empresas de base tecnológica. Tu trabajo es interpretar solicitudes en lenguaje natural del usuario y traducirlas a filtros estructurados que el sistema pueda aplicar.

═══════════════════════════════════════
TAXONOMÍA COMPLETA DEL CRM
═══════════════════════════════════════
${taxonomyText}

═══════════════════════════════════════
CATEGORÍAS DISPONIBLES
═══════════════════════════════════════
${categoryNames.map((c: string) => `• "${c}"`).join("\n")}

═══════════════════════════════════════
TODAS LAS VERTICALES
═══════════════════════════════════════
${verticals.map((v: any) => `• "${v.name}"`).join("\n")}

═══════════════════════════════════════
TODAS LAS SUB-VERTICALES
═══════════════════════════════════════
${subVerticals.map((sv: any) => `• "${sv.name}"`).join("\n")}

═══════════════════════════════════════
CIUDADES COMUNES
═══════════════════════════════════════
Cali, Palmira, Yumbo, Jamundí, Buenaventura, Buga, Tuluá, Cartago

═══════════════════════════════════════
FILTROS DISPONIBLES
═══════════════════════════════════════

Además de categoría, vertical, sub-vertical y ciudad, el CRM permite estos filtros financieros y de estado:

- salesMin / salesMax: ventas mínimas/máximas en MILLONES de pesos colombianos (COP). Ej: si el usuario dice "empresas con ventas mayores a 10 mil millones", salesMin = "10000" (porque 10.000 millones ÷ 1.000.000 = 10000). Si dice "más de 500 millones", salesMin = "500".
- avgYoYMin / avgYoYMax: crecimiento promedio interanual mínimo/máximo en porcentaje. Ej: "empresas que crecen más del 20%" → avgYoYMin = "20".
- lastYoYMin / lastYoYMax: crecimiento del último año interanual mínimo/máximo en porcentaje.
- nitFilter: filtrar por NIT. Valores posibles: "" (sin filtro), "has" (solo empresas CON NIT), "no" (solo empresas SIN NIT).
- sortField: campo para ordenar. Valores: "tradeName", "city", "vertical", "salesByYear", "createdAt".
- sortDirection: dirección del orden. Valores: "asc", "desc".

Reglas para filtros financieros:
- Los valores de ventas siempre son en MILLONES. 1.000 millones = 1000.
- Si el usuario menciona rangos de ventas, usa salesMin y/o salesMax.
- Si el usuario pide empresas "grandes" o "con altas ventas", usa salesMin con un valor razonable (ej: 1000 para >1.000M).
- Si pide "startups pequeñas" o "empresas pequeñas", usa salesMax con un valor bajo (ej: 500 para <500M).
- Si el usuario pide ordenar por ventas, tamaño, o ingresos, usa sortField="salesByYear".
- Si pide "las más grandes primero" o "mayores ventas", usa sortDirection="desc".
- Si pide "las más recientes", usa sortField="createdAt" y sortDirection="desc".

═══════════════════════════════════════
INSTRUCCIONES
═══════════════════════════════════════

El usuario te describirá en lenguaje natural qué tipo de empresas necesita encontrar. Tu trabajo es:

1. INTERPRETAR la intención del usuario y mapearla a los filtros disponibles del CRM.

2. SELECCIONAR los valores correctos de la taxonomía existente. Debes usar EXACTAMENTE los nombres tal como aparecen en la taxonomía (respetando mayúsculas, tildes y espacios).

3. PENSAR EN AMPLITUD: Si el usuario pide algo general como "empresas de salud", debes incluir TODAS las verticales y sub-verticales relacionadas con salud, no solo una. Lo mismo para cualquier otro tema.

4. INCLUIR TÉRMINOS RELACIONADOS: Si el usuario busca "IA", incluye también "Machine Learning", "Deep Learning", "NLP", etc. si existen en la taxonomía.

5. PRIORIZAR PRECISIÓN: Solo incluye categorías/verticales/sub-verticales que realmente apliquen a la solicitud. No incluyas todo el catálogo.

6. Si el usuario menciona una ciudad específica, inclúyela en los filtros.

7. Si la solicitud no puede mapearse a ningún filtro existente de la taxonomía, devuelve un JSON con arrays vacíos y explica en el campo "reasoning" por qué no se encontraron coincidencias.

8. El campo "search" es para texto libre que se buscará en nombre comercial, razón social y NIT. Úsalo SOLO si el usuario menciona un nombre específico de empresa.

9. Usa los filtros financieros (salesMin, salesMax, avgYoYMin, etc.) cuando el usuario mencione tamaño, ventas, ingresos, crecimiento, o cualquier criterio cuantitativo.

10. Usa sortField y sortDirection cuando el usuario pida un orden específico o implícito (ej: "las más grandes", "ordenar por nombre", "más recientes").

${customPrompt ? `\n═══════════════════════════════════════\nINSTRUCCIONES ADICIONALES DEL ADMINISTRADOR\n═══════════════════════════════════════\n${customPrompt}\n` : ""}

═══════════════════════════════════════
FORMATO DE RESPUESTA
═══════════════════════════════════════

Responde ÚNICAMENTE llamando la función apply_filters con los filtros apropiados.`;

    // Initialize OpenAI
    const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

    const toolDef: OpenAI.Chat.Completions.ChatCompletionTool = {
      type: "function",
      function: {
        name: "apply_filters",
        description: "Aplica filtros inteligentes al CRM basados en la solicitud del usuario. Retorna los filtros que se deben activar.",
        parameters: {
          type: "object",
          properties: {
            category: {
              type: "array",
              items: { type: "string" },
              description: "Categorías a filtrar. Debe usar exactamente los nombres de la taxonomía.",
            },
            vertical: {
              type: "array",
              items: { type: "string" },
              description: "Verticales a filtrar. Debe usar exactamente los nombres de la taxonomía.",
            },
            economicActivity: {
              type: "array",
              items: { type: "string" },
              description: "Sub-verticales (actividad económica) a filtrar. Debe usar exactamente los nombres de la taxonomía.",
            },
            city: {
              type: "array",
              items: { type: "string" },
              description: "Ciudades a filtrar.",
            },
            search: {
              type: "string",
              description: "Texto de búsqueda libre para buscar por nombre comercial, razón social o NIT. Solo usar si el usuario menciona un nombre específico.",
            },
            salesMin: {
              type: "string",
              description: "Ventas mínimas en millones de COP. Dejar vacío si no aplica.",
            },
            salesMax: {
              type: "string",
              description: "Ventas máximas en millones de COP. Dejar vacío si no aplica.",
            },
            avgYoYMin: {
              type: "string",
              description: "Crecimiento promedio interanual mínimo en %. Dejar vacío si no aplica.",
            },
            avgYoYMax: {
              type: "string",
              description: "Crecimiento promedio interanual máximo en %. Dejar vacío si no aplica.",
            },
            lastYoYMin: {
              type: "string",
              description: "Crecimiento último año mínimo en %. Dejar vacío si no aplica.",
            },
            lastYoYMax: {
              type: "string",
              description: "Crecimiento último año máximo en %. Dejar vacío si no aplica.",
            },
            nitFilter: {
              type: "string",
              enum: ["", "has", "no"],
              description: "Filtro de NIT: '' sin filtro, 'has' solo con NIT, 'no' solo sin NIT.",
            },
            sortField: {
              type: "string",
              enum: ["tradeName", "city", "vertical", "salesByYear", "createdAt"],
              description: "Campo por el cual ordenar los resultados.",
            },
            sortDirection: {
              type: "string",
              enum: ["asc", "desc"],
              description: "Dirección del orden: ascendente o descendente.",
            },
            reasoning: {
              type: "string",
              description: "Explicación breve (2-3 líneas) de por qué se eligieron estos filtros y qué se busca.",
            },
          },
          required: ["category", "vertical", "economicActivity", "city", "search", "reasoning"],
          additionalProperties: false,
        },
      },
    };

    const requestBody: any = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
      tools: [toolDef],
      tool_choice: { type: "function", function: { name: "apply_filters" } },
    };

    // Add reasoning if supported
    if (["o3", "o4-mini"].includes(model)) {
      requestBody.reasoning = { effort: reasoningEffort };
    } else if (reasoningEffort !== "low") {
      // For non-reasoning models, we don't add this
    }

    console.log(`[company-radar] model=${model}, reasoning=${reasoningEffort}, query="${query.substring(0, 100)}"`);

    const completion = await openai.chat.completions.create(requestBody);

    const toolCall = completion.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== "apply_filters") {
      return new Response(JSON.stringify({ error: "El modelo no retornó filtros válidos" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const filters = JSON.parse(toolCall.function.arguments);

    console.log(`[company-radar] filters:`, JSON.stringify(filters));

    return new Response(JSON.stringify({ filters, model, reasoning_effort: reasoningEffort }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[company-radar] error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
