import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/contexts/ProfileContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StickyNote, Plus, Trash2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from '@/lib/toast';

interface PipelineNote {
  id: string;
  content: string;
  created_by: string | null;
  created_at: string;
}

interface Props {
  offerId: string;
  open: boolean;
  onClose: () => void;
}

export default function PipelineNotesPanel({ offerId, open, onClose }: Props) {
  const { session } = useAuth();
  const { allProfiles } = useProfile();
  const [notes, setNotes] = useState<PipelineNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [loading, setLoading] = useState(false);

  const profileMap = new Map(allProfiles.map(p => [p.userId, p.name || 'Sin nombre']));

  const fetchNotes = async () => {
    const { data } = await supabase
      .from('pipeline_notes')
      .select('*')
      .eq('offer_id', offerId)
      .order('created_at', { ascending: false });
    if (data) setNotes(data);
  };

  useEffect(() => {
    if (open) fetchNotes();
  }, [open, offerId]);

  const handleAdd = async () => {
    if (!newNote.trim() || !session?.user?.id) return;
    setLoading(true);
    const { error } = await supabase.from('pipeline_notes').insert({
      offer_id: offerId,
      content: newNote.trim(),
      created_by: session.user.id,
    });
    if (error) {
      toast.error('Error al guardar nota');
    } else {
      setNewNote('');
      await fetchNotes();
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from('pipeline_notes').delete().eq('id', id);
    setNotes(prev => prev.filter(n => n.id !== id));
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.96 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="rounded-xl border border-border/60 bg-card shadow-lg mb-4 overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
            <div className="flex items-center gap-2">
              <StickyNote className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Notas del pipeline</h3>
              <span className="text-xs text-muted-foreground">({notes.length})</span>
            </div>
            <button onClick={onClose} className="rounded-md p-1 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-4 space-y-3">
            {/* New note input */}
            <div className="flex gap-2">
              <Textarea
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                placeholder="Escribe una nota..."
                className="min-h-[60px] text-sm resize-none"
                onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleAdd(); }}
              />
              <Button size="sm" onClick={handleAdd} disabled={loading || !newNote.trim()} className="shrink-0 gap-1">
                <Plus className="h-3.5 w-3.5" /> Agregar
              </Button>
            </div>

            {/* Notes list */}
            <ScrollArea className="max-h-[200px]">
              <div className="space-y-2 pr-2">
                <AnimatePresence mode="popLayout">
                  {notes.map(note => (
                    <motion.div
                      key={note.id}
                      layout
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 8 }}
                      className="group flex gap-2 rounded-lg border border-border/40 bg-background p-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm whitespace-pre-wrap break-words">{note.content}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {profileMap.get(note.created_by || '') || 'Desconocido'} · {format(new Date(note.created_at), "d MMM yyyy, HH:mm", { locale: es })}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDelete(note.id)}
                        className="shrink-0 rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {notes.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">Sin notas aún</p>
                )}
              </div>
            </ScrollArea>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
