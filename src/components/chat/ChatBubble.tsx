import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { MessageCircle, X, Send, Trash2, Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useChatPersistence } from '@/hooks/useChatPersistence';
import type { Msg } from '@/hooks/useChatPersistence';
import { supabase } from '@/integrations/supabase/client';
import { useCRM } from '@/contexts/CRMContext';
import ChatMessageList from './ChatMessageList';
import ConversationList from './ConversationList';

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/company-chat`;

export default function ChatBubble() {
  const [open, setOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    conversations, activeConversationId, messages, setMessages,
    loadingConversations, loadMessages, createConversation,
    saveMessage, deleteConversation, startNewChat,
  } = useChatPersistence();
  const { refresh: refreshCRM } = useCRM();
  const location = useLocation();

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const streamChat = useCallback(async (allMessages: Msg[], conversationId: string) => {
    setIsLoading(true);
    let assistantSoFar = '';

    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant') {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: 'assistant', content: assistantSoFar }];
      });
    };

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Tu sesión expiró. Vuelve a iniciar sesión para usar el chat.');
      }

      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ messages: allMessages, conversation_id: conversationId }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${resp.status}`);
      }

      if (!resp.body) throw new Error('No stream body');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) upsertAssistant(content);
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      // Save assistant message to DB
      if (assistantSoFar) {
        await saveMessage(conversationId, 'assistant', assistantSoFar);
      }

      // If the assistant confirmed any action, refresh CRM data so dashboards (tasks, timeline, pipeline) show it
      if (/[✅⚠️]/.test(assistantSoFar)) {
        Promise.allSettled([refreshCRM()]).catch(() => {});
        window.dispatchEvent(new CustomEvent('company-chat-refresh'));
      }
    } catch (e) {
      console.error('Chat error:', e);
      upsertAssistant(`\n\n⚠️ Error: ${e instanceof Error ? e.message : 'Error desconocido'}`);
    } finally {
      setIsLoading(false);
    }
  }, [saveMessage, setMessages, refreshCRM]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Msg = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');

    let convId = activeConversationId;
    if (!convId) {
      convId = await createConversation(text);
      if (!convId) return;
    }

    await saveMessage(convId, 'user', text);
    streamChat(newMessages, convId);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSelectConversation = (id: string) => {
    loadMessages(id);
    if (!fullscreen) setShowSidebar(false);
  };

  const handleNewChat = () => {
    startNewChat();
    if (!fullscreen) setShowSidebar(false);
  };

  useEffect(() => {
    const onFocus = () => refreshCRM().catch(() => {});
    const onRefresh = () => refreshCRM().catch(() => {});
    window.addEventListener('focus', onFocus);
    window.addEventListener('company-chat-refresh', onRefresh as EventListener);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('company-chat-refresh', onRefresh as EventListener);
    };
  }, [refreshCRM, location.pathname]);

  const handleClearChat = () => {
    if (activeConversationId) {
      deleteConversation(activeConversationId);
    } else {
      setMessages([]);
    }
  };

  const toggleFullscreen = () => {
    setFullscreen(f => !f);
    if (!fullscreen) setShowSidebar(true);
    else setShowSidebar(false);
  };

  const panelClasses = fullscreen
    ? 'fixed inset-0 z-[60] flex flex-col bg-card animate-in fade-in duration-200'
    : 'fixed bottom-20 right-4 z-50 flex w-[380px] flex-col rounded-2xl border border-border bg-card shadow-2xl animate-in slide-in-from-bottom-4 fade-in duration-200';

  return (
    <>
      {/* Backdrop blur for fullscreen */}
      {open && fullscreen && (
        <div className="fixed inset-0 z-[59] bg-background/80 backdrop-blur-sm" onClick={() => setFullscreen(false)} />
      )}

      {open && (
        <div className={panelClasses} style={fullscreen ? undefined : { height: 'min(520px, calc(100vh - 120px))' }}>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
            <div className="flex items-center gap-2">
              {fullscreen && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowSidebar(s => !s)}>
                  {showSidebar ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
                </Button>
              )}
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                <MessageCircle className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold leading-none">Company Chat</p>
                <p className="text-[10px] text-muted-foreground">Asistente de empresas con IA</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {!fullscreen && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowSidebar(s => !s)} title="Historial">
                  {showSidebar ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
                </Button>
              )}
              {messages.length > 0 && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleClearChat} title="Limpiar chat">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleFullscreen} title={fullscreen ? 'Minimizar' : 'Pantalla completa'}>
                {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setOpen(false); setFullscreen(false); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Body */}
          <div className="flex flex-1 min-h-0">
            {/* Sidebar */}
            {showSidebar && (
              <div className={cn('shrink-0', fullscreen ? 'w-64' : 'w-52')}>
                <ConversationList
                  conversations={conversations}
                  activeId={activeConversationId}
                  loading={loadingConversations}
                  onSelect={handleSelectConversation}
                  onNew={handleNewChat}
                  onDelete={deleteConversation}
                />
              </div>
            )}

            {/* Chat area */}
            <div className="flex flex-col flex-1 min-w-0">
              <ChatMessageList ref={scrollRef} messages={messages} isLoading={isLoading} />

              {/* Input */}
              <div className="border-t border-border p-3 shrink-0">
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Pregunta sobre las empresas..."
                    className="flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[36px] max-h-[100px]"
                    rows={1}
                    disabled={isLoading}
                  />
                  <Button
                    size="icon"
                    className="h-9 w-9 shrink-0 rounded-xl"
                    onClick={handleSend}
                    disabled={!input.trim() || isLoading}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating button */}
      {!fullscreen && (
        <button
          onClick={() => setOpen(!open)}
          className={cn(
            'fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all duration-200 hover:scale-105',
            open ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground'
          )}
        >
          {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
        </button>
      )}
    </>
  );
}
