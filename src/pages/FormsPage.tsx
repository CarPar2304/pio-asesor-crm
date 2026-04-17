import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/lib/toast';
import { ExternalForm, ExternalFormField, FORM_TYPE_LABELS, FORM_STATUS_LABELS, FORM_STATUS_COLORS, FormStatus } from '@/types/externalForms';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Plus, Copy, Pencil, Archive, Play, Pause, Eye, BarChart3, FileText, Search, FlaskConical, Trash2, MousePointerClick, Send, CheckCircle2, TrendingUp } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import FormWizardDialog from '@/components/forms/FormWizardDialog';
import FormResponsesDialog from '@/components/forms/FormResponsesDialog';
import { useAuth } from '@/hooks/useAuth';

interface OfferInfo { id: string; name: string; product: string; category_id: string | null; }
interface CategoryInfo { id: string; name: string; }

export default function FormsPage() {
  const { session } = useAuth();
  const [forms, setForms] = useState<ExternalForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterOffer, setFilterOffer] = useState<string>('all');
  const [filterProduct, setFilterProduct] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingForm, setEditingForm] = useState<ExternalForm | null>(null);
  const [responsesFormId, setResponsesFormId] = useState<string | null>(null);
  const [offers, setOffers] = useState<OfferInfo[]>([]);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);

  const loadForms = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('external_forms').select('*').order('created_at', { ascending: false });
    if (error) { showError('Error', error.message); }
    else setForms((data || []) as unknown as ExternalForm[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadForms(); }, [loadForms]);

  useEffect(() => {
    supabase.from('portfolio_offers').select('id, name, product, category_id').order('name').then(({ data }) => setOffers((data || []) as OfferInfo[]));
    supabase.from('portfolio_offer_categories').select('id, name').order('name').then(({ data }) => setCategories((data || []) as CategoryInfo[]));
  }, []);

  // Derived: unique products from offers that have linked forms
  const linkedOfferIds = useMemo(() => new Set(forms.filter(f => f.linked_offer_id).map(f => f.linked_offer_id!)), [forms]);
  const linkedOffers = useMemo(() => offers.filter(o => linkedOfferIds.has(o.id)), [offers, linkedOfferIds]);
  const uniqueProducts = useMemo(() => [...new Set(linkedOffers.map(o => o.product).filter(Boolean))], [linkedOffers]);
  const uniqueCategoryIds = useMemo(() => [...new Set(linkedOffers.map(o => o.category_id).filter(Boolean) as string[])], [linkedOffers]);

  const filtered = forms.filter(f => {
    if (filterStatus !== 'all' && f.status !== filterStatus) return false;
    if (filterType !== 'all' && f.form_type !== filterType) return false;
    if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterOffer !== 'all') {
      if (filterOffer === '__none') { if (f.linked_offer_id) return false; }
      else { if (f.linked_offer_id !== filterOffer) return false; }
    }
    if (filterProduct !== 'all') {
      if (!f.linked_offer_id) return false;
      const offer = offers.find(o => o.id === f.linked_offer_id);
      if (!offer || offer.product !== filterProduct) return false;
    }
    if (filterCategory !== 'all') {
      if (!f.linked_offer_id) return false;
      const offer = offers.find(o => o.id === f.linked_offer_id);
      if (!offer || offer.category_id !== filterCategory) return false;
    }
    return true;
  });

  const handleStatusChange = async (form: ExternalForm, newStatus: FormStatus) => {
    const { error } = await supabase.from('external_forms').update({ status: newStatus }).eq('id', form.id);
    if (error) showError('Error', error.message);
    else {
      showSuccess('Estado actualizado', `${form.name} → ${FORM_STATUS_LABELS[newStatus]}`);
      loadForms();
    }
  };

  const handleDelete = async (form: ExternalForm) => {
    if (!confirm(`¿Estás seguro de eliminar "${form.name}"? Esta acción no se puede deshacer.`)) return;
    // Delete fields, responses, sessions, then form
    await supabase.from('external_form_fields').delete().eq('form_id', form.id);
    await supabase.from('external_form_responses').delete().eq('form_id', form.id);
    await supabase.from('external_form_sessions').delete().eq('form_id', form.id);
    const { error } = await supabase.from('external_forms').delete().eq('id', form.id);
    if (error) showError('Error', error.message);
    else {
      showSuccess('Eliminado', `"${form.name}" fue eliminado`);
      loadForms();
    }
  };

  const handleDuplicate = async (form: ExternalForm) => {
    const newSlug = crypto.randomUUID().slice(0, 8);
    const { data: newForm, error } = await supabase.from('external_forms').insert({
      ...form, id: undefined, slug: newSlug, name: `${form.name} (copia)`, status: 'draft' as any,
      access_count: 0, started_count: 0, submitted_count: 0, completed_count: 0,
      created_at: undefined, updated_at: undefined
    } as any).select('id').single();

    if (error) { showError('Error', error.message); return; }

    // Copy fields
    const { data: fields } = await supabase.from('external_form_fields').select('*').eq('form_id', form.id);
    if (fields && fields.length > 0 && newForm) {
      const newFields = fields.map((f: any) => ({ ...f, id: undefined, form_id: newForm.id, created_at: undefined }));
      await supabase.from('external_form_fields').insert(newFields as any);
    }

    showSuccess('Formulario duplicado', `"${form.name}" fue duplicado`);
    loadForms();
  };

  const getFormUrl = (form: ExternalForm) => {
    return `${window.location.origin}/form/${form.slug}`;
  };

  const getTestUrl = (form: ExternalForm) => {
    const email = session?.user?.email || '';
    return `${window.location.origin}/form/${form.slug}?test=true&test_email=${encodeURIComponent(email)}`;
  };

  const copyLink = (form: ExternalForm) => {
    navigator.clipboard.writeText(getFormUrl(form));
    showSuccess('Enlace copiado', 'El enlace del formulario fue copiado al portapapeles');
  };

  return (
    <div className="container py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Formularios Externos</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} formularios</p>
        </div>
        <Button onClick={() => { setEditingForm(null); setWizardOpen(true); }} size="sm">
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Crear formulario
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar formulario..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="draft">Borrador</SelectItem>
            <SelectItem value="active">Activo</SelectItem>
            <SelectItem value="paused">Pausado</SelectItem>
            <SelectItem value="archived">Archivado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            <SelectItem value="update">Actualización</SelectItem>
            <SelectItem value="collection">Recopilación</SelectItem>
            <SelectItem value="creation">Creación</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterOffer} onValueChange={setFilterOffer}>
          <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las ofertas</SelectItem>
            <SelectItem value="__none">Sin oferta</SelectItem>
            {linkedOffers.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {uniqueProducts.length > 0 && (
          <Select value={filterProduct} onValueChange={setFilterProduct}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos productos</SelectItem>
              {uniqueProducts.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {uniqueCategoryIds.length > 0 && (
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas categorías</SelectItem>
              {uniqueCategoryIds.map(cid => {
                const cat = categories.find(c => c.id === cid);
                return <SelectItem key={cid} value={cid}>{cat?.name || cid}</SelectItem>;
              })}
            </SelectContent>
          </Select>
        )}
      </div>

      {loading ? (
        <div className="grid gap-3">
          {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
          <FileText className="h-10 w-10 text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No hay formularios</p>
          <Button variant="link" size="sm" className="mt-1" onClick={() => { setEditingForm(null); setWizardOpen(true); }}>
            Crear el primero
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map(form => (
            <Card key={form.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-medium text-sm truncate">{form.name}</h3>
                      <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${FORM_STATUS_COLORS[form.status]}`}>
                        {FORM_STATUS_LABELS[form.status]}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {FORM_TYPE_LABELS[form.form_type]}
                      </Badge>
                    </div>
                    {form.description && <p className="text-xs text-muted-foreground line-clamp-1">{form.description}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {form.status !== 'archived' && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(getTestUrl(form), '_blank')} title="Probar formulario">
                        <FlaskConical className="h-3.5 w-3.5 text-amber-600" />
                      </Button>
                    )}
                    {form.status === 'active' && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyLink(form)} title="Copiar enlace">
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setResponsesFormId(form.id)} title="Ver respuestas">
                      <BarChart3 className="h-3.5 w-3.5" />
                    </Button>
                    {form.status !== 'archived' && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingForm(form); setWizardOpen(true); }} title="Editar">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {form.status === 'draft' && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleStatusChange(form, 'active')} title="Activar">
                        <Play className="h-3.5 w-3.5 text-emerald-600" />
                      </Button>
                    )}
                    {form.status === 'active' && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleStatusChange(form, 'paused')} title="Pausar">
                        <Pause className="h-3.5 w-3.5 text-amber-600" />
                      </Button>
                    )}
                    {form.status === 'paused' && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleStatusChange(form, 'active')} title="Reactivar">
                        <Play className="h-3.5 w-3.5 text-emerald-600" />
                      </Button>
                    )}
                    {form.status !== 'archived' && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleStatusChange(form, 'archived')} title="Archivar">
                        <Archive className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(form)} title="Eliminar">
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                    {form.status === 'active' && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleDuplicate(form)}>
                        Duplicar
                      </Button>
                    )}
                  </div>
                </div>

                {(() => {
                  const conversion = form.access_count > 0 ? Math.round((form.completed_count / form.access_count) * 100) : 0;
                  const startedRate = form.access_count > 0 ? Math.round((form.started_count / form.access_count) * 100) : 0;
                  const submitRate = form.started_count > 0 ? Math.round((form.submitted_count / form.started_count) * 100) : 0;
                  return (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-3 border-t border-border/60">
                      <StatTile icon={Eye} label="Accesos" value={form.access_count} tone="slate" />
                      <StatTile icon={MousePointerClick} label="Iniciados" value={form.started_count} sub={form.access_count > 0 ? `${startedRate}%` : undefined} tone="indigo" />
                      <StatTile icon={Send} label="Enviados" value={form.submitted_count} sub={form.started_count > 0 ? `${submitRate}%` : undefined} tone="violet" />
                      <StatTile icon={CheckCircle2} label="Completados" value={form.completed_count} sub={form.access_count > 0 ? `${conversion}%` : undefined} tone="emerald" />
                      {form.access_count > 0 && (
                        <div className="col-span-2 md:col-span-4 mt-1">
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                            <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Tasa de conversión global</span>
                            <span className="font-semibold text-foreground">{conversion}%</span>
                          </div>
                          <Progress value={conversion} className="h-1.5" />
                        </div>
                      )}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <FormWizardDialog
        open={wizardOpen}
        onClose={() => { setWizardOpen(false); setEditingForm(null); }}
        editingForm={editingForm}
        onSaved={loadForms}
      />

      {responsesFormId && (
        <FormResponsesDialog
          formId={responsesFormId}
          onClose={() => setResponsesFormId(null)}
        />
      )}
    </div>
  );
}
