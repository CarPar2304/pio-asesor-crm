import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import OpenAI from "npm:openai@4.96.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ---------- Helpers ----------
async function sha256(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function header(parent: { kind: string; name: string; id: string; nit?: string }, type: string, key: string, extras: Record<string, string> = {}) {
  const meta = Object.entries(extras).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(", ");
  return `[${parent.kind.toUpperCase()}] ${parent.name}${parent.nit ? ` (NIT ${parent.nit})` : ""} | id=${parent.id}\n[TIPO] ${type} | [KEY] ${key}${meta ? `\n[METADATA] ${meta}` : ""}`;
}

type Chunk = {
  parentId: string;
  chunkType: string;
  chunkKey: string;
  content: string;
  metadata: Record<string, unknown>;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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
    const embeddingModel = (settingsRow?.config as any)?.embeddingModel || "text-embedding-3-small";

    let body: any = {};
    try { body = await req.json(); } catch { /* no body */ }

    const mode = body?.mode || "companies";
    const force = !!body?.force;

    if (mode === "offers") return await vectorizeOffers(supabase, openai, embeddingModel, force, startTime);
    if (mode === "pipeline") return await vectorizePipeline(supabase, openai, embeddingModel, force, startTime);
    if (mode === "allies") return await vectorizeAllies(supabase, openai, embeddingModel, force, startTime);

    // companies
    const companyIds: string[] | null = body?.companyIds?.length ? body.companyIds : null;
    return await vectorizeCompanies(supabase, openai, embeddingModel, companyIds, force, startTime);
  } catch (err) {
    console.error("vectorize-companies error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ============================================================
// COMPANIES — granular chunking
// ============================================================
async function vectorizeCompanies(
  supabase: any,
  openai: OpenAI,
  embeddingModel: string,
  companyIds: string[] | null,
  force: boolean,
  startTime: number,
) {
  let q = supabase.from("companies").select("*");
  if (companyIds) q = q.in("id", companyIds);
  const { data: companies, error: compErr } = await q;
  if (compErr) throw new Error(`fetch companies: ${compErr.message}`);
  if (!companies?.length) {
    return jsonResp({ processed: 0, skipped: 0, message: "No companies", duration_ms: Date.now() - startTime });
  }

  const ids = companies.map((c: any) => c.id);

  const [
    { data: contacts }, { data: actions }, { data: milestones },
    { data: tasks }, { data: pipelineEntries }, { data: pipelineStages },
    { data: offers }, { data: profiles }, { data: history },
  ] = await Promise.all([
    supabase.from("contacts").select("*").in("company_id", ids),
    supabase.from("company_actions").select("*").in("company_id", ids).order("date", { ascending: false }),
    supabase.from("milestones").select("*").in("company_id", ids).order("date", { ascending: false }),
    supabase.from("company_tasks").select("*").in("company_id", ids).order("due_date", { ascending: false }),
    supabase.from("pipeline_entries").select("*").in("company_id", ids),
    supabase.from("pipeline_stages").select("*"),
    supabase.from("portfolio_offers").select("id, name, product, status"),
    supabase.from("profiles").select("user_id, name"),
    supabase.from("company_history").select("*").in("company_id", ids).order("created_at", { ascending: false }),
  ]);

  const stageMap = new Map((pipelineStages || []).map((s: any) => [s.id, s]));
  const offerMap = new Map((offers || []).map((o: any) => [o.id, o]));
  const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p.name]));

  const chunks: Chunk[] = [];
  const expectedKeys = new Map<string, Set<string>>(); // companyId -> set of "type:key"

  for (const c of companies) {
    const parent = { kind: "empresa", name: c.trade_name, id: c.id, nit: c.nit };
    const seen = new Set<string>();
    const remember = (t: string, k: string) => seen.add(`${t}:${k}`);

    // profile
    const profileLines: string[] = [];
    profileLines.push(`Razón social: ${c.legal_name || "-"}`);
    profileLines.push(`NIT: ${c.nit || "-"}`);
    profileLines.push(`Categoría: ${c.category || "-"}`);
    profileLines.push(`Vertical: ${c.vertical || "-"}`);
    profileLines.push(`Sub-vertical / Actividad: ${c.economic_activity || "-"}`);
    profileLines.push(`Ciudad: ${c.city || "-"}`);
    if (c.website) profileLines.push(`Sitio web: ${c.website}`);
    if (c.description) profileLines.push(`Descripción: ${c.description}`);
    chunks.push({
      parentId: c.id, chunkType: "profile", chunkKey: "main",
      content: `${header(parent, "profile", "main")}\n[CONTENIDO]\n${profileLines.join("\n")}`,
      metadata: { trade_name: c.trade_name, legal_name: c.legal_name, nit: c.nit, category: c.category, vertical: c.vertical, sub_vertical: c.economic_activity, city: c.city },
    });
    remember("profile", "main");

    // financials
    const sales = c.sales_by_year && typeof c.sales_by_year === "object" ? c.sales_by_year : {};
    const salesEntries = Object.entries(sales as Record<string, number>).filter(([, v]) => v > 0).sort(([a], [b]) => Number(b) - Number(a));
    if (salesEntries.length || c.exports_usd) {
      const finLines: string[] = [];
      if (salesEntries.length) finLines.push(`Ventas (${c.sales_currency || "COP"}): ${salesEntries.map(([y, v]) => `${y}: ${Number(v).toLocaleString()}`).join(", ")}`);
      if (c.exports_usd) finLines.push(`Exportaciones USD: ${c.exports_usd}`);
      chunks.push({
        parentId: c.id, chunkType: "financials", chunkKey: "main",
        content: `${header(parent, "financials", "main")}\n[CONTENIDO]\n${finLines.join("\n")}`,
        metadata: { years: salesEntries.map(([y]) => Number(y)), exports_usd: c.exports_usd },
      });
      remember("financials", "main");
    }

    // contacts
    for (const ct of (contacts || []).filter((x: any) => x.company_id === c.id)) {
      const lines = [
        `${ct.name}${ct.position ? ` (${ct.position})` : ""}${ct.is_primary ? " — PRINCIPAL" : ""}`,
        ct.email && `Email: ${ct.email}`,
        ct.phone && `Tel: ${ct.phone}`,
        ct.notes && `Notas: ${ct.notes}`,
      ].filter(Boolean).join("\n");
      chunks.push({
        parentId: c.id, chunkType: "contact", chunkKey: ct.id,
        content: `${header(parent, "contact", ct.id, { primary: String(ct.is_primary) })}\n[CONTENIDO]\n${lines}`,
        metadata: { contact_id: ct.id, is_primary: ct.is_primary, name: ct.name },
      });
      remember("contact", ct.id);
    }

    // actions
    for (const a of (actions || []).filter((x: any) => x.company_id === c.id)) {
      const performer = a.created_by ? (profileMap.get(a.created_by) || "Usuario") : "Sistema";
      chunks.push({
        parentId: c.id, chunkType: "action", chunkKey: a.id,
        content: `${header(parent, "action", a.id, { fecha: a.date, tipo: a.type, autor: performer })}\n[CONTENIDO]\n${a.description || ""}${a.notes ? `\nNotas: ${a.notes}` : ""}`,
        metadata: { action_id: a.id, date: a.date, type: a.type, performed_by: a.created_by },
      });
      remember("action", a.id);
    }

    // milestones
    for (const m of (milestones || []).filter((x: any) => x.company_id === c.id)) {
      const performer = m.created_by ? (profileMap.get(m.created_by) || "Usuario") : "Sistema";
      chunks.push({
        parentId: c.id, chunkType: "milestone", chunkKey: m.id,
        content: `${header(parent, "milestone", m.id, { fecha: m.date, tipo: m.type, autor: performer })}\n[CONTENIDO]\n${m.title}${m.description ? `\n${m.description}` : ""}`,
        metadata: { milestone_id: m.id, date: m.date, type: m.type },
      });
      remember("milestone", m.id);
    }

    // tasks
    for (const t of (tasks || []).filter((x: any) => x.company_id === c.id)) {
      const assigned = t.assigned_to ? (profileMap.get(t.assigned_to) || "Sin asignar") : "Sin asignar";
      const offerName = t.offer_id ? (offerMap.get(t.offer_id) as any)?.name || "" : "";
      chunks.push({
        parentId: c.id, chunkType: "task", chunkKey: t.id,
        content: `${header(parent, "task", t.id, { estado: t.status, vence: t.due_date, asignado: assigned, oferta: offerName })}\n[CONTENIDO]\n${t.title}${t.description ? `\n${t.description}` : ""}`,
        metadata: { task_id: t.id, status: t.status, due_date: t.due_date, assigned_to: t.assigned_to, offer_id: t.offer_id },
      });
      remember("task", t.id);
    }

    // pipeline positions
    for (const pe of (pipelineEntries || []).filter((x: any) => x.company_id === c.id)) {
      const stage = stageMap.get(pe.stage_id) as any;
      const offer = offerMap.get(pe.offer_id) as any;
      const assigned = pe.assigned_to ? (profileMap.get(pe.assigned_to) || "Sin asignar") : "Sin asignar";
      chunks.push({
        parentId: c.id, chunkType: "pipeline", chunkKey: pe.id,
        content: `${header(parent, "pipeline_position", pe.id, { oferta: offer?.name || "?", etapa: stage?.name || "?", gestor: assigned })}\n[CONTENIDO]\nOferta: ${offer?.name || "?"} (${offer?.product || "N/A"})\nEtapa actual: ${stage?.name || "?"}\nGestor: ${assigned}${pe.notes ? `\nNotas: ${pe.notes}` : ""}`,
        metadata: { entry_id: pe.id, offer_id: pe.offer_id, stage_id: pe.stage_id, assigned_to: pe.assigned_to },
      });
      remember("pipeline", pe.id);
    }

    // history events (each independent)
    for (const h of (history || []).filter((x: any) => x.company_id === c.id)) {
      const performer = h.performed_by ? (profileMap.get(h.performed_by) || "Usuario") : "Sistema";
      const fecha = h.created_at?.split("T")[0] || "";
      chunks.push({
        parentId: c.id, chunkType: "history", chunkKey: h.id,
        content: `${header(parent, "history_event", h.id, { fecha, tipo: h.event_type, autor: performer })}\n[CONTENIDO]\n${h.title}${h.description ? `\n${h.description}` : ""}`,
        metadata: { history_id: h.id, event_type: h.event_type, date: fecha, performed_by: h.performed_by },
      });
      remember("history", h.id);
    }

    expectedKeys.set(c.id, seen);
  }

  // ---- Diff with existing rows: skip unchanged, delete stale ----
  const { data: existing } = await supabase
    .from("company_embeddings")
    .select("id, company_id, chunk_type, chunk_key, content_hash")
    .in("company_id", ids);

  const existingMap = new Map<string, { id: string; hash: string }>();
  for (const r of existing || []) {
    if (r.chunk_type === "legacy") continue; // ignore legacy rows in diff
    existingMap.set(`${r.company_id}|${r.chunk_type}|${r.chunk_key}`, { id: r.id, hash: r.content_hash || "" });
  }

  const toEmbed: (Chunk & { hash: string })[] = [];
  let skipped = 0;
  for (const ch of chunks) {
    const hash = await sha256(ch.content);
    const key = `${ch.parentId}|${ch.chunkType}|${ch.chunkKey}`;
    const prev = existingMap.get(key);
    if (!force && prev && prev.hash === hash) {
      skipped++;
      continue;
    }
    toEmbed.push({ ...ch, hash });
  }

  // Delete stale chunks (existed before but no longer expected) — keeps DB clean of removed entities
  const stale: string[] = [];
  for (const [key, val] of existingMap.entries()) {
    const [cid, type, ckey] = key.split("|");
    const expected = expectedKeys.get(cid);
    if (!expected) continue;
    if (!expected.has(`${type}:${ckey}`)) stale.push(val.id);
  }
  if (stale.length) {
    await supabase.from("company_embeddings").delete().in("id", stale);
  }

  // ---- Embed and upsert ----
  const result = await embedAndUpsert(supabase, openai, embeddingModel, toEmbed, "company_embeddings", "company_id");

  return jsonResp({
    ...result,
    total_chunks: chunks.length,
    skipped,
    stale_deleted: stale.length,
    duration_ms: Date.now() - startTime,
    embeddingModel,
  });
}

