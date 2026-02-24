import { useState, useEffect, useRef } from 'react';
import { Company, Contact, VERTICALS, CITIES } from '@/types/crm';
import { useCRM } from '@/contexts/CRMContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Plus, Trash2, Upload, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  open: boolean;
  onClose: () => void;
  company?: Company | null;
}

const YEARS = [2020, 2021, 2022, 2023, 2024, 2025];

const emptyContact = (): Contact => ({
  id: crypto.randomUUID(), name: '', position: '', email: '', phone: '', notes: '', isPrimary: false,
});

export default function CompanyForm({ open, onClose, company }: Props) {
  const { addCompany, updateCompany } = useCRM();
  const isEdit = !!company;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    tradeName: '', legalName: '', nit: '', category: 'Startup' as 'EBT' | 'Startup',
    vertical: '', economicActivity: '', description: '', city: '', exportsUSD: 0,
  });
  const [salesByYear, setSalesByYear] = useState<Record<number, string>>({});
  const [contacts, setContacts] = useState<Contact[]>([emptyContact()]);
  const [notes, setNotes] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (company) {
      setForm({
        tradeName: company.tradeName, legalName: company.legalName, nit: company.nit,
        category: company.category, vertical: company.vertical,
        economicActivity: company.economicActivity, description: company.description,
        city: company.city, exportsUSD: company.exportsUSD,
      });
      const sales: Record<number, string> = {};
      Object.entries(company.salesByYear).forEach(([y, v]) => { sales[Number(y)] = String(v); });
      setSalesByYear(sales);
      setContacts(company.contacts.length > 0 ? company.contacts : [emptyContact()]);
      setLogoUrl(company.logo || null);
      setLogoPreview(company.logo || null);
    } else {
      setForm({ tradeName: '', legalName: '', nit: '', category: 'Startup', vertical: '', economicActivity: '', description: '', city: '', exportsUSD: 0 });
      setSalesByYear({});
      setContacts([emptyContact()]);
      setNotes('');
      setLogoUrl(null);
      setLogoPreview(null);
    }
  }, [company, open]);

  const uploadFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    setUploading(true);
    const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
    const fileName = `${crypto.randomUUID()}.${ext}`;

    const { error } = await supabase.storage.from('company-logos').upload(fileName, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from('company-logos').getPublicUrl(fileName);
      setLogoUrl(data.publicUrl);
    }
    setUploading(false);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!open) return;
      const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'));
      if (item) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) uploadFile(file);
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [open]);

  const removeLogo = () => {
    setLogoUrl(null);
    setLogoPreview(null);
  };

  const handleSave = async () => {
    const parsedSales: Record<number, number> = {};
    Object.entries(salesByYear).forEach(([y, v]) => {
      const n = Number(v);
      if (n > 0) parsedSales[Number(y)] = n;
    });

    const validContacts = contacts.filter(c => c.name.trim());
    if (validContacts.length > 0 && !validContacts.some(c => c.isPrimary)) {
      validContacts[0].isPrimary = true;
    }

    const companyData: Company = {
      id: company?.id || crypto.randomUUID(),
      ...form,
      salesByYear: parsedSales,
      logo: logoUrl || undefined,
      contacts: validContacts,
      actions: company?.actions || [],
      milestones: company?.milestones || [],
      tasks: company?.tasks || [],
      customProperties: company?.customProperties || [],
      createdAt: company?.createdAt || new Date().toISOString().split('T')[0],
    };

    if (isEdit) await updateCompany(companyData);
    else await addCompany(companyData);
    onClose();
  };

  const updateContact = (id: string, field: keyof Contact, value: string | boolean) => {
    setContacts(prev => prev.map(c => {
      if (c.id !== id) return field === 'isPrimary' && value === true ? { ...c, isPrimary: false } : c;
      return { ...c, [field]: value };
    }));
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl p-0 gap-0 max-h-[90vh] overflow-hidden">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>{isEdit ? 'Editar empresa' : 'Nueva empresa'}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(90vh-130px)] px-6 py-4">
          <div className="space-y-6 pb-6">
            {/* Logo Upload */}
            <Section title="Logo">
              <div className="flex items-center gap-4">
                {logoPreview ? (
                  <div className="relative">
                    <img src={logoPreview} alt="Logo" className="h-16 w-16 rounded-lg border border-border object-cover" />
                    <button
                      type="button"
                      onClick={removeLogo}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    <Upload className="h-5 w-5" />
                  </button>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                <div className="text-xs text-muted-foreground">
                  {uploading ? 'Subiendo...' : logoPreview ? 'Logo cargado' : 'Clic para subir o pega una imagen (Ctrl+V)'}
                </div>
              </div>
            </Section>

            <Separator />

            <Section title="Identificación">
              <Field label="Nombre comercial">
                <Input className="h-9 text-sm" value={form.tradeName} onChange={e => setForm(f => ({ ...f, tradeName: e.target.value }))} />
              </Field>
              <Field label="Razón Social">
                <Input className="h-9 text-sm" value={form.legalName} onChange={e => setForm(f => ({ ...f, legalName: e.target.value }))} />
              </Field>
              <Field label="NIT">
                <Input className="h-9 text-sm" value={form.nit} onChange={e => setForm(f => ({ ...f, nit: e.target.value }))} />
              </Field>
            </Section>

            <Separator />

            <Section title="Segmentación">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Categoría">
                  <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v as 'EBT' | 'Startup' }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EBT">EBT</SelectItem>
                      <SelectItem value="Startup">Startup</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Vertical">
                  <Select value={form.vertical} onValueChange={v => setForm(f => ({ ...f, vertical: v }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      {VERTICALS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="Actividad económica">
                <Input className="h-9 text-sm" value={form.economicActivity} onChange={e => setForm(f => ({ ...f, economicActivity: e.target.value }))} />
              </Field>
              <Field label="Ciudad">
                <Select value={form.city} onValueChange={v => setForm(f => ({ ...f, city: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {CITIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </Section>

            <Separator />

            <Section title="Descripción">
              <Textarea className="text-sm" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe brevemente la empresa..." />
            </Section>

            <Separator />

            <Section title="Contactos">
              {contacts.map((c, i) => (
                <div key={c.id} className="space-y-2 rounded-lg border border-border/50 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">Contacto {i + 1}</p>
                    <div className="flex gap-1">
                      <Button
                        variant={c.isPrimary ? 'default' : 'ghost'}
                        size="sm"
                        className="h-6 text-[10px]"
                        onClick={() => updateContact(c.id, 'isPrimary', true)}
                      >
                        Principal
                      </Button>
                      {contacts.length > 1 && (
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setContacts(prev => prev.filter(x => x.id !== c.id))}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input className="h-8 text-sm" placeholder="Nombre" value={c.name} onChange={e => updateContact(c.id, 'name', e.target.value)} />
                    <Input className="h-8 text-sm" placeholder="Cargo" value={c.position} onChange={e => updateContact(c.id, 'position', e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input className="h-8 text-sm" placeholder="Correo" value={c.email} onChange={e => updateContact(c.id, 'email', e.target.value)} />
                    <Input className="h-8 text-sm" placeholder="Celular" value={c.phone} onChange={e => updateContact(c.id, 'phone', e.target.value)} />
                  </div>
                  <Input className="h-8 text-sm" placeholder="Notas" value={c.notes} onChange={e => updateContact(c.id, 'notes', e.target.value)} />
                </div>
              ))}
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setContacts(prev => [...prev, emptyContact()])}>
                <Plus className="h-3 w-3" /> Agregar contacto
              </Button>
            </Section>

            <Separator />

            <Section title="Métricas — Ventas por año (COP)">
              <div className="grid grid-cols-3 gap-2">
                {YEARS.map(y => (
                  <Field key={y} label={String(y)}>
                    <Input
                      className="h-8 text-sm"
                      type="number"
                      placeholder="0"
                      value={salesByYear[y] || ''}
                      onChange={e => setSalesByYear(prev => ({ ...prev, [y]: e.target.value }))}
                    />
                  </Field>
                ))}
              </div>
            </Section>

            <Separator />

            <Section title="Internacionalización">
              <Field label="Exportaciones (USD)">
                <Input className="h-9 text-sm" type="number" value={form.exportsUSD || ''} onChange={e => setForm(f => ({ ...f, exportsUSD: Number(e.target.value) }))} />
              </Field>
            </Section>

            <Separator />

            <Section title="Notas">
              <Textarea className="text-sm" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notas internas..." />
            </Section>
          </div>
        </ScrollArea>
        <div className="flex justify-end gap-2 border-t border-border px-6 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={!form.tradeName.trim() || uploading}>
            {isEdit ? 'Guardar cambios' : 'Crear empresa'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
