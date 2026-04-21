// ============================================================
// company-chat-actions — Centralized mutation executor for chat (v7)
// ============================================================
// All actions accept entity NAMES (company_name, offer_name,
// target_stage_name, task_title) as strings. Resolution to UUIDs
// happens server-side via fuzzy RPCs (find_company_by_name,
// find_offer_by_name) and tolerant SQL lookups for stages/tasks.
// On ambiguity / not found → returns executed:false with a clear
// human-readable error and candidate list, so the model can ask
// or correct without guessing.
//
// Side effects mirror the manual UI flow:
//   - DB write
//   - notifications (when applicable)
//   - company_history insert (logHistory equivalent)
//   - vectorize trigger (fire-and-forget)
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ACTION_TYPES = ["call", "meeting", "email", "mentoring", "diagnostic", "routing", "other"];
const MILESTONE_TYPES = ["capital", "new-markets", "alliances", "awards", "other"];

function isISODate(s: string) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function envelope(action: string, partial: any) {
  return {
    tool: action,
    mutation: true,
    executed: !!partial.executed,
    result: partial.result || null,
    side_effects: partial.side_effects || [],
    warnings: partial.warnings || [],
    candidates: partial.candidates || null,
    error: partial.error || null,
    message: partial.message || null,
    timestamp: new Date().toISOString(),
  };
}

async function fireVectorize(supabaseUrl: string, anonKey: string, entity: string, body: any) {
  fetch(`${supabaseUrl}/functions/v1/vectorize-companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` },
    body: JSON.stringify({ entity, ...body }),
  }).catch((e) => console.error("[vectorize] failed", entity, e));
}

// ============================================================
// ENTITY RESOLUTION (fuzzy, server-side)
// ============================================================
async function resolveCompany(supabase: any, name: string) {
  if (!name?.trim()) return { error: "missing_company_name", message: "Falta el nombre de la empresa." };
  const { data, error } = await supabase.rpc("find_company_by_name", { _name: name, _limit: 5 });
  if (error) return { error: "rpc_error", message: error.message };
  const rows = data || [];
  if (!rows.length) return { error: "company_not_found", message: `No tengo a "${name}" en el CRM.`, candidates: [] };
  const top = rows[0];
  const second = rows[1];
  const isClear = top.similarity >= 0.45 && (!second || top.similarity - second.similarity > 0.1);
  if (!isClear) {
    return {
      error: "company_ambiguous",
      message: `Hay varios candidatos para "${name}".`,
      candidates: rows.map((r: any) => ({ id: r.id, name: r.trade_name, legal_name: r.legal_name, nit: r.nit })),
    };
  }
  return { id: top.id, name: top.trade_name, legal_name: top.legal_name, nit: top.nit };
}

async function resolveOffer(supabase: any, name: string) {
  if (!name?.trim()) return { error: "missing_offer_name", message: "Falta el nombre de la oferta." };
  const { data, error } = await supabase.rpc("find_offer_by_name", { _name: name, _limit: 5 });
  if (error) return { error: "rpc_error", message: error.message };
  const rows = data || [];
  if (!rows.length) return { error: "offer_not_found", message: `No tengo ninguna oferta llamada "${name}".`, candidates: [] };
  const top = rows[0];
  const second = rows[1];
  const isClear = top.similarity >= 0.4 && (!second || top.similarity - second.similarity > 0.1);
  if (!isClear) {
    return {
      error: "offer_ambiguous",
      message: `Hay varios candidatos para la oferta "${name}".`,
      candidates: rows.map((r: any) => ({ id: r.id, name: r.name, product: r.product, status: r.status })),
    };
  }
  return { id: top.id, name: top.name };
}

