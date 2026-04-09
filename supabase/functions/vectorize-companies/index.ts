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

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const openai = new OpenAI({ apiKey: openaiKey });

    // Get config for embedding model
    const { data: settingsRow } = await supabase
      .from("feature_settings")
      .select("config")
      .eq("feature_key", "company_chat")
      .single();

    const config = settingsRow?.config || {};
    const embeddingModel = (config as any).embeddingModel || "text-embedding-3-small";

    // Parse optional body
    let companyIds: string[] | null = null;
    try {
      const body = await req.json();
      if (body?.companyIds?.length) companyIds = body.companyIds;
    } catch { /* no body */ }

    // Fetch companies
    let query = supabase.from("companies").select("*");
    if (companyIds) {
      query = query.in("id", companyIds);
    }
    const { data: companies, error: compErr } = await query;
    if (compErr) throw new Error(`Error fetching companies: ${compErr.message}`);
    if (!companies?.length) {
      return new Response(JSON.stringify({ processed: 0, message: "No companies found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch contacts for all companies
    const companyIdsList = companies.map((c) => c.id);
    const { data: contacts } = await supabase
      .from("contacts")
      .select("*")
      .in("company_id", companyIdsList);

    // Fetch custom properties
    const { data: customProps } = await supabase
      .from("custom_properties")
      .select("*")
      .in("company_id", companyIdsList);

    // Build content for each company
    const companyTexts: { companyId: string; content: string }[] = [];

    for (const company of companies) {
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

      // Sales by year
      if (company.sales_by_year && typeof company.sales_by_year === "object") {
        const salesEntries = Object.entries(company.sales_by_year as Record<string, number>)
          .filter(([, v]) => v > 0)
          .sort(([a], [b]) => Number(b) - Number(a));
        if (salesEntries.length > 0) {
          parts.push(`Ventas: ${salesEntries.map(([y, v]) => `${y}: $${Number(v).toLocaleString()}`).join(", ")}`);
        }
      }

      // Contacts
      const compContacts = contacts?.filter((c) => c.company_id === company.id) || [];
      if (compContacts.length > 0) {
        const contactText = compContacts
          .map((c) => `${c.name}${c.position ? ` (${c.position})` : ""}${c.email ? ` - ${c.email}` : ""}${c.phone ? ` - Tel: ${c.phone}` : ""}`)
          .join("; ");
        parts.push(`Contactos: ${contactText}`);
      }

      // Custom properties
      const compProps = customProps?.filter((p) => p.company_id === company.id) || [];
      if (compProps.length > 0) {
        const propsText = compProps.map((p) => `${p.name}: ${p.value || ""}`).join("; ");
        parts.push(`Propiedades: ${propsText}`);
      }

      companyTexts.push({ companyId: company.id, content: parts.join("\n") });
    }

    // Batch embed in groups of 50
    const BATCH_SIZE = 50;
    let processed = 0;
    let errors = 0;

    for (let i = 0; i < companyTexts.length; i += BATCH_SIZE) {
      const batch = companyTexts.slice(i, i + BATCH_SIZE);

      try {
        const embeddingResponse = await openai.embeddings.create({
          model: embeddingModel,
          input: batch.map((b) => b.content),
        });

        // Upsert each embedding
        for (let j = 0; j < batch.length; j++) {
          const embedding = embeddingResponse.data[j].embedding;
          const { error: upsertErr } = await supabase.from("company_embeddings").upsert(
            {
              company_id: batch[j].companyId,
              content: batch[j].content,
              embedding: JSON.stringify(embedding),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "company_id" }
          );
          if (upsertErr) {
            console.error(`Error upserting embedding for ${batch[j].companyId}:`, upsertErr);
            errors++;
          } else {
            processed++;
          }
        }
      } catch (batchErr) {
        console.error("Batch embedding error:", batchErr);
        errors += batch.length;
      }
    }

    const duration = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        processed,
        errors,
        total: companyTexts.length,
        duration_ms: duration,
        embeddingModel,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("vectorize-companies error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
