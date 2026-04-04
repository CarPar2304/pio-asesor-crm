import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import OpenAI from "npm:openai@4.96.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CompanyInput {
  mode?: 'rues' | 'variables'; // "rues" = RUES only, "variables" = AI only, undefined = both (legacy)
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
    const tradeUpper = tradeName.toUpperCase();
    // Exact match first
    attempts.push(`razon_social=${tradeUpper}`);
    const r3 = await queryRUES(baseUrl, { razon_social: tradeUpper });
    if (r3.length > 0)
      return { data: r3, query: `razon_social=${tradeName}`, attempts };

    // Partial match (LIKE) - useful when legal name includes suffixes like "S.A.S", "BIC", etc.
    attempts.push(`razon_social LIKE '%${tradeUpper}%'`);
    const r3b = await queryRUES(baseUrl, { "$where": `upper(razon_social) like '%${tradeUpper}%'` });
    if (r3b.length > 0)
      return { data: r3b, query: `razon_social LIKE ${tradeName}`, attempts };
  }

  if (legalName && legalName !== tradeName) {
    const legalUpper = legalName.toUpperCase();
    attempts.push(`razon_social=${legalUpper}`);
    const r4 = await queryRUES(baseUrl, { razon_social: legalUpper });
    if (r4.length > 0)
      return { data: r4, query: `razon_social=${legalName}`, attempts };

    // Partial match for legal name too
    attempts.push(`razon_social LIKE '%${legalUpper}%'`);
    const r4b = await queryRUES(baseUrl, { "$where": `upper(razon_social) like '%${legalUpper}%'` });
    if (r4b.length > 0)
      return { data: r4b, query: `razon_social LIKE ${legalName}`, attempts };
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
      mode, tradeName, legalName, nit, website, contacts, taxonomy,
      category, vertical, subVertical, description, city, companyId,
    } = body;

    const isRuesMode = mode === 'rues';
    const isVariablesMode = mode === 'variables';

    // Step 1: RUES lookup (if not variables-only mode)
    let ruesResult = { data: null as any[] | null, query: "disabled", attempts: [] as string[] };
    if (!isVariablesMode && ruesEnabled) {
      console.log("Starting RUES lookup for:", { nit, tradeName, legalName });
      ruesResult = await lookupRUES(ruesApiUrl, nit, tradeName, legalName);
      console.log("RUES result:", {
        found: !!ruesResult.data,
        query: ruesResult.query,
        attempts: ruesResult.attempts,
        recordCount: ruesResult.data?.length || 0,
      });
    } else if (isVariablesMode) {
      console.log("RUES lookup skipped (variables-only mode)");
    } else {
      console.log("RUES lookup disabled by admin config");
    }

    // If RUES-only mode, return immediately with RUES data
    if (isRuesMode) {
      const durationMs = Date.now() - startTime;
      const ruesRecord = ruesResult.data?.[0] || null;
      
      // Extract fields from RUES record
      let extractedNit = nit;
      let extractedLegalName = legalName;
      let extractedTradeName = tradeName;
      let economicActivity = '';
      
      if (ruesRecord) {
        // NIT: strip verification digit
        if (ruesRecord.nit) {
          extractedNit = String(ruesRecord.nit).replace(/-\d$/, '');
        } else if (ruesRecord.numero_identificacion) {
          extractedNit = String(ruesRecord.numero_identificacion).replace(/-\d$/, '');
        }
        if (ruesRecord.razon_social) {
          extractedLegalName = ruesRecord.razon_social;
        }
        if (ruesRecord.cod_ciiu_act_econ_pri) {
          economicActivity = ruesRecord.cod_ciiu_act_econ_pri;
        }
      }

      const result = {
        legalName: extractedLegalName,
        nit: extractedNit,
        tradeName: extractedTradeName,
        economicActivity,
        ruesFound: !!ruesResult.data,
        ruesAttempts: ruesResult.attempts,
        ruesData: ruesRecord,
      };

      // Log
      await supabaseAdmin.from("company_fit_logs").insert({
        company_id: companyId || null,
        company_name: tradeName,
        request_payload: { mode: 'rues', tradeName, legalName, nit },
        response_payload: result,
        rues_data: ruesRecord,
        rues_found: !!ruesResult.data,
        rues_attempts: ruesResult.attempts,
        model: 'rues-only',
        reasoning_effort: 'n/a',
        duration_ms: durationMs,
        error: null,
        created_by: userId,
      });

      console.log("RUES-only result:", result);

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      basePrompt = `Eres un analista senior de CRM especializado en ecosistemas de innovación, startups y empresas de base tecnológica en Colombia y Latinoamérica. Tu trabajo es clasificar y enriquecer perfiles de empresas con precisión quirúrgica.

PERFIL ACTUAL DE LA EMPRESA:
• Nombre comercial: ${tradeName}
• Razón social: ${legalName}
• NIT: ${nit}
• Categoría: ${category}
• Vertical: ${vertical}
• Sub-vertical: ${subVertical}
• Descripción: ${description}
• Ciudad: ${city}
• Sitio web: ${website}

DATOS RUES:
${ruesText}

CONTACTOS:
${contactsText}

TAXONOMÍA DEL CRM:
${taxonomyText}

INSTRUCCIONES:

1. INVESTIGACIÓN WEB: Navega al sitio web (${website}) y analiza a fondo: propuesta de valor, productos/servicios, equipo, modelo de negocio. Si no carga, busca en Google, LinkedIn, Crunchbase.

2. CLASIFICACIÓN (orden estricto, detente en la primera que aplique):
   ① STARTUP: Producto tech escalable y replicable (SaaS, plataforma, marketplace, API como producto). No importa si no ha levantado capital.
   ② EBT: Tecnología propia real (hardware, software, I+D, patentes) pero modelo NO escalable tipo startup. NUNCA uses "SaaS" como vertical para EBT.
   ③ DISRUPTIVA: Propuesta moderna/innovadora SIN tecnología propia como núcleo.
   Categorías permitidas: ${taxonomy.categories.join(", ")}

3. VERTICAL/SUB-VERTICAL: Usa las existentes en la taxonomía si aplican. Vertical = genérica, Sub-vertical = específica. Solo sugiere nuevas si ninguna existente se ajusta.

4. DESCRIPCIÓN: 2-3 oraciones ejecutivas. Qué hace, a quién sirve, diferenciador. Sin adjetivos vacíos.

5. LOGO: Busca URL directa del logo (og:image, favicon, img con "logo"). URL absoluta pública a .png/.jpg/.svg/.webp. Null si no encuentras.

6. CONTACTOS: Infiere género (male/female) por nombre propio.

7. ESTADO: Activa/inactiva/desconocido según evidencia web y RUES.

8. CONFIANZA: high (evidencia clara), medium (parcial), low (insuficiente).

9. RAZONAMIENTO: Máximo 5 líneas explicando evidencia y por qué elegiste esa categoría.

Responde ÚNICAMENTE llamando la función analyze_company.`;
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
              logoUrl: { type: ["string", "null"], description: "Direct URL to company logo image (must be a publicly accessible direct link to a PNG, JPG, SVG, or WebP file, NOT a data URI or relative path). Try the company's Open Graph image, favicon, or look for <img> tags with 'logo' in the class/alt. Return null if no valid logo URL found." },
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