async function resolveStage(supabase: any, offerId: string, stageName: string) {
  if (!stageName?.trim()) return { error: "missing_stage_name", message: "Falta el nombre de la etapa destino." };
  const { data } = await supabase.from("pipeline_stages").select("id, name").eq("offer_id", offerId);
  const stages = data || [];
  if (!stages.length) return { error: "no_stages", message: "Esa oferta no tiene etapas configuradas." };
  // exact ci first
  const lower = stageName.trim().toLowerCase();
  const exact = stages.find((s: any) => s.name.toLowerCase() === lower);
  if (exact) return { id: exact.id, name: exact.name };
  // contains
  const contains = stages.filter((s: any) => s.name.toLowerCase().includes(lower) || lower.includes(s.name.toLowerCase()));
  if (contains.length === 1) return { id: contains[0].id, name: contains[0].name };
  return {
    error: contains.length ? "stage_ambiguous" : "stage_not_found",
    message: contains.length
      ? `Hay varias etapas que se parecen a "${stageName}".`
      : `No encontré la etapa "${stageName}" en esa oferta. Etapas disponibles: ${stages.map((s: any) => s.name).join(", ")}.`,
    candidates: (contains.length ? contains : stages).map((s: any) => ({ id: s.id, name: s.name })),
  };
}

async function logHistory(
  supabase: any,
  companyId: string,
  eventType: string,
  title: string,
  description: string,
  metadata: any,
  performedBy: string | null,
) {
  const meta = { source: "chat_agent", ...(metadata || {}) };
  const { error } = await supabase.from("company_history").insert({
    company_id: companyId,
    event_type: eventType,
    title,
    description: description || "",
    metadata: meta,
    performed_by: performedBy || null,
  });
  if (error) console.error("[history] insert failed", error);
}