// ============================================================
// OFFERS — single profile chunk per offer (kept simple)
// ============================================================
async function vectorizeOffers(supabase: any, openai: OpenAI, embeddingModel: string, force: boolean, startTime: number) {
  const [
    { data: offers }, { data: stages }, { data: categories },
    { data: offerAllies }, { data: allies },
  ] = await Promise.all([
    supabase.from("portfolio_offers").select("*"),
    supabase.from("pipeline_stages").select("*").order("display_order"),
    supabase.from("portfolio_offer_categories").select("*"),
    supabase.from("offer_allies").select("*"),
    supabase.from("allies").select("*"),
  ]);
  if (!offers?.length) return jsonResp({ processed: 0, message: "No offers", duration_ms: Date.now() - startTime });

  const categoryMap = new Map((categories || []).map((c: any) => [c.id, c]));
  const allyMap = new Map((allies || []).map((a: any) => [a.id, a]));

  const chunks: (Chunk & { hash: string })[] = [];
  for (const o of offers) {
    const parent = { kind: "oferta", name: o.name, id: o.id };
    const lines: string[] = [];
    if (o.description) lines.push(`Descripción: ${o.description}`);
    lines.push(`Producto: ${o.product || "N/A"}`);
    const cat = o.category_id ? (categoryMap.get(o.category_id) as any) : null;
    if (cat) lines.push(`Categoría de oferta: ${cat.name}`);
    lines.push(`Estado: ${o.status}`);
    lines.push(`Tipo: ${o.type}`);
    if (o.start_date) lines.push(`Inicio: ${o.start_date}`);
    if (o.end_date) lines.push(`Fin: ${o.end_date}`);
    const offerStages = (stages || []).filter((s: any) => s.offer_id === o.id);
    if (offerStages.length) lines.push(`Etapas: ${offerStages.map((s: any) => s.name).join(" → ")}`);
    const linkedAllies = (offerAllies || []).filter((oa: any) => oa.offer_id === o.id);
    if (linkedAllies.length) {
      const names = linkedAllies.map((oa: any) => (allyMap.get(oa.ally_id) as any)?.name).filter(Boolean);
      if (names.length) lines.push(`Aliados: ${names.join(", ")}`);
    }
    const content = `${header(parent, "profile", "main")}\n[CONTENIDO]\n${lines.join("\n")}`;
    chunks.push({ parentId: o.id, chunkType: "profile", chunkKey: "main", content, metadata: { name: o.name, status: o.status, type: o.type }, hash: await sha256(content) });
  }
  await skipUnchanged(supabase, "offer_embeddings", "offer_id", chunks, force);
  const result = await embedAndUpsert(supabase, openai, embeddingModel, chunks, "offer_embeddings", "offer_id");
  return jsonResp({ ...result, total_chunks: chunks.length, duration_ms: Date.now() - startTime });
}

