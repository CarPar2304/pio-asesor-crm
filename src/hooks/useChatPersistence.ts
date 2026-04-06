import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type Msg = { role: 'user' | 'assistant'; content: string };
export type Conversation = { id: string; title: string; updatedAt: string };

export function useChatPersistence() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);

  // Load conversation list
  const loadConversations = useCallback(async () => {
    setLoadingConversations(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoadingConversations(false); return; }

    const { data } = await supabase
      .from('chat_conversations')
      .select('id, title, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(50);

    setConversations((data || []).map(c => ({ id: c.id, title: c.title, updatedAt: c.updated_at })));
    setLoadingConversations(false);
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Load messages for a conversation
  const loadMessages = useCallback(async (conversationId: string) => {
    setActiveConversationId(conversationId);
    const { data } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    setMessages((data || []).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })));
  }, []);

  // Create new conversation
  const createConversation = useCallback(async (firstMessage: string): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const title = firstMessage.slice(0, 60) + (firstMessage.length > 60 ? '…' : '');
    const { data, error } = await supabase
      .from('chat_conversations')
      .insert({ user_id: user.id, title })
      .select('id')
      .single();

    if (error || !data) return null;
    setActiveConversationId(data.id);
    setConversations(prev => [{ id: data.id, title, updatedAt: new Date().toISOString() }, ...prev]);
    return data.id;
  }, []);

  // Save a message to DB
  const saveMessage = useCallback(async (conversationId: string, role: 'user' | 'assistant', content: string) => {
    await supabase.from('chat_messages').insert({ conversation_id: conversationId, role, content });
    // Update conversation timestamp & title if it's the first user message
    await supabase.from('chat_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
  }, []);

  // Delete a conversation
  const deleteConversation = useCallback(async (conversationId: string) => {
    await supabase.from('chat_conversations').delete().eq('id', conversationId);
    setConversations(prev => prev.filter(c => c.id !== conversationId));
    if (activeConversationId === conversationId) {
      setActiveConversationId(null);
      setMessages([]);
    }
  }, [activeConversationId]);

  // Start new chat
  const startNewChat = useCallback(() => {
    setActiveConversationId(null);
    setMessages([]);
  }, []);

  return {
    conversations,
    activeConversationId,
    messages,
    setMessages,
    loadingConversations,
    loadConversations,
    loadMessages,
    createConversation,
    saveMessage,
    deleteConversation,
    startNewChat,
  };
}
