import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
  contacts: Array<{ id: string; name: string; gender: string }>;
  taxonomy: {
    categories: string[];
    verticals: Array<{ name: string; category: string }>;
    subVerticals: Array<{ name: string; vertical: string }>;
  };
}

// --- RUES lookup ---
async function queryRUES(params: Record<string, string>): Promise<any[]> {
  const url = new URL("https://www.datos.gov.co/resource/c82u-588k.json");
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
  nit: string,
  tradeName: string,
  legalName: string
): Promise<{ data: any[] | null; query: string; attempts: string[] }> {
  const attempts: string[] = [];

  // Attempt 1: by NIT as-is
  if (nit) {
    attempts.push(`nit=${nit}`);
    const r1 = await queryRUES({ nit });
    if (r1.length > 0) return { data: r1, query: `nit=${nit}`, attempts };

    // Attempt 2: NIT without last digit (verification digit)
    if (nit.length > 1) {
      const nitShort = nit.replace(/[-\s]/g, "").slice(0, -1);
      attempts.push(`nit=${nitShort} (sin dígito)`);
      const r2 = await queryRUES({ nit: nitShort });
      if (r2.length > 0)
        return { data: r2, query: `nit=${nitShort} (sin dígito)`, attempts };
    }
  }

  // Attempt 3: by razon_social with tradeName
  if (tradeName) {
    attempts.push(`razon_social=${tradeName.toUpperCase()}`);
    const r3 = await queryRUES({ razon_social: tradeName.toUpperCase() });
    if (r3.length > 0)
      return { data: r3, query: `razon_social=${tradeName}`, attempts };
  }

  // Attempt 4: by razon_social with legalName
  if (legalName && legalName !== tradeName) {
    attempts.push(`razon_social=${legalName.toUpperCase()}`);
    const r4 = await queryRUES({ razon_social: legalName.toUpperCase() });
    if (r4.length > 0)
      return { data: r4, query: `razon_social=${legalName}`, attempts };
  }

  return { data: null, query: "no results", attempts };
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

    const body: CompanyInput = await req.json();
    const {
      tradeName,
      legalName,
      nit,
      website,
      contacts,
      taxonomy,
      category,
      vertical,
      subVertical,
      description,
      city,
    } = body;

    // Step 1: RUES lookup
    console.log("Starting RUES lookup for:", { nit, tradeName, legalName });
    const ruesResult = await lookupRUES(nit, tradeName, legalName);
    console.log("RUES result:", {
      found: !!ruesResult.data,
      query: ruesResult.query,
      attempts: ruesResult.attempts,
      recordCount: ruesResult.data?.length || 0,
    });

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
      : `No se encontraron datos en RUES. Intentos realizados: ${ruesResult.attempts.join(", ")}`;

    const contactsText = contacts
      .map((c) => `- ${c.name} (id: ${c.id}, género actual: ${c.gender || "sin definir"})`)
      .join("\n");

    const prompt = `Actúa como analista de CRM para clasificar empresas con base en su sitio web oficial y datos públicos.

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

    const client = new OpenAI({ apiKey: OPENAI_API_KEY });

    console.log("Calling OpenAI gpt-5.4 with reasoning effort: high...");

    const response = await client.responses.create({
      model: "gpt-5.4",
      reasoning: {
        effort: "high",
      },
      tools: [
        { type: "web_search" as any },
        {
          type: "function",
          name: "analyze_company",
          description: "Return structured analysis results for the company",
          parameters: {
            type: "object",
            properties: {
              category: {
                type: "string",
                description: "Company category from available taxonomy",
              },
              vertical: {
                type: "string",
                description: "Vertical (existing or new suggested)",
              },
              subVertical: {
                type: "string",
                description: "Sub-vertical (existing or new suggested)",
              },
              description: {
                type: "string",
                description: "Short company description, 1-3 sentences",
              },
              logoUrl: {
                type: ["string", "null"],
                description: "Direct URL to company logo image, or null",
              },
              legalName: {
                type: ["string", "null"],
                description: "Validated legal name from RUES or web",
              },
              nit: {
                type: ["string", "null"],
                description: "Validated NIT from RUES or web",
              },
              tradeName: {
                type: ["string", "null"],
                description: "Validated trade/brand name",
              },
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
              companyStatus: {
                type: "string",
                enum: ["active", "inactive", "unknown"],
              },
              confidence: {
                type: "string",
                enum: ["high", "medium", "low"],
              },
              reasoning: {
                type: "string",
                description:
                  "Brief explanation of classification reasoning (max 5 lines). Explain WHY you chose this category over others.",
              },
              isNewVertical: {
                type: "boolean",
                description: "Whether the suggested vertical is new",
              },
              isNewSubVertical: {
                type: "boolean",
                description: "Whether the suggested sub-vertical is new",
              },
            },
            required: [
              "category",
              "vertical",
              "subVertical",
              "description",
              "logoUrl",
              "legalName",
              "nit",
              "tradeName",
              "contacts",
              "companyStatus",
              "confidence",
              "reasoning",
              "isNewVertical",
              "isNewSubVertical",
            ],
            additionalProperties: false,
          },
        },
      ],
      input: prompt,
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

    if (!result) {
      const textOutput = response.output_text;
      console.error("No structured response. Raw output:", textOutput);
      return new Response(
        JSON.stringify({
          error: "No structured response from AI",
          raw: textOutput,
        }),
        {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
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
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("company-fit error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
