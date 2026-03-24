import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { OfferCategory, OfferType, PortfolioOffer, PipelineStage, PipelineEntry, Ally, AllyContact, OfferAlly } from '@/types/portfolio';
import { showSuccess, showError } from '@/lib/toast';
import { useAuth } from '@/hooks/useAuth';

interface PortfolioContextValue {
  categories: OfferCategory[];
  offerTypes: OfferType[];
  offers: PortfolioOffer[];
  stages: PipelineStage[];
  entries: PipelineEntry[];
  allies: Ally[];
  offerAllies: OfferAlly[];
  loading: boolean;

  createCategory: (name: string, color: string) => Promise<OfferCategory | null>;
  deleteCategory: (id: string) => Promise<void>;

  createOfferType: (name: string) => Promise<OfferType | null>;
  deleteOfferType: (id: string) => Promise<void>;

  createOffer: (data: Omit<PortfolioOffer, 'id' | 'createdAt' | 'updatedAt' | 'category' | 'stages'>) => Promise<PortfolioOffer | null>;
  updateOffer: (id: string, data: Partial<PortfolioOffer>) => Promise<void>;
  deleteOffer: (id: string) => Promise<void>;

  getStagesForOffer: (offerId: string) => PipelineStage[];
  createStage: (offerId: string, name: string, color: string, icon: string) => Promise<PipelineStage | null>;
  updateStage: (id: string, data: Partial<PipelineStage>) => Promise<void>;
  deleteStage: (id: string, offerId: string) => Promise<void>;
  reorderStages: (offerId: string, orderedIds: string[]) => Promise<void>;

  getEntriesForOffer: (offerId: string) => PipelineEntry[];
  addCompanyToStage: (offerId: string, stageId: string, companyId: string, assignedTo?: string | null) => Promise<void>;
  moveCompanyToStage: (entryId: string, newStageId: string) => Promise<void>;
  updateEntryAssignment: (entryId: string, assignedTo: string | null) => Promise<void>;
  removeEntry: (entryId: string) => Promise<void>;
  isCompanyInOffer: (offerId: string, companyId: string) => boolean;

  // Allies
  createAlly: (name: string, logo?: string | null) => Promise<Ally | null>;
  updateAlly: (id: string, data: Partial<Ally>) => Promise<void>;
  deleteAlly: (id: string) => Promise<void>;
  addAllyContact: (allyId: string, contact: Omit<AllyContact, 'id' | 'allyId' | 'createdAt'>) => Promise<AllyContact | null>;
  updateAllyContact: (id: string, data: Partial<AllyContact>) => Promise<void>;
  deleteAllyContact: (id: string) => Promise<void>;
  linkAllyToOffer: (offerId: string, allyId: string) => Promise<void>;
  unlinkAllyFromOffer: (offerId: string, allyId: string) => Promise<void>;
  getAlliesForOffer: (offerId: string) => Ally[];
  getContactsForAlly: (allyId: string) => AllyContact[];

