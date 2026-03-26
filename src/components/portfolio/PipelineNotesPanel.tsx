import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/contexts/ProfileContext';
import { useCRM } from '@/contexts/CRMContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StickyNote, Plus, Trash2, X, Pencil, Check, Building2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { showError } from '@/lib/toast';

interface PipelineNote {
  id: string;
  content: string;
  created_by: string | null;
  created_at: string;
  company_id: string | null;
}

interface Props {
  offerId: string;
  open: boolean;
  onClose: () => void;
}

export default function PipelineNotesPanel({ offerId, open, onClose }: Props) {
  const { session } = useAuth();
  const { allProfiles } = useProfile();
  const { companies } = useCRM();
  const [notes, setNotes] = useState<PipelineNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('none');
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editCompanyId, setEditCompanyId] = useState<string>('none');

  const profileMap = new Map(allProfiles.map(p => [p.userId, p.name || 'Sin nombre']));
  const companyMap = useMemo(() => new Map(companies.map(c => [c.id, c.tradeName])), [companies]);

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
      company_id: selectedCompanyId === 'none' ? null : selectedCompanyId,
    });
    if (error) {
      showError('Error al guardar nota');
    } else {
      setNewNote('');
      setSelectedCompanyId('none');
      await fetchNotes();
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from('pipeline_notes').delete().eq('id', id);
    setNotes(prev => prev.filter(n => n.id !== id));
  };

  const handleStartEdit = (note: PipelineNote) => {
    setEditingId(note.id);
    setEditContent(note.content);
    setEditCompanyId(note.company_id || 'none');
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editContent.trim()) return;
    const { error } = await supabase.from('pipeline_notes').update({
      content: editContent.trim(),
      company_id: editCompanyId === 'none' ? null : editCompanyId,
    }).eq('id', editingId);
    if (error) {
      showError('Error al actualizar nota');
    } else {
      setEditingId(null);
      await fetchNotes();
    }
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
            <div className="space-y-2">
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
              <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                <SelectTrigger className="h-8 text-xs w-full max-w-xs">
                  <div className="flex items-center gap-1.5">
                    <Building2 className="h-3 w-3 text-muted-foreground" />
                    <SelectValue placeholder="Anclar a empresa (opcional)" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin anclar</SelectItem>
                  {companies.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.tradeName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Notes list */}
            <ScrollArea className="max-h-[250px]">
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
                        {editingId === note.id ? (
                          <div className="space-y-2">
                            <Textarea
                              value={editContent}
                              onChange={e => setEditContent(e.target.value)}
                              className="min-h-[50px] text-sm resize-none"
                              autoFocus
                            />
                            <Select value={editCompanyId} onValueChange={setEditCompanyId}>
                              <SelectTrigger className="h-7 text-xs w-full max-w-[200px]">
                                <SelectValue placeholder="Anclar a empresa" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Sin anclar</SelectItem>
                                {companies.map(c => (
                                  <SelectItem key={c.id} value={c.id}>{c.tradeName}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="flex gap-1">
                              <Button size="sm" variant="default" className="h-6 text-xs gap-1 px-2" onClick={handleSaveEdit}>
                                <Check className="h-3 w-3" /> Guardar
                              </Button>
                              <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setEditingId(null)}>
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="text-sm whitespace-pre-wrap break-words">{note.content}</p>
                            {note.company_id && companyMap.get(note.company_id) && (
                              <div className="flex items-center gap-1 mt-1">
                                <Building2 className="h-3 w-3 text-primary/70" />
                                <span className="text-[10px] font-medium text-primary/70">{companyMap.get(note.company_id)}</span>
                              </div>
                            )}
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {profileMap.get(note.created_by || '') || 'Desconocido'} · {format(new Date(note.created_at), "d MMM yyyy, HH:mm", { locale: es })}
                            </p>
                          </>
                        )}
                      </div>
                      {editingId !== note.id && (
                        <div className="flex flex-col gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-all">
                          <button
                            onClick={() => handleStartEdit(note)}
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(note.id)}
                            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
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
