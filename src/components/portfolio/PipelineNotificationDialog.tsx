import { useState, useMemo } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCRM } from '@/contexts/CRMContext';
import { PipelineStage, PipelineEntry } from '@/types/portfolio';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Send, Mail, Image, Type, Palette, ExternalLink, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  offerId: string;
}

interface EmailBlock {
  id: string;
  type: 'text' | 'button' | 'image';
  content: string;
  url?: string;
  bgColor?: string;
  textColor?: string;
}

export default function PipelineNotificationDialog({ open, onClose, offerId }: Props) {
  const { getStagesForOffer, getEntriesForOffer } = usePortfolio();
  const { companies } = useCRM();
  const stages = getStagesForOffer(offerId);
  const entries = getEntriesForOffer(offerId);

  const [step, setStep] = useState<'select' | 'compose'>('select');
  const [selectionMode, setSelectionMode] = useState<'stage' | 'companies'>('stage');
  const [selectedStageId, setSelectedStageId] = useState('');
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);

  // Email editor
  const [subject, setSubject] = useState('');
  const [blocks, setBlocks] = useState<EmailBlock[]>([
    { id: '1', type: 'text', content: 'Escribe tu mensaje aquí...', textColor: '#333333' },
  ]);
  const [bgColor, setBgColor] = useState('#ffffff');
  const [showPreview, setShowPreview] = useState(false);

  const stageEntries = useMemo(() => {
    if (selectedStageId) return entries.filter(e => e.stageId === selectedStageId);
    return entries;
  }, [entries, selectedStageId]);

  const getCompany = (id: string) => companies.find(c => c.id === id);

  const selectedRecipients = useMemo(() => {
    let companyIds: string[] = [];
    if (selectionMode === 'stage' && selectedStageId) {
      companyIds = stageEntries.map(e => e.companyId);
    } else {
      companyIds = selectedCompanyIds;
    }
    return companyIds.map(id => getCompany(id)).filter(Boolean);
  }, [selectionMode, selectedStageId, stageEntries, selectedCompanyIds, companies]);

  const toggleCompany = (id: string) => {
    setSelectedCompanyIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selectAllInStage = () => {
    const ids = stageEntries.map(e => e.companyId);
    setSelectedCompanyIds(ids);
  };

  const addBlock = (type: 'text' | 'button' | 'image') => {
    const newBlock: EmailBlock = {
      id: Date.now().toString(),
      type,
      content: type === 'text' ? 'Nuevo texto...' : type === 'button' ? 'Ver más' : '',
      url: type === 'button' ? 'https://' : type === 'image' ? 'https://via.placeholder.com/600x200' : undefined,
      bgColor: type === 'button' ? '#3b82f6' : undefined,
      textColor: type === 'button' ? '#ffffff' : '#333333',
    };
    setBlocks(prev => [...prev, newBlock]);
  };

  const updateBlock = (id: string, updates: Partial<EmailBlock>) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  };

  const removeBlock = (id: string) => {
    setBlocks(prev => prev.filter(b => b.id !== id));
  };

  const generateHtml = () => {
    const bodyBlocks = blocks.map(b => {
      if (b.type === 'text') {
        return `<div style="padding:16px 24px;color:${b.textColor || '#333'};">${b.content.replace(/\n/g, '<br/>')}</div>`;
      }
      if (b.type === 'button') {
        return `<div style="padding:16px 24px;text-align:center;"><a href="${b.url}" style="display:inline-block;padding:12px 32px;background:${b.bgColor || '#3b82f6'};color:${b.textColor || '#fff'};text-decoration:none;border-radius:6px;font-weight:600;">${b.content}</a></div>`;
      }
      if (b.type === 'image') {
        return `<div style="padding:16px 24px;text-align:center;"><img src="${b.url}" alt="" style="max-width:100%;border-radius:8px;" /></div>`;
      }
      return '';
    }).join('');

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:${bgColor};font-family:Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;">${bodyBlocks}</div></body></html>`;
  };

  const handleSendViaMailto = () => {
    // Get contact emails from selected companies
    const emails: string[] = [];
    selectedRecipients.forEach(company => {
      if (!company) return;
      const primaryContact = company.contacts?.find(c => c.isPrimary);
      const contact = primaryContact || company.contacts?.[0];
      if (contact?.email) emails.push(contact.email);
    });

    if (emails.length === 0) {
      alert('No se encontraron correos de contacto en las empresas seleccionadas.');
      return;
    }

    // mailto has limitations with HTML body, so we use plain text
    const plainBody = blocks.map(b => {
      if (b.type === 'text') return b.content;
      if (b.type === 'button') return `${b.content}: ${b.url}`;
      if (b.type === 'image') return `[Imagen: ${b.url}]`;
      return '';
    }).join('\n\n');

    const mailtoUrl = `mailto:${emails.join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(plainBody)}`;
    window.open(mailtoUrl, '_blank');
  };

  const handleReset = () => {
    setStep('select');
    setSelectionMode('stage');
    setSelectedStageId('');
    setSelectedCompanyIds([]);
    setSubject('');
    setBlocks([{ id: '1', type: 'text', content: 'Escribe tu mensaje aquí...', textColor: '#333333' }]);
    setBgColor('#ffffff');
    setShowPreview(false);
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); handleReset(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" /> Enviar notificación
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {step === 'select' && (
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>¿A quién enviar?</Label>
                <div className="flex gap-2">
                  <Button variant={selectionMode === 'stage' ? 'default' : 'outline'} size="sm" onClick={() => setSelectionMode('stage')}>
                    Toda una etapa
                  </Button>
                  <Button variant={selectionMode === 'companies' ? 'default' : 'outline'} size="sm" onClick={() => setSelectionMode('companies')}>
                    Empresas específicas
                  </Button>
                </div>
              </div>

              {selectionMode === 'stage' && (
                <div className="space-y-2">
                  <Label>Seleccionar etapa</Label>
                  <Select value={selectedStageId} onValueChange={setSelectedStageId}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar etapa..." /></SelectTrigger>
                    <SelectContent>
                      {stages.map(s => {
                        const count = entries.filter(e => e.stageId === s.id).length;
                        return (
                          <SelectItem key={s.id} value={s.id}>
                            <div className="flex items-center gap-2">
                              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                              {s.name} ({count})
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {selectedStageId && (
                    <div className="rounded-md border border-border p-3 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground mb-2">{stageEntries.length} empresa(s) en esta etapa</p>
                      {stageEntries.map(entry => {
                        const company = getCompany(entry.companyId);
                        if (!company) return null;
                        return (
                          <div key={entry.id} className="flex items-center gap-2 text-sm">
                            <div className="h-2 w-2 rounded-full bg-primary/40" />
                            {company.tradeName}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {selectionMode === 'companies' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Filtrar por etapa (opcional)</Label>
                    <Select value={selectedStageId || 'all'} onValueChange={v => { setSelectedStageId(v === 'all' ? '' : v); setSelectedCompanyIds([]); }}>
                      <SelectTrigger className="w-[180px]"><SelectValue placeholder="Todas" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas las etapas</SelectItem>
                        {stages.map(s => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={selectAllInStage}>Seleccionar todas</Button>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedCompanyIds([])}>Deseleccionar</Button>
                  </div>
                  <div className="rounded-md border border-border p-2 max-h-48 overflow-y-auto space-y-1">
                    {(selectedStageId ? stageEntries : entries).map(entry => {
                      const company = getCompany(entry.companyId);
                      if (!company) return null;
                      const checked = selectedCompanyIds.includes(entry.companyId);
                      return (
                        <label key={entry.id} className="flex items-center gap-2 rounded-md p-2 text-sm hover:bg-muted/50 cursor-pointer">
                          <Checkbox checked={checked} onCheckedChange={() => toggleCompany(entry.companyId)} />
                          {company.tradeName}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button onClick={() => setStep('compose')}
                  disabled={selectionMode === 'stage' ? !selectedStageId : selectedCompanyIds.length === 0}>
                  Continuar
                </Button>
              </div>
            </div>
          )}

          {step === 'compose' && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary">{selectedRecipients.length} destinatario(s)</Badge>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setStep('select')}>Cambiar</Button>
              </div>

              <div className="space-y-1.5">
                <Label>Asunto</Label>
                <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Asunto del correo" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Contenido del correo</Label>
                  <div className="flex items-center gap-1">
                    <div className="flex items-center gap-1 mr-2">
                      <Label className="text-[10px]">Fondo:</Label>
                      <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0" />
                    </div>
                    <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => addBlock('text')} title="Agregar texto">
                      <Type className="h-3 w-3" /> Texto
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => addBlock('button')} title="Agregar botón">
                      <ExternalLink className="h-3 w-3" /> Botón
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => addBlock('image')} title="Agregar imagen">
                      <Image className="h-3 w-3" /> Imagen
                    </Button>
                  </div>
                </div>

                <div className="space-y-2 rounded-md border border-border p-3">
                  {blocks.map((block, idx) => (
                    <div key={block.id} className="rounded-md border border-border/50 p-2 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-[10px]">
                          {block.type === 'text' ? 'Texto' : block.type === 'button' ? 'Botón' : 'Imagen'}
                        </Badge>
                        <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive" onClick={() => removeBlock(block.id)}>×</Button>
                      </div>
                      {block.type === 'text' && (
                        <>
                          <Textarea value={block.content} onChange={e => updateBlock(block.id, { content: e.target.value })} rows={3} className="text-sm" />
                          <div className="flex items-center gap-2">
                            <Label className="text-[10px]">Color texto:</Label>
                            <input type="color" value={block.textColor || '#333333'} onChange={e => updateBlock(block.id, { textColor: e.target.value })} className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0" />
                          </div>
                        </>
                      )}
                      {block.type === 'button' && (
                        <>
                          <Input value={block.content} onChange={e => updateBlock(block.id, { content: e.target.value })} placeholder="Texto del botón" className="h-8" />
                          <Input value={block.url || ''} onChange={e => updateBlock(block.id, { url: e.target.value })} placeholder="URL del enlace" className="h-8" />
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1">
                              <Label className="text-[10px]">Fondo:</Label>
                              <input type="color" value={block.bgColor || '#3b82f6'} onChange={e => updateBlock(block.id, { bgColor: e.target.value })} className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0" />
                            </div>
                            <div className="flex items-center gap-1">
                              <Label className="text-[10px]">Texto:</Label>
                              <input type="color" value={block.textColor || '#ffffff'} onChange={e => updateBlock(block.id, { textColor: e.target.value })} className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0" />
                            </div>
                          </div>
                        </>
                      )}
                      {block.type === 'image' && (
                        <Input value={block.url || ''} onChange={e => updateBlock(block.id, { url: e.target.value })} placeholder="URL de la imagen" className="h-8" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview toggle */}
              <div>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowPreview(v => !v)}>
                  <Eye className="h-3.5 w-3.5" /> {showPreview ? 'Ocultar' : 'Vista previa'}
                </Button>
                {showPreview && (
                  <div className="mt-2 rounded-md border border-border overflow-hidden">
                    <div dangerouslySetInnerHTML={{ __html: generateHtml() }} />
                  </div>
                )}
              </div>

              <div className="flex justify-between pt-2 border-t border-border/40">
                <Button variant="ghost" onClick={() => setStep('select')}>Atrás</Button>
                <div className="flex gap-2">
                  <Button variant="outline" className="gap-1.5" onClick={handleSendViaMailto} disabled={!subject.trim()}>
                    <Mail className="h-3.5 w-3.5" /> Abrir en correo
                  </Button>
                  <Button className="gap-1.5" disabled title="Funcionalidad de envío directo próximamente">
                    <Send className="h-3.5 w-3.5" /> Enviar
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