  refresh: () => Promise<void>;
}

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [categories, setCategories] = useState<OfferCategory[]>([]);
  const [offerTypes, setOfferTypes] = useState<OfferType[]>([]);
  const [offers, setOffers] = useState<PortfolioOffer[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [entries, setEntries] = useState<PipelineEntry[]>([]);
  const [allies, setAllies] = useState<Ally[]>([]);
  const [allyContacts, setAllyContacts] = useState<AllyContact[]>([]);
  const [offerAllies, setOfferAllies] = useState<OfferAlly[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!session) { setOffers([]); setStages([]); setEntries([]); setCategories([]); setOfferTypes([]); setAllies([]); setAllyContacts([]); setOfferAllies([]); setLoading(false); return; }
    setLoading(true);
    try {
      const [catRes, typRes, offRes, stgRes, entRes, allyRes, allyConRes, oaRes] = await Promise.all([
        supabase.from('portfolio_offer_categories').select('*').order('display_order'),
        supabase.from('portfolio_offer_types').select('*').order('created_at'),
        supabase.from('portfolio_offers').select('*').order('created_at', { ascending: false }),
        supabase.from('pipeline_stages').select('*').order('display_order'),
        supabase.from('pipeline_entries').select('*').order('created_at'),
        supabase.from('allies').select('*').order('name'),
        supabase.from('ally_contacts').select('*').order('created_at'),
        supabase.from('offer_allies').select('*').order('created_at'),
      ]);

      if (catRes.data) setCategories(catRes.data.map(r => ({
        id: r.id, name: r.name, color: r.color,
        displayOrder: r.display_order, createdAt: r.created_at,
      })));

      if (typRes.data) setOfferTypes(typRes.data.map(r => ({
        id: r.id, name: r.name, createdAt: r.created_at,
      })));

      if (offRes.data) setOffers(offRes.data.map((r: any) => ({
        id: r.id, name: r.name, description: r.description,
        type: r.type, product: r.product || '',
        categoryId: r.category_id,
        startDate: r.start_date, endDate: r.end_date,
        status: r.status as any, createdAt: r.created_at, updatedAt: r.updated_at,
      })));

      if (stgRes.data) setStages(stgRes.data.map(r => ({
        id: r.id, offerId: r.offer_id, name: r.name,
        color: r.color, icon: r.icon, displayOrder: r.display_order,
        createdAt: r.created_at,
      })));

      if (entRes.data) setEntries(entRes.data.map((r: any) => ({
        id: r.id, offerId: r.offer_id, stageId: r.stage_id,
        companyId: r.company_id, notes: r.notes, addedBy: r.added_by || null,
        assignedTo: r.assigned_to || null,
        createdAt: r.created_at,
      })));

      if (allyRes.data) setAllies(allyRes.data.map((r: any) => ({
        id: r.id, name: r.name, logo: r.logo, createdAt: r.created_at,
      })));

      if (allyConRes.data) setAllyContacts(allyConRes.data.map((r: any) => ({
        id: r.id, allyId: r.ally_id, name: r.name, position: r.position,
        email: r.email, phone: r.phone, notes: r.notes, isPrimary: r.is_primary,
        createdAt: r.created_at,
      })));

      if (oaRes.data) setOfferAllies(oaRes.data.map((r: any) => ({
        id: r.id, offerId: r.offer_id, allyId: r.ally_id, createdAt: r.created_at,
      })));
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Categories
  const createCategory = async (name: string, color: string): Promise<OfferCategory | null> => {
    const order = categories.length;
    const { data, error } = await supabase
      .from('portfolio_offer_categories')
      .insert({ name, color, display_order: order })
      .select().single();
    if (error || !data) { showError('Error', 'No se pudo crear la categoría'); return null; }
    const cat: OfferCategory = { id: data.id, name: data.name, color: data.color, displayOrder: data.display_order, createdAt: data.created_at };
    setCategories(prev => [...prev, cat]);
    return cat;
  };

  const deleteCategory = async (id: string) => {
    await supabase.from('portfolio_offer_categories').delete().eq('id', id);
    setCategories(prev => prev.filter(c => c.id !== id));
  };

  // Offer types
  const createOfferType = async (name: string): Promise<OfferType | null> => {
    const { data, error } = await supabase
      .from('portfolio_offer_types')
      .insert({ name })
      .select().single();
    if (error || !data) { showError('Error', 'No se pudo crear el tipo'); return null; }
    const t: OfferType = { id: data.id, name: data.name, createdAt: data.created_at };
    setOfferTypes(prev => [...prev, t]);
    return t;
  };

  const deleteOfferType = async (id: string) => {
    await supabase.from('portfolio_offer_types').delete().eq('id', id);
    setOfferTypes(prev => prev.filter(t => t.id !== id));
  };

  // Offers
  const createOffer = async (data: Omit<PortfolioOffer, 'id' | 'createdAt' | 'updatedAt' | 'category' | 'stages'>): Promise<PortfolioOffer | null> => {
    const { data: row, error } = await supabase
      .from('portfolio_offers')
      .insert({
        name: data.name, description: data.description, type: data.type || 'service',
        product: (data as any).product || '',
        category_id: data.categoryId, start_date: data.startDate,
        end_date: data.endDate, status: data.status,
      } as any)
      .select().single();
    if (error || !row) { showError('Error', 'No se pudo crear la oferta'); return null; }

    const offer: PortfolioOffer = {
      id: row.id, name: row.name, description: row.description,
      type: row.type, product: (row as any).product || '',
      categoryId: row.category_id,
      startDate: row.start_date, endDate: row.end_date,
      status: row.status as any, createdAt: row.created_at, updatedAt: row.updated_at,
    };

    // Auto-create default stage
    const { data: stageRow } = await supabase
      .from('pipeline_stages')
      .insert({ offer_id: row.id, name: 'Sin estado', color: '#64748b', icon: 'Circle', display_order: 0 })
      .select().single();

    if (stageRow) {
      setStages(prev => [...prev, {
        id: stageRow.id, offerId: stageRow.offer_id, name: stageRow.name,
        color: stageRow.color, icon: stageRow.icon, displayOrder: stageRow.display_order,
        createdAt: stageRow.created_at,
      }]);
    }

    setOffers(prev => [offer, ...prev]);
    showSuccess('Oferta creada', `"${offer.name}" fue creada con su pipeline`);
    return offer;
  };

  const updateOffer = async (id: string, data: Partial<PortfolioOffer>) => {
    const { error } = await supabase.from('portfolio_offers').update({
      name: data.name, description: data.description, type: data.type || 'service',
      product: data.product || '',
      category_id: data.categoryId, start_date: data.startDate,
      end_date: data.endDate, status: data.status,
    } as any).eq('id', id);
    if (error) { showError('Error', 'No se pudo actualizar la oferta'); return; }
    setOffers(prev => prev.map(o => o.id === id ? { ...o, ...data } : o));
    showSuccess('Oferta actualizada', '');
  };

  const deleteOffer = async (id: string) => {
    await supabase.from('portfolio_offers').delete().eq('id', id);
    setOffers(prev => prev.filter(o => o.id !== id));
    setStages(prev => prev.filter(s => s.offerId !== id));
    setEntries(prev => prev.filter(e => e.offerId !== id));
    setOfferAllies(prev => prev.filter(oa => oa.offerId !== id));
    showSuccess('Oferta eliminada', '');
  };

  // Stages
  const getStagesForOffer = (offerId: string) =>
    stages.filter(s => s.offerId === offerId).sort((a, b) => a.displayOrder - b.displayOrder);

  const createStage = async (offerId: string, name: string, color: string, icon: string): Promise<PipelineStage | null> => {
    const order = stages.filter(s => s.offerId === offerId).length;
    const { data, error } = await supabase
      .from('pipeline_stages')
      .insert({ offer_id: offerId, name, color, icon, display_order: order })
      .select().single();
    if (error || !data) { showError('Error', 'No se pudo crear la etapa'); return null; }
    const stage: PipelineStage = {
      id: data.id, offerId: data.offer_id, name: data.name,
      color: data.color, icon: data.icon, displayOrder: data.display_order,
      createdAt: data.created_at,
    };
    setStages(prev => [...prev, stage]);
    return stage;
  };

  const updateStage = async (id: string, data: Partial<PipelineStage>) => {
    await supabase.from('pipeline_stages').update({
      name: data.name, color: data.color, icon: data.icon,
    }).eq('id', id);
    setStages(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
  };

  const deleteStage = async (id: string, offerId: string) => {
    const remaining = stages.filter(s => s.offerId === offerId && s.id !== id).sort((a, b) => a.displayOrder - b.displayOrder);
    if (remaining.length > 0) {
      await supabase.from('pipeline_entries').update({ stage_id: remaining[0].id }).eq('stage_id', id);
      setEntries(prev => prev.map(e => e.stageId === id ? { ...e, stageId: remaining[0].id } : e));
    } else {
      await supabase.from('pipeline_entries').delete().eq('stage_id', id);
      setEntries(prev => prev.filter(e => e.stageId !== id));
    }
    await supabase.from('pipeline_stages').delete().eq('id', id);
    setStages(prev => prev.filter(s => s.id !== id));
  };

  const reorderStages = async (offerId: string, orderedIds: string[]) => {
    const updates = orderedIds.map((id, idx) =>
      supabase.from('pipeline_stages').update({ display_order: idx }).eq('id', id)
    );
    await Promise.all(updates);
    setStages(prev => prev.map(s => {
      const idx = orderedIds.indexOf(s.id);
      return idx >= 0 ? { ...s, displayOrder: idx } : s;
    }));
  };

  // Entries
  const getEntriesForOffer = (offerId: string) => entries.filter(e => e.offerId === offerId);

  const addCompanyToStage = async (offerId: string, stageId: string, companyId: string, assignedTo?: string | null) => {
    if (isCompanyInOffer(offerId, companyId)) {
      showError('Ya existe', 'Esta empresa ya está en el pipeline de esta oferta'); return;
    }
    const userId = session?.user?.id || null;
    const finalAssignedTo = assignedTo !== undefined ? assignedTo : userId;
    const { data, error } = await supabase
      .from('pipeline_entries')
      .insert({ offer_id: offerId, stage_id: stageId, company_id: companyId, notes: '', added_by: userId, assigned_to: finalAssignedTo } as any)
      .select().single();
    if (error || !data) { showError('Error', 'No se pudo agregar la empresa'); return; }
    setEntries(prev => [...prev, {
      id: data.id, offerId: data.offer_id, stageId: data.stage_id,
      companyId: data.company_id, notes: data.notes, addedBy: (data as any).added_by || null,
      assignedTo: (data as any).assigned_to || null,
      createdAt: data.created_at,
    }]);
    showSuccess('Empresa agregada', 'La empresa fue agregada al pipeline');
  };

  const moveCompanyToStage = async (entryId: string, newStageId: string) => {
    await supabase.from('pipeline_entries').update({ stage_id: newStageId }).eq('id', entryId);
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, stageId: newStageId } : e));
  };

  const removeEntry = async (entryId: string) => {
    await supabase.from('pipeline_entries').delete().eq('id', entryId);
    setEntries(prev => prev.filter(e => e.id !== entryId));
    showSuccess('Empresa removida', '');
  };

  const isCompanyInOffer = (offerId: string, companyId: string) =>
    entries.some(e => e.offerId === offerId && e.companyId === companyId);

  // Allies
  const createAlly = async (name: string, logo?: string | null): Promise<Ally | null> => {
    const { data, error } = await supabase.from('allies').insert({ name, logo: logo || null } as any).select().single();
    if (error || !data) { showError('Error', 'No se pudo crear el aliado'); return null; }
    const ally: Ally = { id: (data as any).id, name: (data as any).name, logo: (data as any).logo, createdAt: (data as any).created_at };
    setAllies(prev => [...prev, ally]);
    showSuccess('Aliado creado', `"${ally.name}" fue creado`);
    return ally;
  };

  const updateAlly = async (id: string, data: Partial<Ally>) => {
    await supabase.from('allies').update({ name: data.name, logo: data.logo } as any).eq('id', id);
    setAllies(prev => prev.map(a => a.id === id ? { ...a, ...data } : a));
  };

  const deleteAlly = async (id: string) => {
    await supabase.from('allies').delete().eq('id', id);
    setAllies(prev => prev.filter(a => a.id !== id));
    setOfferAllies(prev => prev.filter(oa => oa.allyId !== id));
    showSuccess('Aliado eliminado', '');
  };

  const addAllyContact = async (allyId: string, contact: Omit<AllyContact, 'id' | 'allyId' | 'createdAt'>): Promise<AllyContact | null> => {
    const { data, error } = await supabase.from('ally_contacts').insert({
      ally_id: allyId, name: contact.name, position: contact.position,
      email: contact.email, phone: contact.phone, notes: contact.notes,
      is_primary: contact.isPrimary,
    } as any).select().single();
    if (error || !data) { showError('Error', 'No se pudo crear el contacto'); return null; }
    const c: AllyContact = {
      id: (data as any).id, allyId: (data as any).ally_id, name: (data as any).name,
      position: (data as any).position, email: (data as any).email, phone: (data as any).phone,
      notes: (data as any).notes, isPrimary: (data as any).is_primary, createdAt: (data as any).created_at,
    };
    setAllyContacts(prev => [...prev, c]);
    return c;
  };

  const updateAllyContact = async (id: string, data: Partial<AllyContact>) => {
    await supabase.from('ally_contacts').update({
      name: data.name, position: data.position, email: data.email,
      phone: data.phone, notes: data.notes, is_primary: data.isPrimary,
    } as any).eq('id', id);
    setAllyContacts(prev => prev.map(c => c.id === id ? { ...c, ...data } : c));
  };

  const deleteAllyContact = async (id: string) => {
    await supabase.from('ally_contacts').delete().eq('id', id);
    setAllyContacts(prev => prev.filter(c => c.id !== id));
  };

  const linkAllyToOffer = async (offerId: string, allyId: string) => {
    if (offerAllies.some(oa => oa.offerId === offerId && oa.allyId === allyId)) return;
    const { data, error } = await supabase.from('offer_allies').insert({ offer_id: offerId, ally_id: allyId } as any).select().single();
    if (error || !data) return;
    setOfferAllies(prev => [...prev, { id: (data as any).id, offerId: (data as any).offer_id, allyId: (data as any).ally_id, createdAt: (data as any).created_at }]);
  };

  const unlinkAllyFromOffer = async (offerId: string, allyId: string) => {
    await supabase.from('offer_allies').delete().match({ offer_id: offerId, ally_id: allyId } as any);
    setOfferAllies(prev => prev.filter(oa => !(oa.offerId === offerId && oa.allyId === allyId)));
  };

  const getAlliesForOffer = (offerId: string): Ally[] => {
    const allyIds = offerAllies.filter(oa => oa.offerId === offerId).map(oa => oa.allyId);
    return allies.filter(a => allyIds.includes(a.id));
  };

  const getContactsForAlly = (allyId: string): AllyContact[] => {
    return allyContacts.filter(c => c.allyId === allyId);
  };

  return (
    <PortfolioContext.Provider value={{
      categories, offerTypes, offers, stages, entries, allies, offerAllies, loading,
      createCategory, deleteCategory,
      createOfferType, deleteOfferType,
      createOffer, updateOffer, deleteOffer,
      getStagesForOffer, createStage, updateStage, deleteStage, reorderStages,
      getEntriesForOffer, addCompanyToStage, moveCompanyToStage, removeEntry, isCompanyInOffer,
      createAlly, updateAlly, deleteAlly, addAllyContact, updateAllyContact, deleteAllyContact,
      linkAllyToOffer, unlinkAllyFromOffer, getAlliesForOffer, getContactsForAlly,
      refresh: fetchAll,
    }}>
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio() {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error('usePortfolio must be used within PortfolioProvider');
  return ctx;
}