// ============================================================
// PIPELINE — one chunk per offer (snapshot)
// ============================================================
async function vectorizePipeline(supabase: any, openai: OpenAI, embeddingModel: string, force: boolean, startTime: number) {
  const [
    { data: offers }, { data: entries }, { data: stages },
    { data: companies }, { data: profiles }, { data: notes },
  ] = await Promise.all([
    supabase.from("portfolio_offers").select("id, name, product"),
    supabase.from("pipeline_entries").select("*"),
    supabase.from("pipeline_stages").select("*").order("display_order"),
    supabase.from("companies").select("id, trade_name, nit, category, vertical, city"),
    supabase.from("profiles").select("user_id, name"),
    supabase.from("pipeline_notes").select("*").order("created_at", { ascending: false }),
  ]);
  if (!offers?.length) return jsonResp({ processed: 0, message: "No offers", duration_ms: Date.now() - startTime });

  const companyMap = new Map((companies || []).map((c: any) => [c.id, c]));
  const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p.name]));
  const stageMap = new Map((stages || []).map((s: any) => [s.id, s]));

  const chunks: (Chunk & { hash: string })[] = [];
  for (const o of offers) {
    const parent = { kind: "pipeline", name: o.name, id: o.id };
    const offerEntries = (entries || []).filter((e: any) => e.offer_id === o.id);
    const offerStages = (stages || []).filter((s: any) => s.offer_id === o.id);
    const lines: string[] = [];
    lines.push(`Pipeline de "${o.name}" (${o.product || "N/A"})`);
    lines.push(`Total empresas: ${offerEntries.length}`);
    for (const st of offerStages) {
      const sEntries = offerEntries.filter((e: any) => e.stage_id === st.id);
      if (!sEntries.length) continue;
      const names = sEntries.map((e: any) => {
        const co = companyMap.get(e.company_id) as any;
        const ass = e.assigned_to ? (profileMap.get(e.assigned_to) || "") : "";
        return `${co?.trade_name || "?"}${ass ? ` (${ass})` : ""}`;
      });
      lines.push(`Etapa "${st.name}" (${sEntries.length}): ${names.join(", ")}`);
    }
    const offerNotes = (notes || []).filter((n: any) => n.offer_id === o.id);
    if (offerNotes.length) {
      const txt = offerNotes.map((n: any) => {
        const author = n.created_by ? (profileMap.get(n.created_by) || "Desconocido") : "Anónimo";
        const stName = n.stage_id ? ((stageMap.get(n.stage_id) as any)?.name || "") : "";
        return `[${n.created_at?.substring(0, 10)}] ${author}: ${n.content}${stName ? ` (Etapa: ${stName})` : ""}`;
      }).join("\n");
      lines.push(`Notas:\n${txt}`);
    }
    const content = `${header(parent, "pipeline_snapshot", "main")}\n[CONTENIDO]\n${lines.join("\n")}`;
    chunks.push({ parentId: o.id, chunkType: "pipeline_snapshot", chunkKey: "main", content, metadata: { offer_id: o.id, total: offerEntries.length }, hash: await sha256(content) });

    for (const st of offerStages) {
      const sEntries = offerEntries.filter((e: any) => e.stage_id === st.id);
      if (!sEntries.length) continue;
      const stageLines = sEntries.map((e: any) => {
        const co = companyMap.get(e.company_id) as any;
        const ass = e.assigned_to ? (profileMap.get(e.assigned_to) || "") : "";
        const detail = [co?.trade_name || "?", co?.category, co?.vertical, co?.city].filter(Boolean).join(" · ");
        return `- ${detail}${ass ? ` · Responsable: ${ass}` : ""}`;
      });
      const stageContent = `${header(parent, "pipeline_stage", st.id, { etapa: st.name, total: String(sEntries.length) })}\n[CONTENIDO]\nOferta: ${o.name}\nEtapa: ${st.name}\nEmpresas en esta etapa (${sEntries.length}):\n${stageLines.join("\n")}`;
      chunks.push({
        parentId: o.id,
        chunkType: "pipeline_stage",
        chunkKey: st.id,
        content: stageContent,
        metadata: { offer_id: o.id, stage_id: st.id, stage_name: st.name, total: sEntries.length },
        hash: await sha256(stageContent),
      });
    }
  }
  await skipUnchanged(supabase, "pipeline_embeddings", "offer_id", chunks, force);
  const result = await embedAndUpsert(supabase, openai, embeddingModel, chunks, "pipeline_embeddings", "offer_id");
  return jsonResp({ ...result, total_chunks: chunks.length, duration_ms: Date.now() - startTime });
}

