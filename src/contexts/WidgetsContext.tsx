import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { SectionWidget } from '@/types/widgets';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface WidgetsContextType {
  widgets: SectionWidget[];
  loading: boolean;
  addWidget: (widget: Omit<SectionWidget, 'id' | 'displayOrder'>) => Promise<SectionWidget | null>;
  updateWidget: (widget: SectionWidget) => Promise<void>;
  deleteWidget: (id: string) => Promise<void>;
  reorderWidgets: (sectionId: string, ids: string[]) => Promise<void>;
  refresh: () => Promise<void>;
}

const WidgetsContext = createContext<WidgetsContextType | null>(null);

const fromRow = (r: any): SectionWidget => ({
  id: r.id,
  sectionId: r.section_id,
  title: r.title,
  widgetType: r.widget_type,
  sourceType: r.source_type,
  sourceKey: r.source_key,
  calculation: r.calculation,
  config: r.config || {},
  displayOrder: r.display_order,
});

export function WidgetsProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [widgets, setWidgets] = useState<SectionWidget[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!session) { setWidgets([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await (supabase as any).from('section_widgets').select('*').order('display_order');
    setWidgets((data || []).map(fromRow));
    setLoading(false);
  }, [session]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const addWidget = useCallback(async (w: Omit<SectionWidget, 'id' | 'displayOrder'>) => {
    const maxOrder = widgets.filter(x => x.sectionId === w.sectionId).reduce((m, x) => Math.max(m, x.displayOrder), -1);
    const { data, error } = await (supabase as any).from('section_widgets').insert({
      section_id: w.sectionId,
      title: w.title,
      widget_type: w.widgetType,
      source_type: w.sourceType,
      source_key: w.sourceKey,
      calculation: w.calculation,
      config: w.config,
      display_order: maxOrder + 1,
    }).select().single();
    if (error || !data) return null;
    await fetchAll();
    return fromRow(data);
  }, [widgets, fetchAll]);

  const updateWidget = useCallback(async (w: SectionWidget) => {
    await (supabase as any).from('section_widgets').update({
      title: w.title,
      widget_type: w.widgetType,
      source_type: w.sourceType,
      source_key: w.sourceKey,
      calculation: w.calculation,
      config: w.config,
    }).eq('id', w.id);
    await fetchAll();
  }, [fetchAll]);

  const deleteWidget = useCallback(async (id: string) => {
    await (supabase as any).from('section_widgets').delete().eq('id', id);
    await fetchAll();
  }, [fetchAll]);

  const reorderWidgets = useCallback(async (_sectionId: string, ids: string[]) => {
    await Promise.all(ids.map((id, idx) =>
      (supabase as any).from('section_widgets').update({ display_order: idx }).eq('id', id)
    ));
    await fetchAll();
  }, [fetchAll]);

  return (
    <WidgetsContext.Provider value={{ widgets, loading, addWidget, updateWidget, deleteWidget, reorderWidgets, refresh: fetchAll }}>
      {children}
    </WidgetsContext.Provider>
  );
}

export function useWidgets() {
  const ctx = useContext(WidgetsContext);
  if (!ctx) throw new Error('useWidgets must be used within WidgetsProvider');
  return ctx;
}
