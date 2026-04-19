import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const N8N_WEBHOOK_URL_DEFAULT = "https://n8n-n8n.yajjj6.easypanel.host/webhook/cd42a676-0c5e-418f-950e-e92853f653e6";

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function hashCode(code: string): Promise<string> {
  const enc = new TextEncoder().encode(code);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function maskEmail(email: string): string {
  if (!email || !email.includes("@")) return "***@***.***";
  const [user, domain] = email.split("@");
  const masked = user.length <= 2 ? "**" : user[0] + user[1] + "*".repeat(Math.max(1, user.length - 2));
  return `${masked}@${domain}`;
}

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Rate limiting store (in-memory, resets on cold start)
const rateLimits = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimits.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (req.method === "POST" && action === "identify") {
      const { form_id, key_value, ip_address, test_mode, test_email, use_name_fallback } = await req.json();
      if (!form_id || !key_value) return jsonRes({ error: "form_id y key_value son requeridos" }, 400);

      const isTestMode = test_mode === true && !!test_email;

      // Rate limit by IP (skip in test mode)
      if (!isTestMode) {
        const ipKey = `ip:${ip_address || "unknown"}`;
        if (!checkRateLimit(ipKey, 10, 60000)) return jsonRes({ error: "Demasiados intentos. Intenta de nuevo en un minuto." }, 429);
        const nitKey = `nit:${key_value}`;
        if (!checkRateLimit(nitKey, 5, 60000)) return jsonRes({ error: "Demasiados intentos para este NIT. Intenta de nuevo en un minuto." }, 429);
      }

      // Get form — in test mode allow any status (draft, paused, etc.)
      let formQuery = supabaseAdmin.from("external_forms").select("*").eq("id", form_id);
      if (!isTestMode) formQuery = formQuery.eq("status", "active");
      const { data: form, error: formErr } = await formQuery.single();
      if (formErr || !form) return jsonRes({ error: isTestMode ? "Formulario no encontrado" : "Formulario no encontrado o no está activo" }, 404);

      // Increment access count (skip in test mode)
      if (!isTestMode)
      await supabaseAdmin.from("external_forms").update({ access_count: (form.access_count || 0) + 1 }).eq("id", form_id);

      const keyField = form.verification_key_field || "nit";

      // Look up company
      let company: any = null;
      if (use_name_fallback && form.allow_name_fallback) {
        // Search by trade_name OR legal_name (case-insensitive)
        const { data: byTrade } = await supabaseAdmin.from("companies").select("id, trade_name, nit, legal_name").ilike("trade_name", key_value.trim()).limit(1);
        if (byTrade && byTrade.length > 0) {
          company = byTrade[0];
        } else {
          const { data: byLegal } = await supabaseAdmin.from("companies").select("id, trade_name, nit, legal_name").ilike("legal_name", key_value.trim()).limit(1);
          company = byLegal?.[0] || null;
        }
      } else if (keyField === "nit") {
        const { data } = await supabaseAdmin.from("companies").select("id, trade_name, nit").eq("nit", key_value).maybeSingle();
        company = data;
      } else if (keyField === "legal_name") {
        const { data } = await supabaseAdmin.from("companies").select("id, trade_name, nit, legal_name").ilike("legal_name", key_value.trim()).maybeSingle();
        company = data;
      }

      if (form.form_type !== "creation" && !company) {
        const msg = keyField === "legal_name" 
          ? "No se encontró una empresa con esa razón social. Verifica e intenta de nuevo." 
          : "No se encontró una empresa con ese NIT. Verifica e intenta de nuevo.";
        return jsonRes({ error: msg }, 404);
      }

      // If no verification needed
      if (form.verification_mode === "none") {
        const token = crypto.randomUUID();
        await supabaseAdmin.from("external_form_sessions").insert({
          form_id, company_id: company?.id || null, is_verified: true, verified_at: new Date().toISOString(),
          session_token: token, ip_address, expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
        });
        await supabaseAdmin.from("external_forms").update({ started_count: (form.started_count || 0) + 1 }).eq("id", form_id);
        return jsonRes({ success: true, session_token: token, requires_code: false });
      }

      // Key only verification
      if (form.verification_mode === "key_only") {
        if (!company) return jsonRes({ error: "Empresa no encontrada" }, 404);
        const token = crypto.randomUUID();
        await supabaseAdmin.from("external_form_sessions").insert({
          form_id, company_id: company.id, is_verified: true, verified_at: new Date().toISOString(),
          session_token: token, ip_address, expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
        });
        await supabaseAdmin.from("external_forms").update({ started_count: (form.started_count || 0) + 1 }).eq("id", form_id);
        return jsonRes({ success: true, session_token: token, requires_code: false });
      }

      // Key + code verification
      if (!company) return jsonRes({ error: "Empresa no encontrada" }, 404);

      // In test mode, use test_email directly (skip contact selection)
      if (isTestMode) {
        const email = test_email;
        if (!email) return jsonRes({ error: "Se requiere test_email en modo prueba" }, 400);
        // Create session and send code directly
        const token = crypto.randomUUID();
        const { data: session } = await supabaseAdmin.from("external_form_sessions").insert({
          form_id, company_id: company.id, is_verified: false,
          session_token: token, ip_address,
          expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
        }).select("id").single();
        const verCode = generateCode();
        const codeHash = await hashCode(verCode);
        const expiresAt = new Date(Date.now() + (form.code_expiration_minutes || 10) * 60 * 1000).toISOString();
        await supabaseAdmin.from("external_form_verification_codes").insert({
          session_id: session!.id, code_hash: codeHash, expires_at: expiresAt,
          max_attempts: form.max_code_attempts || 5
        });
        let webhookUrl = N8N_WEBHOOK_URL_DEFAULT;
        const { data: settings } = await supabaseAdmin.from("feature_settings").select("config").eq("feature_key", "external_forms").maybeSingle();
        if (settings?.config && typeof settings.config === "object" && (settings.config as any).webhook_url) webhookUrl = (settings.config as any).webhook_url;
        try { await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company_id: company.id, company_name: company.trade_name, nit: company.nit, destination_email: email, masked_email: maskEmail(email), verification_code: verCode, form_id, form_name: form.name, test_mode: true }) }); } catch (e) { console.error("Webhook error:", e); }
        return jsonRes({ success: true, session_token: token, requires_code: true, masked_email: maskEmail(email), company_name: company.trade_name, test_mode: true });
      }

      // Get all contacts with email for this company
      const { data: allContacts } = await supabaseAdmin.from("contacts").select("id, name, email, position, is_primary").eq("company_id", company.id);
      const contactsWithEmail = (allContacts || []).filter((c: any) => c.email && c.email.trim());

      if (contactsWithEmail.length === 0) return jsonRes({ error: "La empresa no tiene un email registrado. Contacte al administrador." }, 400);

      // If multiple contacts, ask user to choose
      if (contactsWithEmail.length > 1) {
        // Create a pending session (not verified, no code yet) — we'll use it after contact selection
        const token = crypto.randomUUID();
        await supabaseAdmin.from("external_form_sessions").insert({
          form_id, company_id: company.id, is_verified: false,
          session_token: token, ip_address,
          expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
        });
        return jsonRes({
          success: true, session_token: token,
          requires_contact_selection: true,
          company_name: company.trade_name,
          contacts: contactsWithEmail.map((c: any) => ({
            id: c.id,
            masked_email: maskEmail(c.email),
            position: c.position || '',
            is_primary: c.is_primary
          }))
        });
      }

      // Single contact — send code directly
      const email = contactsWithEmail[0].email;
      const token = crypto.randomUUID();
      const { data: session } = await supabaseAdmin.from("external_form_sessions").insert({
        form_id, company_id: company.id, is_verified: false,
        session_token: token, ip_address,
        expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
      }).select("id").single();

      const verCode = generateCode();
      const codeHash = await hashCode(verCode);
      const expiresAt = new Date(Date.now() + (form.code_expiration_minutes || 10) * 60 * 1000).toISOString();
      await supabaseAdmin.from("external_form_verification_codes").insert({
        session_id: session!.id, code_hash: codeHash, expires_at: expiresAt,
        max_attempts: form.max_code_attempts || 5
      });

      let webhookUrl = N8N_WEBHOOK_URL_DEFAULT;
      const { data: settings } = await supabaseAdmin.from("feature_settings").select("config").eq("feature_key", "external_forms").maybeSingle();
      if (settings?.config && typeof settings.config === "object" && (settings.config as any).webhook_url) webhookUrl = (settings.config as any).webhook_url;
      try { await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company_id: company.id, company_name: company.trade_name, nit: company.nit, destination_email: email, masked_email: maskEmail(email), verification_code: verCode, form_id, form_name: form.name, test_mode: false }) }); } catch (e) { console.error("Webhook error:", e); }

      return jsonRes({
        success: true, session_token: token, requires_code: true,
        masked_email: maskEmail(email), company_name: company.trade_name
      });
    }

    if (req.method === "POST" && action === "verify-code") {
      const { session_token, code } = await req.json();
      if (!session_token || !code) return jsonRes({ error: "Token y código son requeridos" }, 400);

      const { data: session } = await supabaseAdmin.from("external_form_sessions").select("*").eq("session_token", session_token).single();
      if (!session) return jsonRes({ error: "Sesión no encontrada" }, 404);
      if (new Date(session.expires_at) < new Date()) return jsonRes({ error: "La sesión ha expirado" }, 410);

      const { data: codes } = await supabaseAdmin.from("external_form_verification_codes").select("*").eq("session_id", session.id).eq("used", false).order("created_at", { ascending: false }).limit(1);
      const verCode = codes?.[0];
      if (!verCode) return jsonRes({ error: "No hay código de verificación pendiente" }, 400);
      if (new Date(verCode.expires_at) < new Date()) return jsonRes({ error: "El código ha expirado. Solicita uno nuevo." }, 410);
      if (verCode.attempts >= verCode.max_attempts) return jsonRes({ error: "Demasiados intentos. Solicita un nuevo código." }, 429);

      // Increment attempts
      await supabaseAdmin.from("external_form_verification_codes").update({ attempts: verCode.attempts + 1 }).eq("id", verCode.id);

      const inputHash = await hashCode(code);
      if (inputHash !== verCode.code_hash) return jsonRes({ error: "Código incorrecto. Intenta de nuevo." }, 401);

      // Mark code as used and session as verified
      await supabaseAdmin.from("external_form_verification_codes").update({ used: true }).eq("id", verCode.id);
      await supabaseAdmin.from("external_form_sessions").update({ is_verified: true, verified_at: new Date().toISOString() }).eq("id", session.id);

      // Increment started count
      const { data: form } = await supabaseAdmin.from("external_forms").select("started_count").eq("id", session.form_id).single();
      if (form) await supabaseAdmin.from("external_forms").update({ started_count: (form.started_count || 0) + 1 }).eq("id", session.form_id);

      return jsonRes({ success: true });
    }

    // Select contact for OTP — called when company has multiple contacts
    if (req.method === "POST" && action === "select-contact") {
      const { session_token, contact_id } = await req.json();
      if (!session_token || !contact_id) return jsonRes({ error: "Token y contacto son requeridos" }, 400);

      const { data: session } = await supabaseAdmin.from("external_form_sessions").select("*").eq("session_token", session_token).single();
      if (!session) return jsonRes({ error: "Sesión no encontrada" }, 404);
      if (new Date(session.expires_at) < new Date()) return jsonRes({ error: "La sesión ha expirado" }, 410);
      if (session.is_verified) return jsonRes({ error: "Sesión ya verificada" }, 400);

      // Get the selected contact
      const { data: contact } = await supabaseAdmin.from("contacts").select("id, email, name").eq("id", contact_id).eq("company_id", session.company_id).single();
      if (!contact || !contact.email) return jsonRes({ error: "Contacto no válido" }, 400);

      // Get form for config
      const { data: form } = await supabaseAdmin.from("external_forms").select("code_expiration_minutes, max_code_attempts, name").eq("id", session.form_id).single();

      // Generate and store code
      const verCode = generateCode();
      const codeHash = await hashCode(verCode);
      const expiresAt = new Date(Date.now() + (form?.code_expiration_minutes || 10) * 60 * 1000).toISOString();
      await supabaseAdmin.from("external_form_verification_codes").insert({
        session_id: session.id, code_hash: codeHash, expires_at: expiresAt,
        max_attempts: form?.max_code_attempts || 5
      });

      // Get company name
      const { data: company } = await supabaseAdmin.from("companies").select("trade_name, nit").eq("id", session.company_id).single();

      // Send code via webhook
      let webhookUrl = N8N_WEBHOOK_URL_DEFAULT;
      const { data: settings } = await supabaseAdmin.from("feature_settings").select("config").eq("feature_key", "external_forms").maybeSingle();
      if (settings?.config && typeof settings.config === "object" && (settings.config as any).webhook_url) webhookUrl = (settings.config as any).webhook_url;
      try { await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company_id: session.company_id, company_name: company?.trade_name, nit: company?.nit, destination_email: contact.email, masked_email: maskEmail(contact.email), verification_code: verCode, form_id: session.form_id, form_name: form?.name, test_mode: false }) }); } catch (e) { console.error("Webhook error:", e); }

      return jsonRes({
        success: true, requires_code: true,
        masked_email: maskEmail(contact.email), company_name: company?.trade_name
      });
    }

    if (req.method === "GET" && action === "load-form") {
      const sessionToken = url.searchParams.get("session_token");
      const slug = url.searchParams.get("slug");
      const testMode = url.searchParams.get("test_mode") === "true";

      // If slug only (for creation forms without verification)
      if (slug && !sessionToken) {
        let formQuery = supabaseAdmin.from("external_forms").select("*").eq("slug", slug);
        if (!testMode) formQuery = formQuery.eq("status", "active");
        const { data: form } = await formQuery.single();
        if (!form) return jsonRes({ error: "Formulario no encontrado" }, 404);
        const { data: fields } = await supabaseAdmin.from("external_form_fields").select("*").eq("form_id", form.id).order("display_order");
        const { data: pages } = await supabaseAdmin.from("external_form_pages").select("*").eq("form_id", form.id).order("display_order");
        return jsonRes({ form, fields: fields || [], pages: pages || [], preloaded_data: {} });
      }

      if (!sessionToken) return jsonRes({ error: "Token requerido" }, 400);

      const { data: session } = await supabaseAdmin.from("external_form_sessions").select("*").eq("session_token", sessionToken).single();
      if (!session) return jsonRes({ error: "Sesión no encontrada" }, 404);
      if (!session.is_verified) return jsonRes({ error: "Sesión no verificada" }, 403);
      if (new Date(session.expires_at) < new Date()) return jsonRes({ error: "Sesión expirada" }, 410);

      const { data: form } = await supabaseAdmin.from("external_forms").select("*").eq("id", session.form_id).single();
      if (!form) return jsonRes({ error: "Formulario no encontrado" }, 404);

      const { data: fields } = await supabaseAdmin.from("external_form_fields").select("*").eq("form_id", form.id).order("display_order");
      const { data: pages } = await supabaseAdmin.from("external_form_pages").select("*").eq("form_id", form.id).order("display_order");

      // Preload data from CRM
      let preloadedData: Record<string, any> = {};
      if (session.company_id && fields) {
        const { data: company } = await supabaseAdmin.from("companies").select("*").eq("id", session.company_id).single();
        const { data: contacts } = await supabaseAdmin.from("contacts").select("*").eq("company_id", session.company_id);
        const { data: fieldValues } = await supabaseAdmin.from("custom_field_values").select("*").eq("company_id", session.company_id);

        for (const field of fields) {
          if (!field.preload_from_crm) continue;
          if (field.crm_table === "companies" && field.crm_column && company) {
            const val = (company as any)[field.crm_column];
            // For sales_by_year, pass the JSON object directly
            if (field.crm_column === "sales_by_year") {
              preloadedData[field.field_key] = val || {};
            } else {
              preloadedData[field.field_key] = val ?? "";
            }
          } else if (field.crm_table === "contacts" && field.crm_column) {
            const primary = contacts?.find((c: any) => c.is_primary) || contacts?.[0];
            if (primary) preloadedData[field.field_key] = (primary as any)[field.crm_column] ?? "";
          } else if (field.crm_table === "custom_field_values" && field.crm_field_id) {
            const fv = fieldValues?.find((v: any) => v.field_id === field.crm_field_id);
            if (fv) preloadedData[field.field_key] = fv.text_value || fv.number_value || "";
          }
        }
      }

      // Apply default_value for any field without a preloaded value
      if (fields) {
        for (const field of fields) {
          const cur = preloadedData[field.field_key];
          const isEmpty = cur === undefined || cur === null || cur === "" ||
            (typeof cur === "object" && !Array.isArray(cur) && Object.keys(cur).length === 0);
          if (isEmpty && field.default_value) {
            if (field.field_type === "number") {
              const n = Number(field.default_value);
              preloadedData[field.field_key] = isNaN(n) ? field.default_value : n;
            } else if (field.field_type === "checkbox") {
              preloadedData[field.field_key] = field.default_value === "true";
            } else {
              preloadedData[field.field_key] = field.default_value;
            }
          }
        }
      }

      const isNewCompany = !session.company_id;
      return jsonRes({ form, fields: fields || [], pages: pages || [], preloaded_data: preloadedData, is_new_company: isNewCompany });
    }

    if (req.method === "POST" && action === "submit") {
      const { session_token, form_id, response_data, test_mode } = await req.json();
      if (!form_id || !response_data) return jsonRes({ error: "Datos incompletos" }, 400);

      const isSubmitTest = test_mode === true;
      let formQuery = supabaseAdmin.from("external_forms").select("*").eq("id", form_id);
      if (!isSubmitTest) formQuery = formQuery.eq("status", "active");
      const { data: form } = await formQuery.single();
      if (!form) return jsonRes({ error: "Formulario no encontrado" }, 404);

      let companyId: string | null = null;
      let sessionId: string | null = null;

      if (session_token) {
        const { data: session } = await supabaseAdmin.from("external_form_sessions").select("*").eq("session_token", session_token).single();
        if (!session || !session.is_verified) return jsonRes({ error: "Sesión no válida" }, 403);
        if (new Date(session.expires_at) < new Date()) return jsonRes({ error: "Sesión expirada" }, 410);
        companyId = session.company_id;
        sessionId = session.id;
      }

      // Insert response
      const { data: response, error: resErr } = await supabaseAdmin.from("external_form_responses").insert({
        form_id, session_id: sessionId, company_id: companyId,
        response_data, status: form.form_type === "creation" ? "pending" : "pending"
      }).select("id").single();

      if (resErr) return jsonRes({ error: "Error guardando respuesta" }, 500);

      // For update/collection forms, apply changes and create audit log
      if (companyId && (form.form_type === "update" || form.form_type === "collection")) {
        const { data: fields } = await supabaseAdmin.from("external_form_fields").select("*").eq("form_id", form_id);
        const { data: company } = await supabaseAdmin.from("companies").select("*").eq("id", companyId).single();

        const companyUpdates: Record<string, any> = {};
        const auditEntries: any[] = [];

        for (const field of (fields || [])) {
          if (!field.is_editable || field.is_readonly) continue;
          const newVal = response_data[field.field_key];
          if (newVal === undefined || newVal === null) continue;

          if (field.crm_table === "companies" && field.crm_column && company) {
            const oldVal = (company as any)[field.crm_column];
            // For sales_by_year, handle as JSON merge AND persist the chosen currency
            if (field.crm_column === "sales_by_year" && typeof newVal === "object") {
              const merged = { ...(oldVal || {}), ...newVal };
              if (JSON.stringify(oldVal || {}) !== JSON.stringify(merged)) {
                companyUpdates[field.crm_column] = merged;
                auditEntries.push({
                  response_id: response!.id, company_id: companyId,
                  field_key: field.field_key, field_label: field.label,
                  old_value: JSON.stringify(oldVal || {}), new_value: JSON.stringify(merged)
                });
              }
              // Capture the sibling "<field_key>_currency" sent by the public form
              const currencyVal = response_data[`${field.field_key}_currency`];
              if (currencyVal && (currencyVal === "COP" || currencyVal === "USD")) {
                const oldCurrency = (company as any).sales_currency || "COP";
                if (oldCurrency !== currencyVal) {
                  companyUpdates.sales_currency = currencyVal;
                  auditEntries.push({
                    response_id: response!.id, company_id: companyId,
                    field_key: `${field.field_key}_currency`, field_label: `${field.label} — Moneda`,
                    old_value: String(oldCurrency), new_value: String(currencyVal)
                  });
                }
              }
            } else if (String(oldVal ?? "") !== String(newVal)) {
              companyUpdates[field.crm_column] = newVal;
              auditEntries.push({
                response_id: response!.id, company_id: companyId,
                field_key: field.field_key, field_label: field.label,
                old_value: String(oldVal ?? ""), new_value: String(newVal)
              });
            }
          } else if (field.crm_table === "contacts" && field.crm_column) {
            // Update primary contact
            const { data: contacts } = await supabaseAdmin.from("contacts").select("*").eq("company_id", companyId).eq("is_primary", true).limit(1);
            const contact = contacts?.[0];
            if (contact) {
              const oldVal = (contact as any)[field.crm_column];
              if (String(oldVal) !== String(newVal)) {
                await supabaseAdmin.from("contacts").update({ [field.crm_column]: newVal }).eq("id", contact.id);
                auditEntries.push({
                  response_id: response!.id, company_id: companyId,
                  field_key: field.field_key, field_label: field.label,
                  old_value: String(oldVal ?? ""), new_value: String(newVal)
                });
              }
            }
          } else if (field.crm_table === "custom_field_values" && field.crm_field_id) {
            const { data: existing } = await supabaseAdmin.from("custom_field_values").select("*").eq("company_id", companyId).eq("field_id", field.crm_field_id).maybeSingle();
            const oldVal = existing?.text_value || existing?.number_value || "";
            if (existing) {
              await supabaseAdmin.from("custom_field_values").update({ text_value: String(newVal) }).eq("id", existing.id);
            } else {
              await supabaseAdmin.from("custom_field_values").insert({ company_id: companyId, field_id: field.crm_field_id, text_value: String(newVal) });
            }
            auditEntries.push({
              response_id: response!.id, company_id: companyId,
              field_key: field.field_key, field_label: field.label,
              old_value: String(oldVal), new_value: String(newVal)
            });
          }
        }

        if (Object.keys(companyUpdates).length > 0) {
          await supabaseAdmin.from("companies").update(companyUpdates).eq("id", companyId);
        }
        if (auditEntries.length > 0) {
          await supabaseAdmin.from("external_form_audit_log").insert(auditEntries);
        }

        // Mark response as applied
        await supabaseAdmin.from("external_form_responses").update({ status: "applied" }).eq("id", response!.id);
      }

      // Pipeline linking: add or move company to linked stage
      if (companyId && form.linked_offer_id && form.linked_stage_id) {
        const { data: existingEntry } = await supabaseAdmin.from("pipeline_entries")
          .select("id")
          .eq("company_id", companyId)
          .eq("offer_id", form.linked_offer_id)
          .maybeSingle();

        if (existingEntry) {
          await supabaseAdmin.from("pipeline_entries")
            .update({ stage_id: form.linked_stage_id })
            .eq("id", existingEntry.id);
        } else {
          await supabaseAdmin.from("pipeline_entries").insert({
            company_id: companyId,
            offer_id: form.linked_offer_id,
            stage_id: form.linked_stage_id,
            notes: `Agregado automáticamente desde formulario: ${form.name}`
          });
        }
      }

      // Update stats
      await supabaseAdmin.from("external_forms").update({
        submitted_count: (form.submitted_count || 0) + 1,
        completed_count: (form.completed_count || 0) + 1
      }).eq("id", form_id);

      // Log to company_history
      if (companyId) {
        const { data: fields } = await supabaseAdmin.from("external_form_fields").select("field_key, label").eq("form_id", form_id);
        const fieldsUpdated = (fields || []).filter(f => response_data[f.field_key] !== undefined).map(f => f.label);
        // If user picked a currency for sales, add it to the summary
        const currencyKeys = Object.keys(response_data).filter(k => k.endsWith("_currency") && response_data[k]);
        for (const ck of currencyKeys) {
          const val = response_data[ck];
          if (val) fieldsUpdated.push(`Moneda: ${val}`);
        }
        const eventType = form.form_type === "creation" ? "form_creation" : "form_submission";
        const description = fieldsUpdated.length > 0
          ? `Campos: ${fieldsUpdated.slice(0, 6).join(", ")}${fieldsUpdated.length > 6 ? ` (+${fieldsUpdated.length - 6})` : ""}`
          : "";

        await supabaseAdmin.from("company_history").insert({
          company_id: companyId,
          event_type: eventType,
          title: `Formulario: ${form.name}`,
          description,
          metadata: { form_id: form.id, form_name: form.name, fields_updated: fieldsUpdated, created_by_user: form.created_by },
          performed_by: form.created_by || null,
        });
      }

      return jsonRes({ success: true, response_id: response!.id });
    }

    return jsonRes({ error: "Acción no válida" }, 400);

  } catch (e: any) {
    console.error("form-verify error:", e);
    return jsonRes({ error: e.message || "Error interno" }, 500);
  }
});
