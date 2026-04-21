// ============================================================
// company-chat-actions — Centralized mutation executor for chat
// ============================================================
// Replicates EXACTLY the same secuence used by CRMContext /
// PortfolioContext on the frontend, so a chat-driven action is
// indistinguishable from a UI-driven one:
//   - DB write
//   - notifications (when applicable)
//   - company_history insert (logHistory equivalent)
//   - vectorize trigger (fire-and-forget)
//
// Exposed actions:
//   - create_task
//   - complete_task
//   - create_milestone
//   - log_action
//   - move_pipeline
//
// Auth: validates the caller JWT, runs DB writes with the user's
// own auth context (so RLS applies the same way as in the UI).
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
    ambiguity: partial.ambiguity || null,
    error: partial.error || null,
    timestamp: new Date().toISOString(),
  };
}

async function fireVectorize(supabaseUrl: string, anonKey: string, entity: string, body: any) {
  // Fire-and-forget: don't await, don't block the response.
  fetch(`${supabaseUrl}/functions/v1/vectorize-companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` },
    body: JSON.stringify({ entity, ...body }),
  }).catch((e) => console.error("[vectorize] failed", entity, e));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ---- Auth ----
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Anon client w/ user JWT (for RLS-aware writes, like the frontend does)
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  // Resolve caller user id
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

  // Service-role client only used for cross-user reads (e.g. profile name lookups for notifications)
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
        return new Response(JSON.stringify(envelope(action || "unknown", { error: "unknown action" })), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
    return new Response(JSON.stringify(out), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[company-chat-actions]", action, e);
    return new Response(JSON.stringify(envelope(action, { error: e instanceof Error ? e.message : "unknown error" })), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ============================================================
// HELPERS
// ============================================================
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

async function getCompanyMeta(supabase: any, companyId: string) {
  const { data } = await supabase.from("companies").select("id, trade_name").eq("id", companyId).maybeSingle();
  return data;
}

// ============================================================
// create_task — mirrors CRMContext.addTask
// ============================================================
async function createTask(
  supabase: any,
  supabaseSvc: any,
  supabaseUrl: string,
  anonKey: string,
  userId: string,
  args: any,
) {
  const companyId: string = args.company_id;
  const title: string = (args.title || "").trim();
  const description: string = args.description || "";
  const dueDate: string = args.due_date;
  const assignedTo: string | null = args.assigned_to || userId;
  const offerId: string | null = args.offer_id || null;

  if (!companyId)  return envelope("create_task", { error: "missing_company_id", message: "Falta identificar la empresa." });
  if (!title)      return envelope("create_task", { error: "missing_title", message: "Falta el título de la tarea." });
  if (!isISODate(dueDate)) return envelope("create_task", { error: "missing_due_date", message: "Falta la fecha de vencimiento (formato YYYY-MM-DD)." });

  const company = await getCompanyMeta(supabase, companyId);
  if (!company) return envelope("create_task", { error: "company_not_found", message: "No encontré esa empresa." });

  const { data: task, error } = await supabase.from("company_tasks").insert({
    company_id: companyId,
    title,
    description,
    status: "pending",
    due_date: dueDate,
    created_by: userId,
    assigned_to: assignedTo,
    offer_id: offerId,
  }).select().single();
  if (error || !task) return envelope("create_task", { error: error?.message || "insert failed" });

  const sideEffects: string[] = [];

  // Notification (if assigned to someone else)
  if (assignedTo && assignedTo !== userId) {
    const { error: notifErr } = await supabaseSvc.from("notifications").insert({
      user_id: assignedTo,
      type: "task_assigned",
      title: "Nueva tarea asignada",
      message: `Te asignaron la tarea "${title}"`,
      reference_id: task.id,
    });
    if (!notifErr) sideEffects.push(`notification:${assignedTo}`);
  }

  await logHistory(
    supabase,
    companyId,
    "task_created",
    `Tarea creada: «${title}»`,
    description,
    { taskId: task.id, dueDate, assignedTo, offerId },
    userId,
  );
  sideEffects.push("history:task_created");

  fireVectorize(supabaseUrl, anonKey, "companies", { companyIds: [companyId] });
  sideEffects.push("vectorize:companies");

  return envelope("create_task", {
    executed: true,
    result: {
      task_id: task.id,
      company_id: companyId,
      company_name: company.trade_name,
      title,
      due_date: dueDate,
      assigned_to: assignedTo,
    },
    side_effects: sideEffects,
  });
}

// ============================================================
// complete_task — mirrors CRMContext.updateTask({status:'completed'})
// ============================================================
async function completeTask(
  supabase: any,
  supabaseUrl: string,
  anonKey: string,
  userId: string,
  args: any,
) {
  const taskId: string = args.task_id;
  if (!taskId) return envelope("complete_task", { error: "task_id required" });

  const { data: existing } = await supabase.from("company_tasks").select("id, title, company_id, status").eq("id", taskId).maybeSingle();
  if (!existing) return envelope("complete_task", { error: "task not found" });
  if (existing.status === "completed") {
    return envelope("complete_task", { warnings: ["task already completed"], result: { task_id: taskId, company_id: existing.company_id, title: existing.title } });
  }

  const today = new Date().toISOString().split("T")[0];
  const { error } = await supabase.from("company_tasks")
    .update({ status: "completed", completed_date: today })
    .eq("id", taskId);
  if (error) return envelope("complete_task", { error: error.message });

  const sideEffects: string[] = [];
  await logHistory(supabase, existing.company_id, "task_completed", `Tarea completada: ${existing.title}`, "", {}, userId);
  sideEffects.push("history:task_completed");

  fireVectorize(supabaseUrl, anonKey, "companies", { companyIds: [existing.company_id] });
  sideEffects.push("vectorize:companies");

  return envelope("complete_task", {
    executed: true,
    result: { task_id: taskId, company_id: existing.company_id, title: existing.title, completed_date: today },
    side_effects: sideEffects,
  });
}

// ============================================================
// create_milestone — mirrors CRMContext.addMilestone
// ============================================================
async function createMilestone(supabase: any, userId: string, args: any) {
  const companyId: string = args.company_id;
  const type: string = args.type || "other";
  const title: string = (args.title || "").trim();
  const description: string = args.description || "";
  const date: string = args.date || new Date().toISOString().split("T")[0];

  if (!companyId) return envelope("create_milestone", { error: "company_id required" });
  if (!title)     return envelope("create_milestone", { error: "title required" });
  if (!MILESTONE_TYPES.includes(type)) return envelope("create_milestone", { error: `type must be one of ${MILESTONE_TYPES.join(",")}` });
  if (!isISODate(date)) return envelope("create_milestone", { error: "date must be YYYY-MM-DD" });

  const company = await getCompanyMeta(supabase, companyId);
  if (!company) return envelope("create_milestone", { error: "company not found" });

  const { data: row, error } = await supabase.from("milestones").insert({
    company_id: companyId, type, title, description, date, created_by: userId,
  }).select().single();
  if (error || !row) return envelope("create_milestone", { error: error?.message || "insert failed" });

  await logHistory(supabase, companyId, "milestone", `Hito: ${title}`, description, { milestoneId: row.id, type, date }, userId);

  return envelope("create_milestone", {
    executed: true,
    result: { milestone_id: row.id, company_id: companyId, company_name: company.trade_name, type, title, date },
    side_effects: ["history:milestone"],
  });
}

// ============================================================
// log_action — mirrors CRMContext.addAction
// ============================================================
async function logActionFn(supabase: any, userId: string, args: any) {
  const companyId: string = args.company_id;
  const type: string = args.type;
  const description: string = (args.description || "").trim();
  const date: string = args.date || new Date().toISOString().split("T")[0];
  const notes: string | null = args.notes || null;

  if (!companyId)  return envelope("log_action", { error: "company_id required" });
  if (!type || !ACTION_TYPES.includes(type)) {
    return envelope("log_action", { error: `type must be one of ${ACTION_TYPES.join(",")}` });
  }
  if (!description) return envelope("log_action", { error: "description required" });
  if (!isISODate(date)) return envelope("log_action", { error: "date must be YYYY-MM-DD" });

  const company = await getCompanyMeta(supabase, companyId);
  if (!company) return envelope("log_action", { error: "company not found" });

  const { data: row, error } = await supabase.from("company_actions").insert({
    company_id: companyId, type, description, date, notes, created_by: userId,
  }).select().single();
  if (error || !row) return envelope("log_action", { error: error?.message || "insert failed" });

  await logHistory(supabase, companyId, "action", `Acción: ${type}`, description, { actionId: row.id, type, notes, date }, userId);

  return envelope("log_action", {
    executed: true,
    result: { action_id: row.id, company_id: companyId, company_name: company.trade_name, type, description, date },
    side_effects: ["history:action"],
  });
}

// ============================================================
// move_pipeline — mirrors PortfolioContext.moveCompanyToStage
// Accepts either entry_id, or (company_id + offer_id) to resolve it.
// target_stage_id required (caller resolves stage by name beforehand).
// ============================================================
async function movePipeline(
  supabase: any,
  supabaseUrl: string,
  anonKey: string,
  userId: string,
  args: any,
) {
  const targetStageId: string = args.target_stage_id;
  if (!targetStageId) return envelope("move_pipeline", { error: "target_stage_id required" });

  // Resolve entry
  let entryId: string | null = args.entry_id || null;
  let entry: any = null;

  if (entryId) {
    const { data } = await supabase.from("pipeline_entries").select("id, company_id, offer_id, stage_id").eq("id", entryId).maybeSingle();
    entry = data;
  } else {
    const companyId = args.company_id;
    const offerId = args.offer_id;
    if (!companyId || !offerId) return envelope("move_pipeline", { error: "entry_id OR (company_id + offer_id) required" });
    const { data } = await supabase.from("pipeline_entries")
      .select("id, company_id, offer_id, stage_id")
      .eq("company_id", companyId).eq("offer_id", offerId).maybeSingle();
    entry = data;
    entryId = data?.id || null;
  }

  if (!entry || !entryId) return envelope("move_pipeline", { error: "pipeline entry not found for that company/offer" });

  // Validate stage belongs to the same offer
  const { data: stage } = await supabase.from("pipeline_stages").select("id, name, offer_id").eq("id", targetStageId).maybeSingle();
  if (!stage)                       return envelope("move_pipeline", { error: "target stage not found" });
  if (stage.offer_id !== entry.offer_id) return envelope("move_pipeline", { error: "target stage does not belong to the entry's offer" });

  if (entry.stage_id === targetStageId) {
    return envelope("move_pipeline", { warnings: ["already in that stage"], result: { entry_id: entryId, company_id: entry.company_id, stage_id: targetStageId } });
  }

  const { data: oldStage } = await supabase.from("pipeline_stages").select("name").eq("id", entry.stage_id).maybeSingle();
  const { data: offer } = await supabase.from("portfolio_offers").select("name").eq("id", entry.offer_id).maybeSingle();

  const { error } = await supabase.from("pipeline_entries").update({ stage_id: targetStageId }).eq("id", entryId);
  if (error) return envelope("move_pipeline", { error: error.message });

  const sideEffects: string[] = [];
  await logHistory(
    supabase,
    entry.company_id,
    "pipeline_move",
    `Movida en ${offer?.name || ""}`,
    `${oldStage?.name || ""} → ${stage.name}`,
    { offerId: entry.offer_id, fromStageId: entry.stage_id, toStageId: targetStageId, entryId },
    userId,
  );
  sideEffects.push("history:pipeline_move");

  fireVectorize(supabaseUrl, anonKey, "pipeline", {});
  sideEffects.push("vectorize:pipeline");

  return envelope("move_pipeline", {
    executed: true,
    result: {
      entry_id: entryId,
      company_id: entry.company_id,
      offer_id: entry.offer_id,
      offer_name: offer?.name || null,
      from_stage: oldStage?.name || null,
      to_stage: stage.name,
      to_stage_id: targetStageId,
    },
    side_effects: sideEffects,
  });
}
