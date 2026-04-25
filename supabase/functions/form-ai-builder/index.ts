import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
}

interface FormDraft {
  name: string;
  description: string;
  public_title: string;
  public_subtitle: string;
  success_message: string;
  submit_button_text: string;
}

interface PageDraft {
  id: string;
  title: string;
  description: string;
  display_order: number;
}

interface FieldDraft {
  label: string;
  field_key: string;
  field_type: string;
  placeholder: string;
  help_text: string;
  section_name: string;
  is_required: boolean;
  is_visible: boolean;
  is_editable: boolean;
  is_readonly: boolean;
  preload_from_crm: boolean;
  crm_table: string | null;
  crm_column: string | null;
  crm_field_id: string | null;
  options: string[];
  display_order: number;
  condition_field_key?: string | null;
  condition_value?: string | null;
  only_for_new?: boolean;
  page_id?: string | null;
  default_value?: string;
  default_value_editable?: boolean;
}

const tools = [
  {
    type: 'function',
    function: {
      name: 'set_form_meta',
      description: 'Actualiza metadatos del formulario (nombre, descripción, título y subtítulo público, mensaje de éxito, texto del botón de envío).',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          public_title: { type: 'string' },
          public_subtitle: { type: 'string' },
          success_message: { type: 'string' },
          submit_button_text: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_existing_crm_field',
      description: 'Agrega al formulario un campo que ya existe en el catálogo CRM. Usa field_key del catálogo (formato companies_<col>, contacts_<col> o custom_<id>).',
      parameters: {
        type: 'object',
        properties: {
          field_key: { type: 'string', description: 'Clave del catálogo CRM' },
          is_required: { type: 'boolean' },
          is_visible: { type: 'boolean' },
          preload_from_crm: { type: 'boolean' },
          only_for_new: { type: 'boolean' },
          page_id: { type: ['string', 'null'] },
          help_text: { type: 'string' },
        },
        required: ['field_key'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_field',
      description: 'Modifica propiedades de un campo ya existente en el formulario (identificado por field_key).',
      parameters: {
        type: 'object',
        properties: {
          field_key: { type: 'string' },
          label: { type: 'string' },
          placeholder: { type: 'string' },
          help_text: { type: 'string' },
          is_required: { type: 'boolean' },
          is_visible: { type: 'boolean' },
          is_editable: { type: 'boolean' },
          is_readonly: { type: 'boolean' },
          preload_from_crm: { type: 'boolean' },
          only_for_new: { type: 'boolean' },
          default_value: { type: 'string' },
          default_value_editable: { type: 'boolean' },
          condition_field_key: { type: ['string', 'null'], description: 'field_key de otro campo del que depende' },
          condition_value: { type: ['string', 'null'], description: 'Valor que debe tener el campo padre para mostrar este' },
          page_id: { type: ['string', 'null'] },
          section_name: { type: 'string' },
        },
        required: ['field_key'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reorder_fields',
      description: 'Reordena los campos del formulario. Recibe la lista completa de field_keys en el nuevo orden.',
      parameters: {
        type: 'object',
        properties: {
          field_keys: { type: 'array', items: { type: 'string' } },
        },
        required: ['field_keys'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_page',
      description: 'Agrega una nueva página/sección al formulario para agrupar campos.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['title'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_page',
      description: 'Modifica una página existente del formulario.',
      parameters: {
        type: 'object',
        properties: {
          page_id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['page_id'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_new_section',
      description: 'PROPONE crear una nueva sección en el CRM (requiere autorización del usuario, NO se aplica automáticamente).',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          reason: { type: 'string', description: 'Por qué es necesaria' },
        },
        required: ['name'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_new_free_field',
      description: 'PROPONE crear un campo libre nuevo en el formulario (requiere autorización). Se conecta al CRM como custom_field si el usuario aprueba.',
      parameters: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          field_type: {
            type: 'string',
            enum: ['short_text', 'long_text', 'number', 'email', 'phone', 'select', 'multiselect', 'date', 'checkbox', 'url'],
          },
          options: { type: 'array', items: { type: 'string' } },
          section_name: { type: 'string', description: 'Nombre de la sección CRM destino' },
          is_required: { type: 'boolean' },
          help_text: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['label', 'field_type'],
        additionalProperties: false,
      },
    },
  },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { messages = [], currentForm, currentPages = [], currentFields = [], crmCatalog = [] } = body;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY no configurado');

    const systemPrompt = `Eres un asistente experto en construcción de formularios externos para un CRM. Ayudas al usuario a crear y editar el formulario actual usando HERRAMIENTAS (function calling). NUNCA respondas con JSON suelto: usa siempre las tools.

REGLAS CRÍTICAS:
1. JAMÁS borres campos, secciones o páginas existentes. No tienes herramienta para hacerlo.
2. Si necesitas crear una sección NUEVA en el CRM o un campo LIBRE NUEVO (que no existe en el catálogo), usa propose_new_section / propose_new_free_field. Esos requieren AUTORIZACIÓN del usuario y NO se aplican automáticamente; explica brevemente por qué.
3. Para cualquier campo que ya exista en el catálogo CRM (lista más abajo), usa add_existing_crm_field con su field_key exacto. NO inventes field_keys.
4. Para modificar campos ya agregados al formulario (visibilidad, requerido, precarga, condicionales, default, mapeo a página/sección), usa update_field.
5. Las preguntas condicionales requieren un campo padre tipo select/checkbox/multiselect. Usa condition_field_key + condition_value.
6. Puedes ejecutar varias tools en un mismo turno si el usuario pide varios cambios.
7. Después de ejecutar tools, responde brevemente al usuario en español confirmando lo que hiciste (ej: "He agregado el campo NIT, marcado como obligatorio y precargado desde el CRM. También propuse una nueva sección 'Inversión'; necesito tu aprobación.").

CATÁLOGO CRM DISPONIBLE (field_key → label / tipo):
${crmCatalog.map((c: any) => `- ${c.field_key} → ${c.label} (${c.field_type}${c.section ? `, sección: ${c.section}` : ''})`).join('\n')}

ESTADO ACTUAL DEL FORMULARIO:
Meta: ${JSON.stringify(currentForm)}
Páginas (${currentPages.length}): ${JSON.stringify(currentPages.map((p: any) => ({ id: p.id, title: p.title })))}
Campos actuales (${currentFields.length}): ${JSON.stringify(currentFields.map((f: any) => ({ field_key: f.field_key, label: f.label, type: f.field_type, required: f.is_required, visible: f.is_visible, preload: f.preload_from_crm, condition: f.condition_field_key ? `${f.condition_field_key}=${f.condition_value}` : null })))}`;

    const aiMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-5-mini',
        messages: aiMessages,
        tools,
        tool_choice: 'auto',
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error('AI gateway error:', aiRes.status, t);
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: 'Demasiadas solicitudes, intenta en unos segundos.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: 'Sin créditos en Lovable AI. Agrega créditos en Settings → Workspace → Usage.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'Error del modelo de IA' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiRes.json();
    const choice = aiData.choices?.[0];
    const assistantMessage = choice?.message?.content || '';
    const toolCalls = choice?.message?.tool_calls || [];

    // Separar autoChanges (aplican directo) vs pendingProposals (requieren aprobación)
    const autoChanges: any[] = [];
    const pendingProposals: any[] = [];

    for (const tc of toolCalls) {
      const name = tc.function?.name;
      let args: any = {};
      try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { /* ignore */ }

      if (name === 'propose_new_section' || name === 'propose_new_free_field') {
        pendingProposals.push({ id: tc.id, type: name, args });
      } else {
        autoChanges.push({ id: tc.id, type: name, args });
      }
    }

    return new Response(
      JSON.stringify({
        assistantMessage: assistantMessage || (toolCalls.length > 0 ? 'Listo, apliqué los cambios solicitados.' : 'No se pudo generar una respuesta.'),
        autoChanges,
        pendingProposals,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('form-ai-builder error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
