import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { OfferCategory, PortfolioOffer, PipelineStage, PipelineEntry } from '@/types/portfolio';
import { showSuccess, showError } from '@/lib/toast';

interface PortfolioContextValue {
  categories: OfferCategory[];
  offers: PortfolioOffer[];
  stages: PipelineStage[];
  entries: PipelineEntry[];
  loading: boolean;

  createCategory: (name: string, color: string) => Promise<OfferCategory | null>;
  deleteCategory: (id: string) => Promise<void>;

  createOffer: (data: Omit<PortfolioOffer, 'id' | 'createdAt' | 'updatedAt' | 'category' | 'stages'>) => Promise<PortfolioOffer | null>;
  updateOffer: (id: string, data: Partial<PortfolioOffer>) => Promise<void>;
  deleteOffer: (id: string) => Promise<void>;

  getStagesForOffer: (offerId: string) => PipelineStage[];
  createStage: (offerId: string, name: string, color: string, icon: string) => Promise<PipelineStage | null>;
  updateStage: (id: string, data: Partial<PipelineStage>) => Promise<void>;
  deleteStage: (id: string, offerId: string) => Promise<void>;
  reorderStages: (offerId: string, orderedIds: string[]) => Promise<void>;

  getEntriesForOffer: (offerId: string) => PipelineEntry[];
  addCompanyToStage: (offerId: string, stageId: string, companyId: string) => Promise<void>;
  moveCompanyToStage: (entryId: string, newStageId: string) => Promise<void>;
  removeEntry: (entryId: string) => Promise<void>;
  isCompanyInOffer: (offerId: string, companyId: string) => boolean;

  refresh: () => Promise<void>;
}

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<OfferCategory[]>([]);
  const [offers, setOffers] = useState<PortfolioOffer[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [entries, setEntries] = useState<PipelineEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, offRes, stgRes, entRes] = await Promise.all([
        supabase.from('portfolio_offer_categories').select('*').order('display_order'),
        supabase.from('portfolio_offers').select('*').order('created_at', { ascending: false }),
        supabase.from('pipeline_stages').select('*').order('display_order'),
        supabase.from('pipeline_entries').select('*').order('created_at'),
      ]);

      if (catRes.data) setCategories(catRes.data.map(r => ({
        id: r.id, name: r.name, color: r.color,
        displayOrder: r.display_order, createdAt: r.created_at,
      })));

      if (offRes.data) setOffers(offRes.data.map(r => ({
        id: r.id, name: r.name, description: r.description,
        type: r.type as any, categoryId: r.category_id,
        startDate: r.start_date, endDate: r.end_date,
        status: r.status as any, createdAt: r.created_at, updatedAt: r.updated_at,
      })));

      if (stgRes.data) setStages(stgRes.data.map(r => ({
        id: r.id, offerId: r.offer_id, name: r.name,
        color: r.color, icon: r.icon, displayOrder: r.display_order,
        createdAt: r.created_at,
      })));

      if (entRes.data) setEntries(entRes.data.map(r => ({
        id: r.id, offerId: r.offer_id, stageId: r.stage_id,
        companyId: r.company_id, notes: r.notes, createdAt: r.created_at,
      })));
    } finally {
      setLoading(false);
    }
  }, []);

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

  // Offers
  const createOffer = async (data: Omit<PortfolioOffer, 'id' | 'createdAt' | 'updatedAt' | 'category' | 'stages'>): Promise<PortfolioOffer | null> => {
    const { data: row, error } = await supabase
      .from('portfolio_offers')
      .insert({
        name: data.name, description: data.description, type: data.type,
        category_id: data.categoryId, start_date: data.startDate,
        end_date: data.endDate, status: data.status,
      })
      .select().single();
    if (error || !row) { showError('Error', 'No se pudo crear la oferta'); return null; }

    const offer: PortfolioOffer = {
      id: row.id, name: row.name, description: row.description,
      type: row.type as any, categoryId: row.category_id,
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
      name: data.name, description: data.description, type: data.type,
      category_id: data.categoryId, start_date: data.startDate,
      end_date: data.endDate, status: data.status,
    }).eq('id', id);
    if (error) { showError('Error', 'No se pudo actualizar la oferta'); return; }
    setOffers(prev => prev.map(o => o.id === id ? { ...o, ...data } : o));
    showSuccess('Oferta actualizada', '');
  };

  const deleteOffer = async (id: string) => {
    await supabase.from('portfolio_offers').delete().eq('id', id);
    setOffers(prev => prev.filter(o => o.id !== id));
    setStages(prev => prev.filter(s => s.offerId !== id));
    setEntries(prev => prev.filter(e => e.offerId !== id));
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
    // Move entries from deleted stage to the first remaining stage
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

  const addCompanyToStage = async (offerId: string, stageId: string, companyId: string) => {
    if (isCompanyInOffer(offerId, companyId)) {
      showError('Ya existe', 'Esta empresa ya está en el pipeline de esta oferta'); return;
    }
    const { data, error } = await supabase
      .from('pipeline_entries')
      .insert({ offer_id: offerId, stage_id: stageId, company_id: companyId, notes: '' })
      .select().single();
    if (error || !data) { showError('Error', 'No se pudo agregar la empresa'); return; }
    setEntries(prev => [...prev, {
      id: data.id, offerId: data.offer_id, stageId: data.stage_id,
      companyId: data.company_id, notes: data.notes, createdAt: data.created_at,
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

  return (
    <PortfolioContext.Provider value={{
      categories, offers, stages, entries, loading,
      createCategory, deleteCategory,
      createOffer, updateOffer, deleteOffer,
      getStagesForOffer, createStage, updateStage, deleteStage, reorderStages,
      getEntriesForOffer, addCompanyToStage, moveCompanyToStage, removeEntry, isCompanyInOffer,
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
