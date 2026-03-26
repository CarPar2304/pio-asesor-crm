import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/contexts/ProfileContext';
import { useCRM } from '@/contexts/CRMContext';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { StickyNote, Plus, Trash2, X, Pencil, Check, Building2, Search, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { showError, showSuccess } from '@/lib/toast';

interface PipelineNote {
  id: string;
  content: string;
  created_by: string | null;
  created_at: string;
  company_id: string | null;
  stage_id: string | null;
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
  const { getStagesForOffer } = usePortfolio();
  const stages = getStagesForOffer(offerId);

  const [notes, setNotes] = useState<PipelineNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);
  const [selectedStageId, setSelectedStageId] = useState<string>('none');
  const [companySearch, setCompanySearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editCompanyId, setEditCompanyId] = useState<string>('none');
  const [editStageId, setEditStageId] = useState<string>('none');
  const [editCompanySearch, setEditCompanySearch] = useState('');

  const profileMap = new Map(allProfiles.map(p => [p.userId, p.name || 'Sin nombre']));
  const companyMap = useMemo(() => new Map(companies.map(c => [c.id, c.tradeName])), [companies]);
  const stageMap = useMemo(() => new Map(stages.map(s => [s.id, s.name])), [stages]);

  const filteredCompanies = useMemo(() => {
    const q = companySearch.trim().toLowerCase();
    if (!q) return companies.slice(0, 50);
    return companies.filter(c => c.tradeName.toLowerCase().includes(q) || c.legalName.toLowerCase().includes(q)).slice(0, 50);
  }, [companies, companySearch]);

  const editFilteredCompanies = useMemo(() => {
    const q = editCompanySearch.trim().toLowerCase();
    if (!q) return companies.slice(0, 50);
    return companies.filter(c => c.tradeName.toLowerCase().includes(q) || c.legalName.toLowerCase().includes(q)).slice(0, 50);
  }, [companies, editCompanySearch]);

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

  const toggleCompany = (id: string) => {
    setSelectedCompanyIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleAdd = async () => {
    if (!newNote.trim() || !session?.user?.id) return;
    setLoading(true);

    const companyIds = selectedCompanyIds.length > 0 ? selectedCompanyIds : [null];

    const rows = companyIds.map(cid => ({
      offer_id: offerId,
      content: newNote.trim(),
      created_by: session.user.id,
      company_id: cid,
      stage_id: selectedStageId === 'none' ? null : selectedStageId,
    }));

    const { error } = await supabase.from('pipeline_notes').insert(rows);
    if (error) {
      showError('Error al guardar nota');
    } else {
      setNewNote('');
      setSelectedCompanyIds([]);
      setSelectedStageId('none');
      showSuccess('Nota agregada', companyIds.length > 1 ? `Nota anclada a ${companyIds.length} empresas` : undefined);
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
    setEditStageId(note.stage_id || 'none');
    setEditCompanySearch('');
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editContent.trim()) return;
    const { error } = await supabase.from('pipeline_notes').update({
      content: editContent.trim(),
      company_id: editCompanyId === 'none' ? null : editCompanyId,
      stage_id: editStageId === 'none' ? null : editStageId,
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

              <div className="flex gap-2 flex-wrap">
                {/* Multi-company selector with search */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 max-w-xs">
                      <Building2 className="h-3 w-3 text-muted-foreground" />
                      {selectedCompanyIds.length === 0
                        ? 'Anclar a empresas'
                        : `${selectedCompanyIds.length} empresa${selectedCompanyIds.length > 1 ? 's' : ''}`}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-2" side="bottom" align="start">
                    <div className="relative mb-2">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Buscar empresa..."
                        value={companySearch}
                        onChange={e => setCompanySearch(e.target.value)}
                        className="h-8 pl-7 text-xs"
                      />
                    </div>
                    {selectedCompanyIds.length > 0 && (
                      <button
                        onClick={() => setSelectedCompanyIds([])}
                        className="text-[10px] text-muted-foreground hover:text-foreground mb-1 px-1"
                      >
                        Limpiar selección
                      </button>
                    )}
                    <ScrollArea className="max-h-[180px]">
                      <div className="space-y-0.5">
                        {filteredCompanies.map(c => (
                          <label
                            key={c.id}
                            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted cursor-pointer"
                          >
                            <Checkbox
                              checked={selectedCompanyIds.includes(c.id)}
                              onCheckedChange={() => toggleCompany(c.id)}
                              className="h-3.5 w-3.5"
                            />
                            <span className="truncate">{c.tradeName}</span>
                          </label>
                        ))}
                        {filteredCompanies.length === 0 && (
                          <p className="text-[10px] text-muted-foreground text-center py-2">Sin resultados</p>
                        )}
                      </div>
                    </ScrollArea>
                  </PopoverContent>
                </Popover>

                {/* Stage selector */}
                <Select value={selectedStageId} onValueChange={setSelectedStageId}>
                  <SelectTrigger className="h-8 text-xs w-auto min-w-[140px]">
                    <div className="flex items-center gap-1.5">
                      <Layers className="h-3 w-3 text-muted-foreground" />
                      <SelectValue placeholder="Etapa (opcional)" />
                    </div>
                  </SelectTrigger>
                  <SelectContent side="bottom">
                    <SelectItem value="none">Sin etapa</SelectItem>
                    {stages.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        <div className="flex items-center gap-1.5">
                          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                          {s.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Selected companies badges */}
              {selectedCompanyIds.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedCompanyIds.map(id => (
                    <Badge key={id} variant="secondary" className="text-[10px] gap-1 pr-1">
                      {companyMap.get(id) || 'Empresa'}
                      <button onClick={() => toggleCompany(id)} className="hover:text-destructive">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
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
                            <div className="flex gap-2 flex-wrap">
                              {/* Edit company selector */}
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1">
                                    <Building2 className="h-2.5 w-2.5" />
                                    {editCompanyId === 'none' ? 'Sin empresa' : (companyMap.get(editCompanyId) || 'Empresa')}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-56 p-2" side="bottom" align="start">
                                  <div className="relative mb-2">
                                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                                    <Input
                                      placeholder="Buscar..."
                                      value={editCompanySearch}
                                      onChange={e => setEditCompanySearch(e.target.value)}
                                      className="h-7 pl-6 text-xs"
                                    />
                                  </div>
                                  <ScrollArea className="max-h-[150px]">
                                    <button
                                      onClick={() => setEditCompanyId('none')}
                                      className={`w-full text-left rounded px-2 py-1 text-xs hover:bg-muted ${editCompanyId === 'none' ? 'bg-muted font-medium' : ''}`}
                                    >
                                      Sin empresa
                                    </button>
                                    {editFilteredCompanies.map(c => (
                                      <button
                                        key={c.id}
                                        onClick={() => setEditCompanyId(c.id)}
                                        className={`w-full text-left rounded px-2 py-1 text-xs hover:bg-muted truncate ${editCompanyId === c.id ? 'bg-muted font-medium' : ''}`}
                                      >
                                        {c.tradeName}
                                      </button>
                                    ))}
                                  </ScrollArea>
                                </PopoverContent>
                              </Popover>

                              {/* Edit stage selector */}
                              <Select value={editStageId} onValueChange={setEditStageId}>
                                <SelectTrigger className="h-7 text-[10px] w-auto min-w-[100px]">
                                  <SelectValue placeholder="Etapa" />
                                </SelectTrigger>
                                <SelectContent side="bottom">
                                  <SelectItem value="none">Sin etapa</SelectItem>
                                  {stages.map(s => (
                                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
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
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
                              {note.company_id && companyMap.get(note.company_id) && (
                                <div className="flex items-center gap-1">
                                  <Building2 className="h-3 w-3 text-primary/70" />
                                  <span className="text-[10px] font-medium text-primary/70">{companyMap.get(note.company_id)}</span>
                                </div>
                              )}
                              {note.stage_id && stageMap.get(note.stage_id) && (
                                <div className="flex items-center gap-1">
                                  <Layers className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-[10px] font-medium text-muted-foreground">{stageMap.get(note.stage_id)}</span>
                                </div>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
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
