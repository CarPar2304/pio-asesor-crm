import { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/lib/toast';
import type { CRMCatalogEntry } from '@/lib/formAICatalog';

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  proposals?: PendingProposal[];
}

export interface AutoChange {
  id: string;
  type: string;
  args: any;
}

export interface PendingProposal {
  id: string;
  type: 'propose_new_section' | 'propose_new_crm_field' | 'promote_field_to_crm' | 'delete_field';
  args: any;
  resolved?: 'accepted' | 'rejected';
}

interface Props {
  formId?: string | null;
  currentForm: any;
  currentPages: any[];
  currentFields: any[];
  crmCatalog: CRMCatalogEntry[];
  existingSections: { id: string; name: string }[];
  onAutoChanges: (changes: AutoChange[]) => void;
  onAcceptProposal: (proposal: PendingProposal) => void | Promise<void>;
}

const storageKey = (formId?: string | null) => `form-ai-chat-${formId || 'new'}`;

export default function FormAIBuilderChat({
  formId, currentForm, currentPages, currentFields, crmCatalog,
  onAutoChanges, onAcceptProposal,
}: Props) {
  const [messages, setMessages] = useState<ChatMsg[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey(formId));
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reload history when formId changes
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(formId));
      setMessages(raw ? JSON.parse(raw) : []);
    } catch { setMessages([]); }
  }, [formId]);

  // Persist messages
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(formId), JSON.stringify(messages));
    } catch { /* ignore quota */ }
  }, [messages, formId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    const newMessages: ChatMsg[] = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const apiMessages = newMessages.map(m => ({ role: m.role, content: m.content }));
      const { data, error } = await supabase.functions.invoke('form-ai-builder', {
        body: {
          messages: apiMessages,
          currentForm,
          currentPages,
          currentFields,
          crmCatalog,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const proposals: PendingProposal[] = (data.pendingProposals || []).map((p: any) => ({ ...p }));
      const autoChanges: AutoChange[] = data.autoChanges || [];

      console.log('[AI Builder] respuesta:', { autoChanges, proposals, assistantMessage: data.assistantMessage });

      if (autoChanges.length > 0) onAutoChanges(autoChanges);

      const noActions = autoChanges.length === 0 && proposals.length === 0;
      const fallback = noActions
        ? (data.assistantMessage || 'No realicé cambios. ¿Puedes ser más específico?')
        : (data.assistantMessage || 'Listo.');

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: fallback,
        proposals: proposals.length > 0 ? proposals : undefined,
      }]);
    } catch (e: any) {
      console.error(e);
      showError('Error', e.message || 'No se pudo contactar la IA');
      setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Hubo un error procesando tu solicitud.' }]);
    } finally {
      setLoading(false);
    }
  };

  const resolveProposal = async (msgIdx: number, propIdx: number, decision: 'accepted' | 'rejected') => {
    const msg = messages[msgIdx];
    const prop = msg.proposals?.[propIdx];
    if (!prop || prop.resolved) return;

    if (decision === 'accepted') {
      await onAcceptProposal(prop);
    }
    setMessages(prev => prev.map((m, i) => {
      if (i !== msgIdx) return m;
      return {
        ...m,
        proposals: m.proposals?.map((p, j) => j === propIdx ? { ...p, resolved: decision } : p),
      };
    }));
  };

  return (
    <div className="rounded-md border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-purple-500/5 overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between p-3 hover:bg-primary/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Construir formulario con IA</span>
          {messages.length > 0 && (
            <Badge variant="secondary" className="h-5 text-[10px]">{messages.length} mensajes</Badge>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground">{collapsed ? 'Mostrar' : 'Ocultar'}</span>
      </button>

      {!collapsed && (
        <div className="border-t border-primary/20">
          <div ref={scrollRef} className="max-h-72 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <p className="text-[11px] text-muted-foreground italic text-center py-4">
                Pide cambios en lenguaje natural. Ej: "Agrega NIT, nombre comercial y email obligatorios" o "Haz que el campo ciudad solo sea visible si la categoría es Startup".
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cn(
                  'max-w-[85%] rounded-lg px-3 py-2 text-xs',
                  m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-background border'
                )}>
                  {m.role === 'assistant' ? (
                    <div className="prose prose-xs max-w-none [&_p]:my-1 [&_ul]:my-1 [&_li]:my-0">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  )}

                  {m.proposals && m.proposals.length > 0 && (
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                        <span>⚠</span> Requiere tu autorización.
                      </div>
                      {m.proposals.map((p, j) => {
                        let headline = '';
                        let titleText = '';
                        if (p.type === 'propose_new_section') {
                          headline = '📁 Nueva sección en el CRM';
                          titleText = `«${p.args.name}» — aparecerá como pestaña en el perfil de TODAS las empresas`;
                        } else if (p.type === 'propose_new_crm_field') {
                          headline = '➕ Nuevo campo CRM';
                          titleText = `«${p.args.label}» en sección «${p.args.target_section_name}» — quedará visible en el perfil`;
                        } else if (p.type === 'promote_field_to_crm') {
                          headline = '↗ Promover al CRM';
                          titleText = `«${p.args.field_key}» → sección «${p.args.target_section_name}»`;
                        } else if (p.type === 'delete_field') {
                          headline = '🗑 Quitar del formulario (campo CRM)';
                          titleText = `«${p.args.field_key}» — solo se quita del formulario, NO se borra del CRM`;
                        }
                        return (
                        <div key={p.id} className={cn(
                          'rounded-md border-2 p-3 text-[11px] bg-amber-50 border-amber-400 shadow-sm',
                          p.resolved === 'accepted' && 'bg-emerald-50 border-emerald-400',
                          p.resolved === 'rejected' && 'opacity-60 line-through bg-muted/50 border-muted'
                        )}>
                          <div className="font-semibold text-foreground mb-1 text-[12px]">{headline}</div>
                          <div className="text-foreground mb-1">{titleText}</div>
                          {p.args.field_type && <div className="text-muted-foreground text-[10px]">tipo: {p.args.field_type}</div>}
                          {p.args.reason && <p className="text-muted-foreground italic mb-2 mt-1">{p.args.reason}</p>}
                          {!p.resolved && (
                            <div className="flex gap-2 mt-2">
                              <Button size="sm" className="h-7 text-[11px] px-3 bg-amber-600 hover:bg-amber-700 text-white" onClick={() => resolveProposal(i, j, 'accepted')}>
                                <Check className="h-3 w-3 mr-1" /> Aceptar
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-[11px] px-3" onClick={() => resolveProposal(i, j, 'rejected')}>
                                <X className="h-3 w-3 mr-1" /> Rechazar
                              </Button>
                            </div>
                          )}
                          {p.resolved === 'accepted' && <div className="text-emerald-700 text-[11px] font-medium mt-1">✓ Aplicado</div>}
                          {p.resolved === 'rejected' && <div className="text-muted-foreground text-[11px] mt-1">✗ Rechazado</div>}
                        </div>
                      );})}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-background border rounded-lg px-3 py-2 text-xs flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Pensando…
                </div>
              </div>
            )}
          </div>

          <div className="border-t p-2 flex gap-2 bg-background/60">
            <Textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Describe lo que quieres construir o ajustar…"
              rows={1}
              className="resize-none text-xs min-h-[36px]"
              disabled={loading}
            />
            <Button size="sm" onClick={send} disabled={loading || !input.trim()}>
              <Send className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
