import { useState } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { Ally, AllyContact } from '@/types/portfolio';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, Upload, User, Mail, Phone, Star, Pencil, X, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

export default function AlliesSection() {
  const { allies, createAlly, updateAlly, deleteAlly, addAllyContact, updateAllyContact, deleteAllyContact, getContactsForAlly, offerAllies, offers } = usePortfolio();
  const [selectedAlly, setSelectedAlly] = useState<Ally | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLogo, setNewLogo] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Contact form
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', position: '', email: '', phone: '', notes: '', isPrimary: false });

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>, forAllyId?: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `ally-logos/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('company-logos').upload(path, file);
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('company-logos').getPublicUrl(path);
      if (forAllyId) {
        await updateAlly(forAllyId, { logo: publicUrl });
        if (selectedAlly?.id === forAllyId) setSelectedAlly(prev => prev ? { ...prev, logo: publicUrl } : null);
      } else {
        setNewLogo(publicUrl);
      }
    }
    setUploading(false);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const ally = await createAlly(newName.trim(), newLogo);
    if (ally) { setShowCreate(false); setNewName(''); setNewLogo(null); }
  };

  const handleAddContact = async () => {
    if (!selectedAlly || !contactForm.name.trim()) return;
    await addAllyContact(selectedAlly.id, contactForm);
    setContactForm({ name: '', position: '', email: '', phone: '', notes: '', isPrimary: false });
    setShowContactForm(false);
  };

  const handleDeleteAlly = async (ally: Ally) => {
    if (confirm(`¿Eliminar "${ally.name}"?`)) {
      await deleteAlly(ally.id);
      if (selectedAlly?.id === ally.id) setSelectedAlly(null);
    }
  };

  const getLinkedOffers = (allyId: string) => {
    const oIds = offerAllies.filter(oa => oa.allyId === allyId).map(oa => oa.offerId);
    return offers.filter(o => oIds.includes(o.id));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{allies.length} aliado(s) registrado(s)</p>
        <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}>
          <Plus className="h-3.5 w-3.5" /> Nuevo aliado
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              {newLogo ? (
                <img src={newLogo} alt="" className="h-12 w-12 rounded-lg border border-border/40 object-contain bg-white p-1" />
              ) : (
                <label className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/30 hover:bg-muted/50 transition-colors">
                  <Upload className="h-5 w-5 text-muted-foreground" />
                  <input type="file" accept="image/*" className="hidden" onChange={e => handleLogoUpload(e)} disabled={uploading} />
                </label>
              )}
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nombre del aliado" className="flex-1" onKeyDown={e => e.key === 'Enter' && handleCreate()} />
              <Button onClick={handleCreate} disabled={!newName.trim()}>Crear</Button>
              <Button variant="ghost" size="icon" onClick={() => { setShowCreate(false); setNewName(''); setNewLogo(null); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {allies.length === 0 && !showCreate ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Building2 className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No hay aliados registrados</p>
          <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5" /> Crear primer aliado
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {allies.map(ally => {
            const contacts = getContactsForAlly(ally.id);
            const linkedOffers = getLinkedOffers(ally.id);
            return (
              <Card key={ally.id} className="cursor-pointer transition-all hover:shadow-md hover:border-primary/20" onClick={() => setSelectedAlly(ally)}>
                <CardHeader className="pb-2">
                  <div className="flex items-start gap-3">
                    {ally.logo ? (
                      <img src={ally.logo} alt="" className="h-10 w-10 rounded-lg border border-border/40 object-contain bg-white p-0.5" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                        {ally.name.charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-bold">{ally.name}</h3>
                      <p className="text-xs text-muted-foreground">{contacts.length} contacto(s)</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={e => { e.stopPropagation(); handleDeleteAlly(ally); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pb-3">
                  {linkedOffers.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {linkedOffers.map(o => (
                        <Badge key={o.id} variant="secondary" className="text-[10px]">{o.name}</Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Ally detail dialog */}
      <Dialog open={!!selectedAlly} onOpenChange={v => !v && setSelectedAlly(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {selectedAlly && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  {selectedAlly.logo ? (
                    <img src={selectedAlly.logo} alt="" className="h-10 w-10 rounded-lg border border-border/40 object-contain bg-white p-0.5" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                      {selectedAlly.name.charAt(0)}
                    </div>
                  )}
                  <div>
                    <p>{selectedAlly.name}</p>
                    <label className="text-xs text-primary cursor-pointer hover:underline">
                      Cambiar logo
                      <input type="file" accept="image/*" className="hidden" onChange={e => handleLogoUpload(e, selectedAlly.id)} />
                    </label>
                  </div>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Contactos</h3>
                  <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setShowContactForm(true)}>
                    <Plus className="h-3 w-3" /> Contacto
                  </Button>
                </div>

                {showContactForm && (
                  <div className="rounded-md border border-border p-3 space-y-2">
                    <Input value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} placeholder="Nombre" className="h-8" />
                    <div className="grid grid-cols-2 gap-2">
                      <Input value={contactForm.position} onChange={e => setContactForm(f => ({ ...f, position: e.target.value }))} placeholder="Cargo" className="h-8" />
                      <Input value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} placeholder="Email" className="h-8" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input value={contactForm.phone} onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))} placeholder="Teléfono" className="h-8" />
                      <Input value={contactForm.notes} onChange={e => setContactForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notas" className="h-8" />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={contactForm.isPrimary} onChange={e => setContactForm(f => ({ ...f, isPrimary: e.target.checked }))} />
                        Contacto principal
                      </label>
                      <div className="flex gap-1">
                        <Button size="sm" onClick={handleAddContact} disabled={!contactForm.name.trim()}>Agregar</Button>
                        <Button size="sm" variant="ghost" onClick={() => setShowContactForm(false)}>Cancelar</Button>
                      </div>
                    </div>
                  </div>
                )}

                {(() => {
                  const contacts = getContactsForAlly(selectedAlly.id);
                  return contacts.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Sin contactos</p>
                  ) : (
                    <div className="space-y-2">
                      {contacts.map(c => (
                        <div key={c.id} className="flex items-start gap-3 rounded-lg border border-border/50 p-3">
                          <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', c.isPrimary ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-secondary')}>
                            {c.isPrimary ? <Star className="h-3.5 w-3.5 text-amber-600" /> : <User className="h-3.5 w-3.5 text-muted-foreground" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{c.name}</p>
                            {c.position && <p className="text-xs text-muted-foreground">{c.position}</p>}
                            <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                              {c.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>}
                              {c.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>}
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => deleteAllyContact(c.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Linked offers */}
                {(() => {
                  const linked = getLinkedOffers(selectedAlly.id);
                  if (linked.length === 0) return null;
                  return (
                    <div>
                      <h3 className="text-sm font-semibold mb-2">Ofertas vinculadas</h3>
                      <div className="flex flex-wrap gap-1">
                        {linked.map(o => <Badge key={o.id} variant="outline" className="text-xs">{o.name}</Badge>)}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );

  function getLinkedOffers(allyId: string) {
    const offerIds = offerAllies.filter(oa => oa.allyId === allyId).map(oa => oa.offerId);
    return offers.filter(o => offerIds.includes(o.id));
  }
}