// ============================================================
// SERVE
// ============================================================
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Anon client w/ user JWT (RLS-aware writes — same as the UI does)
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  let userId: string | null = null;
  try {
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    userId = user?.id || null;
  } catch { /* */ }
  if (!userId) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseSvc = createClient(supabaseUrl, serviceRole);

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const action = body?.action as string;
  const args = body?.args || {};

  try {
    let out: any;
    switch (action) {
      case "create_task":      out = await createTask(supabase, supabaseSvc, supabaseUrl, anonKey, userId, args); break;
      case "complete_task":    out = await completeTask(supabase, supabaseUrl, anonKey, userId, args); break;
      case "create_milestone": out = await createMilestone(supabase, userId, args); break;
      case "log_action":       out = await logActionFn(supabase, userId, args); break;
      case "move_pipeline":    out = await movePipeline(supabase, supabaseUrl, anonKey, userId, args); break;
      default:
        return new Response(JSON.stringify(envelope(action || "unknown", { error: "unknown_action", message: "Acción desconocida." })), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
    return new Response(JSON.stringify(out), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[company-chat-actions]", action, e);
    return new Response(JSON.stringify(envelope(action, { error: "internal", message: e instanceof Error ? e.message : "unknown error" })), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ============================================================
// create_task
// ============================================================
async function createTask(
  supabase: any,
  supabaseSvc: any,
  supabaseUrl: string,
  anonKey: string,
  userId: string,
  args: any,
) {
  const title: string = (args.title || "").trim();
  const description: string = args.description || "";
  const dueDate: string = args.due_date;

  if (!title) return envelope("create_task", { error: "missing_title", message: "Falta el título de la tarea." });
  if (!isISODate(dueDate)) return envelope("create_task", { error: "missing_due_date", message: "Falta la fecha de vencimiento exacta (YYYY-MM-DD). No asumas 'mañana' ni 'la próxima semana' — pregunta al usuario." });

  const company = await resolveCompany(supabase, args.company_name);
  if ((company as any).error) return envelope("create_task", company as any);

  let offerId: string | null = null;
  if (args.offer_name) {
    const offer = await resolveOffer(supabase, args.offer_name);
    if (!(offer as any).error) offerId = (offer as any).id;
  }

  const { data: task, error } = await supabase.from("company_tasks").insert({
    company_id: (company as any).id,
    title,
    description,
    status: "pending",
    due_date: dueDate,
    created_by: userId,
    assigned_to: userId,
    offer_id: offerId,
  }).select().single();
  if (error || !task) return envelope("create_task", { error: "insert_failed", message: error?.message || "No pude crear la tarea." });

  await logHistory(
    supabase,
    (company as any).id,
    "task_created",
    `Tarea creada: «${title}»`,
    description,
    { taskId: task.id, dueDate, offerId },
    userId,
  );
  fireVectorize(supabaseUrl, anonKey, "companies", { companyIds: [(company as any).id] });

  return envelope("create_task", {
    executed: true,
    result: {
      task_id: task.id,
      company_name: (company as any).name,
      title,
      due_date: dueDate,
    },
    side_effects: ["history:task_created", "vectorize:companies"],
  });
}

// ============================================================
// complete_task
// ============================================================
async function completeTask(
  supabase: any,
  supabaseUrl: string,
  anonKey: string,
  userId: string,
  args: any,
) {
  const taskTitle: string = (args.task_title || "").trim();
  if (!taskTitle) return envelope("complete_task", { error: "missing_task_title", message: "Falta el título de la tarea a completar." });

  const company = await resolveCompany(supabase, args.company_name);
  if ((company as any).error) return envelope("complete_task", company as any);

  const { data: tasks } = await supabase.from("company_tasks")
    .select("id, title, status")
    .eq("company_id", (company as any).id)
    .neq("status", "completed");

  const list = tasks || [];
  if (!list.length) return envelope("complete_task", { error: "no_open_tasks", message: `*${(company as any).name}* no tiene tareas pendientes.` });

  const lower = taskTitle.toLowerCase();
  const exact = list.find((t: any) => t.title.toLowerCase() === lower);
  const contains = list.filter((t: any) => t.title.toLowerCase().includes(lower) || lower.includes(t.title.toLowerCase()));
  const candidate = exact || (contains.length === 1 ? contains[0] : null);

  if (!candidate) {
    return envelope("complete_task", {
      error: contains.length ? "task_ambiguous" : "task_not_found",
      message: contains.length
        ? `Varias tareas pendientes en *${(company as any).name}* coinciden con "${taskTitle}".`
        : `No encontré una tarea pendiente llamada "${taskTitle}" en *${(company as any).name}*.`,
      candidates: (contains.length ? contains : list).map((t: any) => ({ id: t.id, title: t.title })),
    });
  }

  const today = new Date().toISOString().split("T")[0];
  const { error } = await supabase.from("company_tasks")
    .update({ status: "completed", completed_date: today })
    .eq("id", candidate.id);
  if (error) return envelope("complete_task", { error: "update_failed", message: error.message });

  await logHistory(supabase, (company as any).id, "task_completed", `Tarea completada: ${candidate.title}`, "", { taskId: candidate.id }, userId);
  fireVectorize(supabaseUrl, anonKey, "companies", { companyIds: [(company as any).id] });

  return envelope("complete_task", {
    executed: true,
    result: { task_id: candidate.id, company_name: (company as any).name, title: candidate.title, completed_date: today },
    side_effects: ["history:task_completed", "vectorize:companies"],
  });
}

// ============================================================
// create_milestone
// ============================================================
async function createMilestone(supabase: any, userId: string, args: any) {
  const type: string = args.type || "other";
  const title: string = (args.title || "").trim();
  const description: string = args.description || "";
  const date: string = args.date || new Date().toISOString().split("T")[0];

  if (!title) return envelope("create_milestone", { error: "missing_title", message: "Falta el título del hito." });
  if (!MILESTONE_TYPES.includes(type)) return envelope("create_milestone", { error: "bad_type", message: `Tipo inválido. Debe ser uno de: ${MILESTONE_TYPES.join(", ")}.` });
  if (!isISODate(date)) return envelope("create_milestone", { error: "bad_date", message: "Fecha inválida (YYYY-MM-DD)." });

  const company = await resolveCompany(supabase, args.company_name);
  if ((company as any).error) return envelope("create_milestone", company as any);

  const { data: row, error } = await supabase.from("milestones").insert({
    company_id: (company as any).id, type, title, description, date, created_by: userId,
  }).select().single();
  if (error || !row) return envelope("create_milestone", { error: "insert_failed", message: error?.message || "No pude registrar el hito." });

  await logHistory(supabase, (company as any).id, "milestone", `Hito: ${title}`, description, { milestoneId: row.id, type, date }, userId);

  return envelope("create_milestone", {
    executed: true,
    result: { milestone_id: row.id, company_name: (company as any).name, type, title, date },
    side_effects: ["history:milestone"],
  });
}

// ============================================================
// log_action
// ============================================================
async function logActionFn(supabase: any, userId: string, args: any) {
  const type: string = args.type;
  const description: string = (args.description || "").trim();
  const date: string = args.date || new Date().toISOString().split("T")[0];
  const notes: string | null = args.notes || null;

  if (!type || !ACTION_TYPES.includes(type)) {
    return envelope("log_action", { error: "bad_type", message: `Tipo inválido. Debe ser uno de: ${ACTION_TYPES.join(", ")}.` });
  }
  if (!description) return envelope("log_action", { error: "missing_description", message: "Falta la descripción de la acción." });
  if (!isISODate(date)) return envelope("log_action", { error: "bad_date", message: "Fecha inválida (YYYY-MM-DD)." });

  const company = await resolveCompany(supabase, args.company_name);
  if ((company as any).error) return envelope("log_action", company as any);

  const { data: row, error } = await supabase.from("company_actions").insert({
    company_id: (company as any).id, type, description, date, notes, created_by: userId,
  }).select().single();
  if (error || !row) return envelope("log_action", { error: "insert_failed", message: error?.message || "No pude registrar la acción." });

  await logHistory(supabase, (company as any).id, "action", `Acción: ${type}`, description, { actionId: row.id, type, notes, date }, userId);

  return envelope("log_action", {
    executed: true,
    result: { action_id: row.id, company_name: (company as any).name, type, description, date },
    side_effects: ["history:action"],
  });
}

// ============================================================
// move_pipeline — resolves company + offer + stage by name
// ============================================================
async function movePipeline(
  supabase: any,
  supabaseUrl: string,
  anonKey: string,
  userId: string,
  args: any,
) {
  const company = await resolveCompany(supabase, args.company_name);
  if ((company as any).error) return envelope("move_pipeline", company as any);

  const offer = await resolveOffer(supabase, args.offer_name);
  if ((offer as any).error) return envelope("move_pipeline", offer as any);

  // Verify the company is enrolled in that offer
  const { data: entry } = await supabase.from("pipeline_entries")
    .select("id, stage_id")
    .eq("company_id", (company as any).id)
    .eq("offer_id", (offer as any).id)
    .maybeSingle();

  if (!entry) {
    // Look up which offers the company IS enrolled in
    const { data: otherEntries } = await supabase.from("pipeline_entries")
      .select("offer_id, portfolio_offers!inner(name)")
      .eq("company_id", (company as any).id);
    const offerNames = (otherEntries || []).map((e: any) => e.portfolio_offers?.name).filter(Boolean);
    return envelope("move_pipeline", {
      error: "not_enrolled",
      message: offerNames.length
        ? `*${(company as any).name}* no está inscrita en *${(offer as any).name}*. Sí aparece en: ${offerNames.join(", ")}.`
        : `*${(company as any).name}* no está inscrita en ninguna oferta del portafolio.`,
      candidates: offerNames.map((n: string) => ({ name: n })),
    });
  }

  const stage = await resolveStage(supabase, (offer as any).id, args.target_stage_name);
  if ((stage as any).error) return envelope("move_pipeline", stage as any);

  if (entry.stage_id === (stage as any).id) {
    return envelope("move_pipeline", {
      executed: false,
      warnings: ["already_in_stage"],
      message: `*${(company as any).name}* ya está en la etapa «${(stage as any).name}» de *${(offer as any).name}*.`,
    });
  }

  const { data: oldStage } = await supabase.from("pipeline_stages").select("name").eq("id", entry.stage_id).maybeSingle();

  const { error } = await supabase.from("pipeline_entries").update({ stage_id: (stage as any).id }).eq("id", entry.id);
  if (error) return envelope("move_pipeline", { error: "update_failed", message: error.message });

  await logHistory(
    supabase,
    (company as any).id,
    "pipeline_move",
    `Movida en ${(offer as any).name}`,
    `${oldStage?.name || ""} → ${(stage as any).name}`,
    { offerId: (offer as any).id, fromStageId: entry.stage_id, toStageId: (stage as any).id, entryId: entry.id },
    userId,
  );
  fireVectorize(supabaseUrl, anonKey, "pipeline", {});

  return envelope("move_pipeline", {
    executed: true,
    result: {
      company_name: (company as any).name,
      offer_name: (offer as any).name,
      from_stage: oldStage?.name || null,
      to_stage: (stage as any).name,
    },
    side_effects: ["history:pipeline_move", "vectorize:pipeline"],
  });
}
