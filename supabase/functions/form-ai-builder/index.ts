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

const tools = [
  {
    type: 'function',
    function: {
      name: 'set_form_meta',
      description: 'Actualiza metadatos del formulario.',
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
      description: 'Agrega al formulario un campo que YA existe en el catálogo CRM. Usa field_key exacto del catálogo.',
      parameters: {
        type: 'object',
        properties: {
          field_key: { type: 'string' },
          is_required: { type: 'boolean' },
          is_visible: { type: 'boolean' },
          preload_from_crm: { type: 'boolean' },
          only_for_new: { type: 'boolean' },
          help_text: { type: 'string' },
          condition_field_key: { type: ['string', 'null'] },
          condition_value: { type: ['string', 'null'] },
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
      description: 'Modifica propiedades de un campo ya en el formulario.',
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
          condition_field_key: { type: ['string', 'null'] },
          condition_value: { type: ['string', 'null'] },
          group_name: { type: 'string', description: 'Renombrar el agrupador visual del campo (texto libre, no toca CRM)' },
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
      description: 'Reordena campos del formulario. Recibe lista completa de field_keys en nuevo orden.',
      parameters: {
        type: 'object',
        properties: { field_keys: { type: 'array', items: { type: 'string' } } },
        required: ['field_keys'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'move_field',
      description: 'Mueve un campo a una posición relativa a otro campo.',
      parameters: {
        type: 'object',
        properties: {
          field_key: { type: 'string' },
          position: { type: 'string', enum: ['before', 'after', 'start', 'end'] },
          reference_field_key: { type: ['string', 'null'] },
        },
        required: ['field_key', 'position'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_form_only_field',
      description: 'AUTO (no requiere aprobación). Agrega una pregunta SOLO para el formulario, NO se guarda en el CRM. Usa esto para metadatos del formulario, comentarios, preguntas auxiliares. group_name es opcional y solo agrupa visualmente en el form público.',
      parameters: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          field_type: {
            type: 'string',
            enum: ['short_text', 'long_text', 'number', 'email', 'phone', 'select', 'multiselect', 'date', 'checkbox', 'url'],
          },
          options: { type: 'array', items: { type: 'string' } },
          group_name: { type: 'string', description: 'Texto libre para agrupar visualmente. NO crea sección CRM.' },
          is_required: { type: 'boolean' },
          help_text: { type: 'string' },
          condition_field_key: { type: ['string', 'null'] },
          condition_value: { type: ['string', 'null'] },
        },
        required: ['label', 'field_type'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_new_section',
      description: 'PROPONE crear una nueva sección. SIEMPRE se crea en custom_sections del CRM y aparece como pestaña en el perfil de empresas. Requiere aprobación del usuario.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['name'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_new_crm_field',
      description: 'PROPONE crear un campo NUEVO que se almacene en el CRM dentro de una sección. El campo aparecerá en el perfil de la empresa Y en el formulario. target_section_name DEBE ser una sección existente o una propuesta en el mismo turno con propose_new_section. Requiere aprobación.',
      parameters: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          field_type: {
            type: 'string',
            enum: ['short_text', 'long_text', 'number', 'select'],
            description: 'Tipos soportados por el CRM custom_fields',
          },
          options: { type: 'array', items: { type: 'string' } },
          target_section_name: { type: 'string', description: 'Nombre de la sección CRM destino' },
          is_required: { type: 'boolean' },
          help_text: { type: 'string' },
          condition_field_key: { type: ['string', 'null'] },
          condition_value: { type: ['string', 'null'] },
          reason: { type: 'string' },
        },
        required: ['label', 'field_type', 'target_section_name'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_field',
      description: 'Quita un campo del formulario. Si el campo es CRM (crm_table != null) requiere aprobación y NO borra el campo del CRM, solo lo quita del formulario. Si es solo formulario, se aplica auto.',
      parameters: {
        type: 'object',
        properties: {
          field_key: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['field_key'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'promote_field_to_crm',
      description: 'PROPONE convertir un campo solo-formulario en un campo del CRM dentro de una sección. Requiere aprobación.',
      parameters: {
        type: 'object',
        properties: {
          field_key: { type: 'string' },
          target_section_name: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['field_key', 'target_section_name'],
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
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const {
      messages = [], currentForm, currentPages = [], currentFields = [],
      crmCatalog = [], existingSections = [], formGroups = [],
    } = body;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY no configurado');

    const enrichedFields = currentFields.map((f: any) => ({
      field_key: f.field_key,
      label: f.label,
      type: f.field_type,
      required: f.is_required,
      visible: f.is_visible,
      group: f.section_name || null,
      origin: f.crm_field_id ? 'crm_custom_field'
        : (f.crm_table === 'companies' || f.crm_table === 'contacts') ? 'crm_native'
        : 'form_only',
      crm_section: f.crm_section_name || null,
      condition: f.condition_field_key ? `${f.condition_field_key}=${f.condition_value}` : null,
    }));

    const systemPrompt = `Eres un constructor de formularios externos conectados a un CRM. Usas HERRAMIENTAS (function calling) para hacer cambios. NUNCA respondas con JSON suelto.

# MODELO MENTAL (memorízalo)

Cada pregunta del formulario tiene UN ORIGEN:
- **crm_native**: campo nativo de la tabla companies/contacts (NIT, razón social, ciudad...). Existe en el catálogo. Usa add_existing_crm_field.
- **crm_custom_field**: campo personalizado del CRM dentro de una sección (custom_sections). Existe en el catálogo. Usa add_existing_crm_field.
- **form_only**: pregunta auxiliar que NO se guarda en el CRM, solo en las respuestas del formulario. Usa add_form_only_field.

# REGLAS DURAS

1. **Las SECCIONES son SIEMPRE del CRM.** No existen "agrupadores visuales aparte". Si propones una sección, se crea en custom_sections y aparece como pestaña en el perfil de TODAS las empresas. Usa propose_new_section.
2. **Para crear un campo nuevo en una sección CRM**: usa propose_new_crm_field con target_section_name. Si la sección no existe, propónla en el MISMO turno con propose_new_section.
3. **Para preguntas auxiliares del formulario** (¿cómo te enteraste?, comentarios, encuesta de satisfacción): usa add_form_only_field. Es AUTO, no requiere aprobación.
4. **NUNCA inventes field_keys**. Si quieres un campo CRM ya existente, búscalo en el catálogo y usa su field_key exacto. Si necesitas algo que no existe en el CRM, usa propose_new_crm_field.
5. **Aprobaciones**: propose_new_section, propose_new_crm_field, promote_field_to_crm y delete_field (cuando es CRM) REQUIEREN aprobación. Todo lo demás es AUTO.
6. **Condicionales**: usa condition_field_key + condition_value. El padre debe ser select/checkbox/multiselect.
7. **Puedes ejecutar varias tools en un mismo turno** (ej: 1 propose_new_section + 3 propose_new_crm_field + 2 add_existing_crm_field + 1 reorder_fields).
8. **Tras ejecutar tools**, escribe un mensaje breve en español confirmando qué hiciste, separando claramente "✓ Aplicado" vs "⏳ Pendiente de tu aprobación".

# CATÁLOGO CRM (field_key → label, tipo, sección)
${crmCatalog.map((c: any) => `- ${c.field_key} → ${c.label} (${c.field_type}${c.section ? `, sección CRM: ${c.section}` : ''})`).join('\n')}

# SECCIONES CRM EXISTENTES
${existingSections.map((s: any) => `- "${s.name}"`).join('\n') || '(ninguna todavía)'}

# AGRUPADORES VISUALES YA USADOS EN ESTE FORMULARIO
${formGroups.map((g: string) => `- "${g}"`).join('\n') || '(ninguno)'}

# ESTADO ACTUAL
Meta: ${JSON.stringify(currentForm)}
Páginas (${currentPages.length}): ${JSON.stringify(currentPages.map((p: any) => ({ id: p.id, title: p.title })))}
Campos (${currentFields.length}): ${JSON.stringify(enrichedFields)}

# EJEMPLOS

Usuario: "Agrega NIT, razón social y email obligatorios"
→ add_existing_crm_field(companies_nit, is_required=true) + add_existing_crm_field(companies_legal_name, is_required=true) + add_existing_crm_field(contacts_email, is_required=true)

Usuario: "Crea una sección Información General con número de empleados y antigüedad"
→ propose_new_section('Información General') + propose_new_crm_field(label='Número de empleados', field_type='number', target_section_name='Información General') + propose_new_crm_field(label='Antigüedad de la empresa (años)', field_type='number', target_section_name='Información General')

Usuario: "Agrega una pregunta opcional: ¿cómo te enteraste de nosotros?"
→ add_form_only_field(label='¿Cómo te enteraste de nosotros?', field_type='short_text')  (sin sección CRM, no requiere aprobación)

Usuario: "Pasa la pregunta de antigüedad al CRM en la sección Información General"
→ promote_field_to_crm(field_key='antiguedad_de_la_empresa', target_section_name='Información General')

Usuario: "Elimina la pregunta de hitos"
→ delete_field(field_key='hitos_alcanzados_como_empresa')`;

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

    console.log('[form-ai-builder] tool_calls:', JSON.stringify(toolCalls.map((tc: any) => ({ name: tc.function?.name, args: tc.function?.arguments }))));

    const autoChanges: any[] = [];
    const pendingProposals: any[] = [];
    const catalogKeys = new Set((crmCatalog || []).map((c: any) => c.field_key));
    const existingSectionNames = new Set((existingSections || []).map((s: any) => s.name.toLowerCase()));
    const proposedSectionNamesThisTurn = new Set<string>();

    // First pass: collect proposed section names for cross-validation
    for (const tc of toolCalls) {
      if (tc.function?.name === 'propose_new_section') {
        try {
          const a = JSON.parse(tc.function?.arguments || '{}');
          if (a.name) proposedSectionNamesThisTurn.add(String(a.name).toLowerCase());
        } catch { /* ignore */ }
      }
    }

    const fieldOriginByKey: Record<string, string> = {};
    for (const f of currentFields) {
      fieldOriginByKey[f.field_key] = f.crm_field_id ? 'crm_custom_field'
        : (f.crm_table === 'companies' || f.crm_table === 'contacts') ? 'crm_native'
        : 'form_only';
    }

    for (const tc of toolCalls) {
      const name = tc.function?.name;
      let args: any = {};
      try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { /* ignore */ }

      if (name === 'propose_new_section') {
        pendingProposals.push({ id: tc.id, type: name, args });
      } else if (name === 'propose_new_crm_field') {
        const targetLower = String(args.target_section_name || '').toLowerCase();
        if (!targetLower) {
          continue; // skip silently, schema requires it
        }
        const sectionWillExist = existingSectionNames.has(targetLower) || proposedSectionNamesThisTurn.has(targetLower);
        if (!sectionWillExist) {
          // Auto-add a section proposal so the field has a destination
          if (!proposedSectionNamesThisTurn.has(targetLower)) {
            pendingProposals.push({
              id: `auto-section-${tc.id}`,
              type: 'propose_new_section',
              args: {
                name: args.target_section_name,
                reason: `Necesaria para alojar el campo "${args.label}".`,
              },
            });
            proposedSectionNamesThisTurn.add(targetLower);
          }
        }
        pendingProposals.push({ id: tc.id, type: name, args });
      } else if (name === 'promote_field_to_crm') {
        pendingProposals.push({ id: tc.id, type: name, args });
      } else if (name === 'delete_field') {
        const origin = fieldOriginByKey[args.field_key];
        if (origin === 'crm_native' || origin === 'crm_custom_field') {
          pendingProposals.push({ id: tc.id, type: name, args: { ...args, _origin: origin } });
        } else {
          autoChanges.push({ id: tc.id, type: name, args });
        }
      } else if (name === 'add_existing_crm_field' && args?.field_key && !catalogKeys.has(args.field_key)) {
        // Sanitize: AI invented a field_key. Decide intent: if it had crm_ prefix, treat as CRM proposal
        const looksLikeCrm = /^(companies_|contacts_|custom_)/.test(args.field_key);
        const inferredLabel = String(args.field_key)
          .replace(/^companies_|^contacts_|^custom_/, '')
          .replace(/_/g, ' ')
          .replace(/^./, (c: string) => c.toUpperCase());
        if (looksLikeCrm) {
          pendingProposals.push({
            id: tc.id,
            type: 'propose_new_crm_field',
            args: {
              label: inferredLabel,
              field_type: 'short_text',
              target_section_name: 'General',
              help_text: args.help_text || '',
              is_required: !!args.is_required,
              reason: `La IA quiso agregar "${args.field_key}", pero ese campo no existe. Confírmalo para crearlo en el CRM.`,
            },
          });
          if (!existingSectionNames.has('general') && !proposedSectionNamesThisTurn.has('general')) {
            pendingProposals.push({
              id: `auto-section-${tc.id}`,
              type: 'propose_new_section',
              args: { name: 'General', reason: 'Sección por defecto para campos sin sección explícita.' },
            });
            proposedSectionNamesThisTurn.add('general');
          }
        } else {
          autoChanges.push({
            id: tc.id,
            type: 'add_form_only_field',
            args: {
              label: inferredLabel,
              field_type: 'short_text',
              help_text: args.help_text || '',
              is_required: !!args.is_required,
            },
          });
        }
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
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