// ============================================================
// ALLIES
// ============================================================
async function vectorizeAllies(supabase: any, openai: OpenAI, embeddingModel: string, force: boolean, startTime: number) {
  const [
    { data: allies }, { data: contacts }, { data: offerAllies }, { data: offers },
  ] = await Promise.all([
    supabase.from("allies").select("*"),
    supabase.from("ally_contacts").select("*"),
    supabase.from("offer_allies").select("*"),
    supabase.from("portfolio_offers").select("id, name, product"),
  ]);
  if (!allies?.length) return jsonResp({ processed: 0, message: "No allies", duration_ms: Date.now() - startTime });

  const offerMap = new Map((offers || []).map((o: any) => [o.id, o]));
  const chunks: (Chunk & { hash: string })[] = [];
  for (const a of allies) {
    const parent = { kind: "aliado", name: a.name, id: a.id };
    const lines: string[] = [];
    const aContacts = (contacts || []).filter((c: any) => c.ally_id === a.id);
    if (aContacts.length) {
      lines.push("Contactos:");
      for (const c of aContacts) lines.push(`- ${c.name}${c.position ? ` (${c.position})` : ""}${c.email ? ` - ${c.email}` : ""}${c.phone ? ` - ${c.phone}` : ""}`);
    }
    const linked = (offerAllies || []).filter((oa: any) => oa.ally_id === a.id);
    if (linked.length) {
      const names = linked.map((oa: any) => (offerMap.get(oa.offer_id) as any)?.name).filter(Boolean);
      if (names.length) lines.push(`Ofertas vinculadas: ${names.join(", ")}`);
    }
    const content = `${header(parent, "profile", "main")}\n[CONTENIDO]\n${lines.join("\n") || "Sin información adicional"}`;
    chunks.push({ parentId: a.id, chunkType: "profile", chunkKey: "main", content, metadata: { name: a.name }, hash: await sha256(content) });
  }
  await skipUnchanged(supabase, "ally_embeddings", "ally_id", chunks, force);
  const result = await embedAndUpsert(supabase, openai, embeddingModel, chunks, "ally_embeddings", "ally_id");
  return jsonResp({ ...result, total_chunks: chunks.length, duration_ms: Date.now() - startTime });
}

