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

    const { data: settingsRow } = await supabase
      .from("feature_settings")
      .select("config")
      .eq("feature_key", "company_chat")
      .single();

    const config = settingsRow?.config || {};
    const embeddingModel = (config as any).embeddingModel || "text-embedding-3-small";

    let body: any = {};
    try { body = await req.json(); } catch { /* no body */ }

    const mode = body?.mode || "companies"; // "companies" | "offers" | "pipeline" | "allies"

    if (mode === "offers") {
      return await vectorizeOffers(supabase, openai, embeddingModel, startTime);
    } else if (mode === "pipeline") {
      return await vectorizePipeline(supabase, openai, embeddingModel, startTime);
    } else if (mode === "allies") {
      return await vectorizeAllies(supabase, openai, embeddingModel, startTime);
    }

    // Default: companies
    let companyIds: string[] | null = null;
    if (body?.companyIds?.length) companyIds = body.companyIds;

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

    const companyIdsList = companies.map((c) => c.id);

    const [
      { data: contacts },
      { data: customProps },
      { data: actions },
      { data: milestones },
      { data: tasks },
      { data: pipelineEntries },
      { data: pipelineStages },
      { data: offers },
      { data: profiles },
    ] = await Promise.all([
      supabase.from("contacts").select("*").in("company_id", companyIdsList),
      supabase.from("custom_properties").select("*").in("company_id", companyIdsList),
      supabase.from("company_actions").select("*").in("company_id", companyIdsList).order("date", { ascending: false }),
      supabase.from("milestones").select("*").in("company_id", companyIdsList).order("date", { ascending: false }),
      supabase.from("company_tasks").select("*").in("company_id", companyIdsList).order("due_date", { ascending: false }),
      supabase.from("pipeline_entries").select("*").in("company_id", companyIdsList),
      supabase.from("pipeline_stages").select("*"),
      supabase.from("portfolio_offers").select("id, name, product, status"),
      supabase.from("profiles").select("user_id, name"),
    ]);

    const stageMap = new Map((pipelineStages || []).map((s) => [s.id, s]));
    const offerMap = new Map((offers || []).map((o) => [o.id, o]));
    const profileMap = new Map((profiles || []).map((p) => [p.user_id, p.name]));

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

      if (company.sales_by_year && typeof company.sales_by_year === "object") {
        const salesEntries = Object.entries(company.sales_by_year as Record<string, number>)
          .filter(([, v]) => v > 0)
          .sort(([a], [b]) => Number(b) - Number(a));
        if (salesEntries.length > 0) {
          parts.push(`Ventas: ${salesEntries.map(([y, v]) => `${y}: $${Number(v).toLocaleString()}`).join(", ")}`);
        }
      }

      const compContacts = contacts?.filter((c) => c.company_id === company.id) || [];
      if (compContacts.length > 0) {
        const contactText = compContacts
          .map((c) => {
            const segs = [`${c.name}${c.position ? ` (${c.position})` : ""}`];
            if (c.email) segs.push(`Email: ${c.email}`);
            if (c.phone) segs.push(`Celular: ${c.phone}`);
            return segs.join(" - ");
          })
          .join("; ");
        parts.push(`Contactos: ${contactText}`);
      }

      const compProps = customProps?.filter((p) => p.company_id === company.id) || [];
      if (compProps.length > 0) {
        const propsText = compProps.map((p) => `${p.name}: ${p.value || ""}`).join("; ");
        parts.push(`Propiedades: ${propsText}`);
      }

      const compActions = (actions || []).filter((a) => a.company_id === company.id).slice(0, 10);
      if (compActions.length > 0) {
        const actionsText = compActions
          .map((a) => `${a.date} - ${a.type}: ${a.description}${a.notes ? ` (${a.notes})` : ""}`)
          .join("; ");
        parts.push(`Acciones recientes: ${actionsText}`);
      }

      const compMilestones = (milestones || []).filter((m) => m.company_id === company.id).slice(0, 10);
      if (compMilestones.length > 0) {
        const milestonesText = compMilestones
          .map((m) => `${m.date} - ${m.type}: ${m.title}${m.description ? ` - ${m.description}` : ""}`)
          .join("; ");
        parts.push(`Hitos: ${milestonesText}`);
      }

      const compTasks = (tasks || []).filter((t) => t.company_id === company.id).slice(0, 10);
      if (compTasks.length > 0) {
        const tasksText = compTasks
          .map((t) => {
            const assignedName = t.assigned_to ? (profileMap.get(t.assigned_to) || "Sin asignar") : "Sin asignar";
            const offerName = t.offer_id ? (offerMap.get(t.offer_id)?.name || "") : "";
            return `${t.title} (Estado: ${t.status}, Vence: ${t.due_date}, Asignado a: ${assignedName}${offerName ? `, Oferta: ${offerName}` : ""})`;
          })
          .join("; ");
        parts.push(`Tareas: ${tasksText}`);
      }

      const compPipeline = (pipelineEntries || []).filter((pe) => pe.company_id === company.id);
      if (compPipeline.length > 0) {
        const pipelineText = compPipeline
          .map((pe) => {
            const stage = stageMap.get(pe.stage_id);
            const offer = offerMap.get(pe.offer_id);
            const assignedName = pe.assigned_to ? (profileMap.get(pe.assigned_to) || "Sin asignar") : "Sin asignar";
            return `Oferta: ${offer?.name || "Desconocida"} (Producto: ${offer?.product || "N/A"}) → Etapa: ${stage?.name || "Desconocida"}, Gestor: ${assignedName}${pe.notes ? `, Notas: ${pe.notes}` : ""}`;
          })
          .join("; ");
        parts.push(`Pipeline / Portafolio: ${pipelineText}`);
      }

      companyTexts.push({ companyId: company.id, content: parts.join("\n") });
    }

    const result = await batchEmbed(supabase, openai, embeddingModel, companyTexts.map(c => ({ id: c.companyId, content: c.content })), "company_embeddings", "company_id");

    const duration = Date.now() - startTime;

    return new Response(
      JSON.stringify({ ...result, total: companyTexts.length, duration_ms: duration, embeddingModel }),
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

async function batchEmbed(
  supabase: any,
  openai: OpenAI,
  embeddingModel: string,
  items: { id: string; content: string }[],
  table: string,
  idColumn: string,
) {
  const BATCH_SIZE = 50;
  let processed = 0;
  let errors = 0;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    try {
      const embeddingResponse = await openai.embeddings.create({
        model: embeddingModel,
        input: batch.map((b) => b.content),
      });

      for (let j = 0; j < batch.length; j++) {
        const embedding = embeddingResponse.data[j].embedding;
        const { error: upsertErr } = await supabase.from(table).upsert(
          {
            [idColumn]: batch[j].id,
            content: batch[j].content,
            embedding: JSON.stringify(embedding),
            updated_at: new Date().toISOString(),
          },
          { onConflict: idColumn }
        );
        if (upsertErr) {
          console.error(`Error upserting ${table} for ${batch[j].id}:`, upsertErr);
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

  return { processed, errors };
}

async function vectorizeOffers(supabase: any, openai: OpenAI, embeddingModel: string, startTime: number) {
  const [
    { data: offers },
    { data: stages },
    { data: categories },
    { data: offerAllies },
    { data: allies },
  ] = await Promise.all([
    supabase.from("portfolio_offers").select("*"),
    supabase.from("pipeline_stages").select("*").order("display_order"),
    supabase.from("portfolio_offer_categories").select("*"),
    supabase.from("offer_allies").select("*"),
    supabase.from("allies").select("*"),
  ]);

  if (!offers?.length) {
    return new Response(JSON.stringify({ processed: 0, message: "No offers found", duration_ms: Date.now() - startTime }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const categoryMap = new Map((categories || []).map((c: any) => [c.id, c]));
  const allyMap = new Map((allies || []).map((a: any) => [a.id, a]));

  const items = offers.map((offer: any) => {
    const parts: string[] = [];
    parts.push(`Oferta: ${offer.name}`);
    if (offer.description) parts.push(`Descripción: ${offer.description}`);
    parts.push(`Producto: ${offer.product || "N/A"}`);
    const cat = offer.category_id ? categoryMap.get(offer.category_id) : null;
    if (cat) parts.push(`Categoría de oferta: ${cat.name}`);
    parts.push(`Estado: ${offer.status}`);
    parts.push(`Tipo: ${offer.type}`);
    if (offer.start_date) parts.push(`Inicio: ${offer.start_date}`);
    if (offer.end_date) parts.push(`Fin: ${offer.end_date}`);

    const offerStages = (stages || []).filter((s: any) => s.offer_id === offer.id);
    if (offerStages.length > 0) {
      parts.push(`Etapas del pipeline: ${offerStages.map((s: any) => s.name).join(" → ")}`);
    }

    const linkedAllies = (offerAllies || []).filter((oa: any) => oa.offer_id === offer.id);
    if (linkedAllies.length > 0) {
      const allyNames = linkedAllies.map((oa: any) => allyMap.get(oa.ally_id)?.name).filter(Boolean);
      if (allyNames.length > 0) parts.push(`Aliados vinculados: ${allyNames.join(", ")}`);
    }

    return { id: offer.id, content: parts.join("\n") };
  });

  const result = await batchEmbed(supabase, openai, embeddingModel, items, "offer_embeddings", "offer_id");

  return new Response(
    JSON.stringify({ ...result, total: items.length, duration_ms: Date.now() - startTime, embeddingModel }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function vectorizePipeline(supabase: any, openai: OpenAI, embeddingModel: string, startTime: number) {
  const [
    { data: offers },
    { data: entries },
    { data: stages },
    { data: companies },
    { data: profiles },
    { data: pipelineNotes },
  ] = await Promise.all([
    supabase.from("portfolio_offers").select("id, name, product"),
    supabase.from("pipeline_entries").select("*"),
    supabase.from("pipeline_stages").select("*").order("display_order"),
    supabase.from("companies").select("id, trade_name, nit, category, vertical, city"),
    supabase.from("profiles").select("user_id, name"),
    supabase.from("pipeline_notes").select("*").order("created_at", { ascending: false }),
  ]);

  if (!offers?.length) {
    return new Response(JSON.stringify({ processed: 0, message: "No offers found", duration_ms: Date.now() - startTime }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const companyMap = new Map((companies || []).map((c: any) => [c.id, c]));
  const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p.name]));
  const stageMap = new Map((stages || []).map((s: any) => [s.id, s]));

  const items = offers.map((offer: any) => {
    const offerEntries = (entries || []).filter((e: any) => e.offer_id === offer.id);
    const offerStages = (stages || []).filter((s: any) => s.offer_id === offer.id);

    const parts: string[] = [];
    parts.push(`Pipeline de oferta: ${offer.name} (Producto: ${offer.product || "N/A"})`);
    parts.push(`Total empresas en pipeline: ${offerEntries.length}`);
    parts.push(`Etapas: ${offerStages.map((s: any) => s.name).join(" → ")}`);

    // Group entries by stage
    for (const stage of offerStages) {
      const stageEntries = offerEntries.filter((e: any) => e.stage_id === stage.id);
      if (stageEntries.length === 0) continue;
      const companyNames = stageEntries.map((e: any) => {
        const company = companyMap.get(e.company_id);
        const assignedName = e.assigned_to ? (profileMap.get(e.assigned_to) || "") : "";
        return `${company?.trade_name || "Desconocida"}${assignedName ? ` (Gestor: ${assignedName})` : ""}`;
      });
      parts.push(`\nEtapa "${stage.name}" (${stageEntries.length} empresas): ${companyNames.join(", ")}`);
    }

    // Include pipeline notes
    const offerNotes = (pipelineNotes || []).filter((n: any) => n.offer_id === offer.id).slice(0, 20);
    if (offerNotes.length > 0) {
      const notesText = offerNotes.map((n: any) => {
        const authorName = n.created_by ? (profileMap.get(n.created_by) || "Desconocido") : "Anónimo";
        const linkedCompanies = (Array.isArray(n.company_ids) ? n.company_ids : n.company_id ? [n.company_id] : [])
          .map((id: string) => companyMap.get(id)?.trade_name).filter(Boolean).join(", ");
        const stageName = n.stage_id ? (stageMap.get(n.stage_id)?.name || "") : "";
        return `[${n.created_at?.substring(0, 10)}] ${authorName}: ${n.content}${linkedCompanies ? ` (Empresas: ${linkedCompanies})` : ""}${stageName ? ` (Etapa: ${stageName})` : ""}`;
      }).join("; ");
      parts.push(`\nNotas del pipeline: ${notesText}`);
    }

    return { id: offer.id, content: parts.join("\n") };
  });

  const result = await batchEmbed(supabase, openai, embeddingModel, items, "pipeline_embeddings", "offer_id");

  return new Response(
    JSON.stringify({ ...result, total: items.length, duration_ms: Date.now() - startTime, embeddingModel }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function vectorizeAllies(supabase: any, openai: OpenAI, embeddingModel: string, startTime: number) {
  const [
    { data: allies },
    { data: contacts },
    { data: offerAllies },
    { data: offers },
  ] = await Promise.all([
    supabase.from("allies").select("*"),
    supabase.from("ally_contacts").select("*"),
    supabase.from("offer_allies").select("*"),
    supabase.from("portfolio_offers").select("id, name, product"),
  ]);

  if (!allies?.length) {
    return new Response(JSON.stringify({ processed: 0, message: "No allies found", duration_ms: Date.now() - startTime }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const offerMap = new Map((offers || []).map((o: any) => [o.id, o]));

  const items = allies.map((ally: any) => {
    const parts: string[] = [];
    parts.push(`Aliado: ${ally.name}`);

    const allyContacts = (contacts || []).filter((c: any) => c.ally_id === ally.id);
    if (allyContacts.length > 0) {
      const contactText = allyContacts.map((c: any) => {
        const segs = [`${c.name}${c.position ? ` (${c.position})` : ""}`];
        if (c.email) segs.push(`Email: ${c.email}`);
        if (c.phone) segs.push(`Celular: ${c.phone}`);
        if (c.is_primary) segs.push("(Contacto principal)");
        return segs.join(" - ");
      }).join("; ");
      parts.push(`Contactos: ${contactText}`);
    }

    const linkedOffers = (offerAllies || []).filter((oa: any) => oa.ally_id === ally.id);
    if (linkedOffers.length > 0) {
      const offerNames = linkedOffers.map((oa: any) => {
        const o = offerMap.get(oa.offer_id);
        return o ? `${o.name} (${o.product || "N/A"})` : null;
      }).filter(Boolean);
      if (offerNames.length > 0) parts.push(`Ofertas vinculadas: ${offerNames.join(", ")}`);
    }

    return { id: ally.id, content: parts.join("\n") };
  });

  const result = await batchEmbed(supabase, openai, embeddingModel, items, "ally_embeddings", "ally_id");

  return new Response(
    JSON.stringify({ ...result, total: items.length, duration_ms: Date.now() - startTime, embeddingModel }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
