import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import OpenAI from "npm:openai@4.96.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CompanyInput {
  tradeName: string;
  legalName: string;
  nit: string;
  category: string;
  vertical: string;
  subVertical: string;
  description: string;
  website: string;
  city: string;
  companyId?: string;
  contacts: Array<{ id: string; name: string; gender: string }>;
  taxonomy: {
    categories: string[];
    verticals: Array<{ name: string; category: string }>;
    subVerticals: Array<{ name: string; vertical: string }>;
  };
}

// --- RUES lookup ---
async function queryRUES(baseUrl: string, params: Record<string, string>): Promise<any[]> {
  const url = new URL(baseUrl);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  url.searchParams.set(
    "$select",
    "camara_comercio,matricula,razon_social,clase_identificacion,numero_identificacion,cod_ciiu_act_econ_pri,fecha_matricula,categoria_matricula,nit,organizacion_juridica"
  );
  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

async function lookupRUES(
  baseUrl: string,
  nit: string,
  tradeName: string,
  legalName: string
): Promise<{ data: any[] | null; query: string; attempts: string[] }> {
  const attempts: string[] = [];

  if (nit) {
    attempts.push(`nit=${nit}`);
    const r1 = await queryRUES(baseUrl, { nit });
    if (r1.length > 0) return { data: r1, query: `nit=${nit}`, attempts };

    if (nit.length > 1) {
      const nitShort = nit.replace(/[-\s]/g, "").slice(0, -1);
      attempts.push(`nit=${nitShort} (sin dígito)`);
      const r2 = await queryRUES(baseUrl, { nit: nitShort });
      if (r2.length > 0)
        return { data: r2, query: `nit=${nitShort} (sin dígito)`, attempts };
    }
  }

  if (tradeName) {
    attempts.push(`razon_social=${tradeName.toUpperCase()}`);
    const r3 = await queryRUES(baseUrl, { razon_social: tradeName.toUpperCase() });
    if (r3.length > 0)
      return { data: r3, query: `razon_social=${tradeName}`, attempts };
  }

  if (legalName && legalName !== tradeName) {
    attempts.push(`razon_social=${legalName.toUpperCase()}`);
    const r4 = await queryRUES(baseUrl, { razon_social: legalName.toUpperCase() });
    if (r4.length > 0)
      return { data: r4, query: `razon_social=${legalName}`, attempts };
  }

  return { data: null, query: "no results", attempts };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create supabase admin client for logging
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth user from request
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    if (authHeader) {
      const supabaseAnon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { data: { user } } = await supabaseAnon.auth.getUser(authHeader.replace("Bearer ", ""));
      userId = user?.id || null;
    }

    // Fetch feature settings from DB
    const { data: settingsRow } = await supabaseAdmin
      .from("feature_settings")
      .select("config")
      .eq("feature_key", "company_fit")
      .single();

    const settings = settingsRow?.config as any || {};
    const model = settings.model || "gpt-5.4";
    const reasoningEffort = settings.reasoning_effort || "high";
    const customPrompt = settings.prompt || "";
    const dbBasePrompt = settings.base_prompt || "";
    const webSearchEnabled = settings.web_search_enabled !== false;
    const ruesEnabled = settings.rues_enabled !== false;
    const ruesApiUrl = settings.rues_api_url || "https://www.datos.gov.co/resource/c82u-588k.json";

    const body: CompanyInput = await req.json();
    const {
      tradeName, legalName, nit, website, contacts, taxonomy,
      category, vertical, subVertical, description, city, companyId,
    } = body;

    // Step 1: RUES lookup (if enabled)
    let ruesResult = { data: null as any[] | null, query: "disabled", attempts: [] as string[] };
    if (ruesEnabled) {
      console.log("Starting RUES lookup for:", { nit, tradeName, legalName });
      ruesResult = await lookupRUES(ruesApiUrl, nit, tradeName, legalName);
      console.log("RUES result:", {
        found: !!ruesResult.data,
        query: ruesResult.query,
        attempts: ruesResult.attempts,
        recordCount: ruesResult.data?.length || 0,
      });
    } else {
      console.log("RUES lookup disabled by admin config");
    }

    // Step 2: Build the prompt
    const taxonomyText = `
CATEGORÍAS DISPONIBLES: ${taxonomy.categories.join(", ")}

VERTICALES POR CATEGORÍA:
${taxonomy.verticals.map((v) => `- ${v.category} → ${v.name}`).join("\n")}

SUB-VERTICALES POR VERTICAL:
${taxonomy.subVerticals.map((s) => `- ${s.vertical} → ${s.name}`).join("\n")}
`;

    const ruesText = ruesResult.data
      ? `DATOS RUES ENCONTRADOS (query: ${ruesResult.query}):\n${JSON.stringify(ruesResult.data.slice(0, 3), null, 2)}`
      : ruesEnabled
        ? `No se encontraron datos en RUES. Intentos realizados: ${ruesResult.attempts.join(", ")}`
        : "Consulta RUES deshabilitada por configuración.";

    const contactsText = contacts
      .map((c) => `- ${c.name} (id: ${c.id}, género actual: ${c.gender || "sin definir"})`)
      .join("\n");

    // Use DB base prompt if set, otherwise use hardcoded default
    let basePrompt: string;
    if (dbBasePrompt && dbBasePrompt.trim()) {
      // Replace template variables
      basePrompt = dbBasePrompt
        .replace(/\{tradeName\}/g, tradeName)
        .replace(/\{legalName\}/g, legalName)
        .replace(/\{nit\}/g, nit)
        .replace(/\{category\}/g, category)
        .replace(/\{vertical\}/g, vertical)
        .replace(/\{subVertical\}/g, subVertical)
        .replace(/\{description\}/g, description)
        .replace(/\{city\}/g, city)
        .replace(/\{website\}/g, website)
        .replace(/\{ruesText\}/g, ruesText)
        .replace(/\{contactsText\}/g, contactsText)
        .replace(/\{taxonomyText\}/g, taxonomyText)
        .replace(/\{categoriesList\}/g, taxonomy.categories.join(", "));
    } else {
      basePrompt = `Actúa como analista de CRM para clasificar empresas con base en su sitio web oficial y datos públicos.

DATOS ACTUALES DE LA EMPRESA:
- Nombre comercial: ${tradeName}
- Razón social: ${legalName}
- NIT: ${nit}
- Categoría actual: ${category}
- Vertical actual: ${vertical}
- Sub-vertical actual: ${subVertical}
- Descripción actual: ${description}
- Ciudad: ${city}
- Sitio web: ${website}

${ruesText}

CONTACTOS (determina género por nombre):
${contactsText}

TAXONOMÍA DEL CRM:
${taxonomyText}

TU TAREA:

1. Busca la empresa en internet usando su sitio web (${website}) y nombre comercial (${tradeName}). Analiza el sitio web a fondo. Lee su contenido, servicios, productos, equipo, y cualquier información relevante.

2. CLASIFICACIÓN - Determina si la empresa es. PIENSA PASO A PASO y justifica tu razonamiento:
   a) Startup - Base tecnológica clara + potencial de escalabilidad/replicabilidad. Señales: SaaS, plataforma digital, marketplace tecnológico, app con lógica repetible, software con suscripción, automatización/IA como núcleo. NO importa si no ha levantado capital.
   b) EBT (Empresa de Base Tecnológica) - Base tecnológica real PERO sin producto startup claramente escalable. Modelo depende de proyectos a medida, integración, consultoría técnica, manufactura especializada, outsourcing, dispositivos hardware, IoT sin plataforma SaaS clara. NUNCA uses "SaaS" como vertical para esta categoría. Ejemplos: empresa que desarrolla dispositivos médicos, empresa de consultoría en IA/datos, empresa de hardware IoT, empresa de biotecnología sin plataforma digital escalable.
   c) Disruptiva - No es startup ni EBT, pero tiene propuesta moderna, digital, innovadora. Servicios, marcas, agencias, e-commerce sin tech propia como core. SOLO clasifica como Disruptiva si NO hay evidencia clara de base tecnológica propia.
   
   ORDEN OBLIGATORIO de análisis: ¿Es Startup? → ¿Es EBT? → ¿Es Disruptiva?
   
   REGLA CLAVE: Si la empresa tiene tecnología propia (hardware, software, dispositivos, algoritmos, patentes) pero NO es un producto digital escalable tipo SaaS/marketplace/plataforma, entonces ES EBT, NO Disruptiva.

   IMPORTANTE: Solo puedes usar las categorías que existen en la taxonomía: ${taxonomy.categories.join(", ")}. Escoge la más cercana.

3. VERTICAL Y SUB-VERTICAL - Usa las existentes en la taxonomía si alguna aplica. Si ninguna aplica, sugiere una nueva. Si la empresa es EBT, NUNCA uses "SaaS" como vertical.

4. DESCRIPCIÓN - Escribe un párrafo corto, claro y concreto describiendo la empresa. Máximo 3 oraciones.

5. LOGO - Busca la URL del logo de la empresa en su sitio web. Debe ser una URL directa a una imagen (png, jpg, svg, webp).

6. CONTACTOS - Para cada contacto, determina el género (male/female) basándote en el nombre.

7. VALIDACIÓN LEGAL - Con los datos de RUES (si hay), valida/completa:
   - Razón social correcta
   - NIT correcto
   - Nombre comercial (puede diferir de razón social, es el nombre de la marca)

8. ESTADO - Determina si la empresa está activa o inactiva según la información encontrada.

REGLAS:
- Sé concreto y ejecutivo. No inventes.
- Si la evidencia es débil, indica confianza media o baja.
- La vertical debe ser lo más genérica posible.
- La sub-vertical más específica.
- PIENSA CUIDADOSAMENTE antes de clasificar. Analiza la evidencia del sitio web.

Responde ÚNICAMENTE llamando la función analyze_company con los resultados.`;
    }

    const fullPrompt = customPrompt 
      ? `${basePrompt}\n\nINSTRUCCIONES ADICIONALES DEL ADMINISTRADOR:\n${customPrompt}`
      : basePrompt;

    const client = new OpenAI({ apiKey: OPENAI_API_KEY });

    console.log(`Calling OpenAI ${model} with reasoning effort: ${reasoningEffort}, web_search: ${webSearchEnabled}...`);

    const tools: any[] = [];
    if (webSearchEnabled) {
      tools.push({ type: "web_search" as any });
    }
    tools.push({
          type: "function",
          name: "analyze_company",
          description: "Return structured analysis results for the company",
          parameters: {
            type: "object",
            properties: {
              category: { type: "string", description: "Company category from available taxonomy" },
              vertical: { type: "string", description: "Vertical (existing or new suggested)" },
              subVertical: { type: "string", description: "Sub-vertical (existing or new suggested)" },
              description: { type: "string", description: "Short company description, 1-3 sentences" },
              logoUrl: { type: ["string", "null"], description: "Direct URL to company logo image, or null" },
              legalName: { type: ["string", "null"], description: "Validated legal name from RUES or web" },
              nit: { type: ["string", "null"], description: "Validated NIT from RUES or web. Return ONLY the base NIT number WITHOUT the verification digit (e.g. '901313597' not '901313597-7')" },
              tradeName: { type: ["string", "null"], description: "Validated trade/brand name" },
              contacts: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    gender: { type: "string", enum: ["male", "female"] },
                  },
                  required: ["id", "gender"],
                },
                description: "Contact genders inferred from names",
              },
              companyStatus: { type: "string", enum: ["active", "inactive", "unknown"] },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
              reasoning: { type: "string", description: "Brief explanation of classification reasoning (max 5 lines). Explain WHY you chose this category over others." },
              isNewVertical: { type: "boolean", description: "Whether the suggested vertical is new" },
              isNewSubVertical: { type: "boolean", description: "Whether the suggested sub-vertical is new" },
            },
            required: [
              "category", "vertical", "subVertical", "description", "logoUrl",
              "legalName", "nit", "tradeName", "contacts", "companyStatus",
              "confidence", "reasoning", "isNewVertical", "isNewSubVertical",
            ],
            additionalProperties: false,
          },
    });

    const response = await client.responses.create({
      model,
      reasoning: {
        effort: reasoningEffort as any,
      },
      tools,
      input: fullPrompt,
    });

    console.log("OpenAI response received, output items:", response.output.length);

    // Extract function call result
    let result: any = null;
    for (const item of response.output) {
      if (item.type === "function_call" && item.name === "analyze_company") {
        try {
          result = JSON.parse(item.arguments);
        } catch {
          result = null;
        }
        break;
      }
    }

    const durationMs = Date.now() - startTime;

    if (!result) {
      const textOutput = response.output_text;
      console.error("No structured response. Raw output:", textOutput);

      // Log error
      await supabaseAdmin.from("company_fit_logs").insert({
        company_id: companyId || null,
        company_name: tradeName,
        request_payload: { tradeName, legalName, nit, website, city, category, vertical },
        response_payload: { raw: textOutput },
        rues_data: ruesResult.data?.[0] || null,
        rues_found: !!ruesResult.data,
        rues_attempts: ruesResult.attempts,
        model,
        reasoning_effort: reasoningEffort,
        duration_ms: durationMs,
        error: "No structured response from AI",
        created_by: userId,
      });

      return new Response(
        JSON.stringify({ error: "No structured response from AI", raw: textOutput }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Strip verification digit from NIT if present (e.g. "901313597-7" → "901313597")
    if (result.nit && typeof result.nit === 'string') {
      result.nit = result.nit.replace(/-\d$/, '');
    }

    // Add RUES data and status to response
    result.ruesData = ruesResult.data?.[0] || null;
    result.ruesFound = !!ruesResult.data;
    result.ruesAttempts = ruesResult.attempts;

    console.log("Company Fit result:", {
      category: result.category,
      vertical: result.vertical,
      subVertical: result.subVertical,
      confidence: result.confidence,
      ruesFound: result.ruesFound,
      isNewVertical: result.isNewVertical,
      isNewSubVertical: result.isNewSubVertical,
      durationMs,
    });

    // Log success
    await supabaseAdmin.from("company_fit_logs").insert({
      company_id: companyId || null,
      company_name: tradeName,
      request_payload: { tradeName, legalName, nit, website, city, category, vertical },
      response_payload: result,
      rues_data: ruesResult.data?.[0] || null,
      rues_found: !!ruesResult.data,
      rues_attempts: ruesResult.attempts,
      model,
      reasoning_effort: reasoningEffort,
      duration_ms: durationMs,
      error: null,
      created_by: userId,
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    console.error("company-fit error:", error);

    // Try to log the error
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
      await supabaseAdmin.from("company_fit_logs").insert({
        company_name: "unknown",
        error: error instanceof Error ? error.message : "Unknown error",
        duration_ms: durationMs,
        model: "unknown",
        reasoning_effort: "unknown",
      });
    } catch { /* ignore logging errors */ }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