// ============================================================
// Embedding + upsert helpers
// ============================================================
async function skipUnchanged(supabase: any, table: string, idColumn: string, chunks: (Chunk & { hash: string })[], force: boolean) {
  if (force) return;
  const ids = Array.from(new Set(chunks.map((c) => c.parentId)));
  if (!ids.length) return;
  const { data: existing } = await supabase
    .from(table)
    .select(`${idColumn}, chunk_type, chunk_key, content_hash`)
    .in(idColumn, ids);
  const m = new Map<string, string>();
  for (const r of existing || []) m.set(`${r[idColumn]}|${r.chunk_type}|${r.chunk_key}`, r.content_hash || "");
  for (let i = chunks.length - 1; i >= 0; i--) {
    const ch = chunks[i];
    if (m.get(`${ch.parentId}|${ch.chunkType}|${ch.chunkKey}`) === ch.hash) chunks.splice(i, 1);
  }
}

async function embedAndUpsert(
  supabase: any,
  openai: OpenAI,
  embeddingModel: string,
  items: (Chunk & { hash: string })[],
  table: string,
  idColumn: string,
) {
  const BATCH = 50;
  let processed = 0, errors = 0;
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    try {
      const resp = await openai.embeddings.create({ model: embeddingModel, input: batch.map((b) => b.content) });
      for (let j = 0; j < batch.length; j++) {
        const ch = batch[j];
        const { error } = await supabase.from(table).upsert({
          [idColumn]: ch.parentId,
          chunk_type: ch.chunkType,
          chunk_key: ch.chunkKey,
          content: ch.content,
          metadata: ch.metadata,
          content_hash: ch.hash,
          embedding: JSON.stringify(resp.data[j].embedding),
          updated_at: new Date().toISOString(),
        }, { onConflict: `${idColumn},chunk_type,chunk_key` });
        if (error) { console.error(`upsert ${table}:`, error); errors++; } else processed++;
      }
    } catch (e) {
      console.error("batch embed error:", e);
      errors += batch.length;
    }
  }
  return { processed, errors };
}

function jsonResp(payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
