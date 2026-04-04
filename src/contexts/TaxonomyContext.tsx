import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCRM } from '@/contexts/CRMContext';
import { CATEGORIES } from '@/types/crm';

export interface TaxonomyVertical {
  id: string;
  name: string;
}

export interface TaxonomySubVertical {
  id: string;
  name: string;
}

export interface CategoryVerticalLink {
  id: string;
  category: string;
  vertical_id: string;
}

export interface VerticalSubVerticalLink {
  id: string;
  vertical_id: string;
  sub_vertical_id: string;
}

export interface TaxonomyCategory {
  id: string;
  name: string;
  level1_label: string;
  level2_label: string;
}

interface TaxonomyContextType {
  verticals: TaxonomyVertical[];
  subVerticals: TaxonomySubVertical[];
  categoryVerticalLinks: CategoryVerticalLink[];
  verticalSubVerticalLinks: VerticalSubVerticalLink[];
  categories: TaxonomyCategory[];
  allCategories: string[];
  loading: boolean;

  // Orphan values from companies
  orphanVerticals: string[];
  orphanSubVerticals: string[];

  // Queries
  getVerticalsForCategory: (category: string) => TaxonomyVertical[];
  getSubVerticalsForVertical: (verticalName: string) => TaxonomySubVertical[];
  getAllVerticalNames: () => string[];
  getAllSubVerticalNames: () => string[];
  getCategoryConfig: (name: string) => TaxonomyCategory | undefined;

  // Mutations
  addVertical: (name: string) => Promise<TaxonomyVertical | null>;
  addSubVertical: (name: string) => Promise<TaxonomySubVertical | null>;
  renameVertical: (id: string, name: string) => Promise<void>;
  renameSubVertical: (id: string, name: string) => Promise<void>;
  deleteVertical: (id: string) => Promise<void>;
  deleteSubVertical: (id: string) => Promise<void>;
  linkCategoryVertical: (category: string, verticalId: string) => Promise<void>;
  unlinkCategoryVertical: (category: string, verticalId: string) => Promise<void>;
  linkVerticalSubVertical: (verticalId: string, subVerticalId: string) => Promise<void>;
  unlinkVerticalSubVertical: (verticalId: string, subVerticalId: string) => Promise<void>;
  addCategory: (name: string) => Promise<TaxonomyCategory | null>;
  deleteCategory: (name: string) => Promise<void>;
  renameCategory: (oldName: string, newName: string) => Promise<void>;
  updateCategoryLabels: (name: string, level1: string, level2: string) => Promise<void>;
  renameOrphanVerticalName: (oldName: string, newName: string) => Promise<void>;
  renameOrphanSubVerticalName: (oldName: string, newName: string) => Promise<void>;
  clearOrphanVerticalName: (name: string) => Promise<void>;
  clearOrphanSubVerticalName: (name: string) => Promise<void>;
  mergeVerticalName: (oldName: string, targetVerticalId: string) => Promise<void>;
  mergeVertical: (sourceId: string, targetId: string) => Promise<void>;
  mergeSubVerticalName: (oldName: string, targetSubVerticalId: string) => Promise<void>;
  mergeSubVertical: (sourceId: string, targetId: string) => Promise<void>;
  shareVerticalWithCategory: (verticalId: string, category: string) => Promise<void>;
  shareSubVerticalWithVertical: (subVerticalId: string, verticalId: string) => Promise<void>;
  moveVerticalToCategory: (verticalId: string, fromCategory: string, toCategory: string) => Promise<void>;
  moveSubVerticalToVertical: (subVerticalId: string, fromVerticalId: string, toVerticalId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const TaxonomyContext = createContext<TaxonomyContextType | null>(null);

export function TaxonomyProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const { companies, updateCompany, refresh: refreshCRM } = useCRM();
  const [verticals, setVerticals] = useState<TaxonomyVertical[]>([]);
  const [subVerticals, setSubVerticals] = useState<TaxonomySubVertical[]>([]);
  const [categoryVerticalLinks, setCategoryVerticalLinks] = useState<CategoryVerticalLink[]>([]);
  const [verticalSubVerticalLinks, setVerticalSubVerticalLinks] = useState<VerticalSubVerticalLink[]>([]);
  const [categories, setCategories] = useState<TaxonomyCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!session) return;
    const [vRes, svRes, cvRes, vsvRes, catRes] = await Promise.all([
      supabase.from('crm_verticals').select('*').order('name'),
      supabase.from('crm_sub_verticals').select('*').order('name'),
      supabase.from('crm_category_verticals').select('*'),
      supabase.from('crm_vertical_sub_verticals').select('*'),
      supabase.from('crm_categories').select('*').order('name'),
    ]);
    setVerticals((vRes.data as any[]) || []);
    setSubVerticals((svRes.data as any[]) || []);
    setCategoryVerticalLinks((cvRes.data as any[]) || []);
    setVerticalSubVerticalLinks((vsvRes.data as any[]) || []);
    setCategories((catRes.data as any[]) || []);
    setLoading(false);
  }, [session]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Derive all categories
  const allCategories = useMemo(() => {
    const cats = new Set<string>(CATEGORIES);
    categories.forEach(c => cats.add(c.name));
    categoryVerticalLinks.forEach(l => cats.add(l.category));
    companies.forEach(c => { if (c.category) cats.add(c.category); });
    return Array.from(cats).sort();
  }, [categoryVerticalLinks, companies, categories]);

  // Orphan verticals: values in companies not in crm_verticals
  const orphanVerticals = useMemo(() => {
    const managed = new Set(verticals.map(v => v.name));
    const all = new Set<string>();
    companies.forEach(c => { if (c.vertical && c.vertical.trim()) all.add(c.vertical); });
    return Array.from(all).filter(v => !managed.has(v)).sort();
  }, [companies, verticals]);

  // Orphan sub-verticals
  const orphanSubVerticals = useMemo(() => {
    const managed = new Set(subVerticals.map(sv => sv.name));
    const all = new Set<string>();
    companies.forEach(c => { if (c.economicActivity && c.economicActivity.trim()) all.add(c.economicActivity); });
    return Array.from(all).filter(v => !managed.has(v)).sort();
  }, [companies, subVerticals]);

  const getCategoryConfig = useCallback((name: string) => {
    return categories.find(c => c.name === name);
  }, [categories]);

  const getVerticalsForCategory = useCallback((category: string) => {
    const linkedIds = categoryVerticalLinks.filter(l => l.category === category).map(l => l.vertical_id);
    if (linkedIds.length === 0) return verticals;
    return verticals.filter(v => linkedIds.includes(v.id));
  }, [categoryVerticalLinks, verticals]);

  const getSubVerticalsForVertical = useCallback((verticalName: string) => {
    const vertical = verticals.find(v => v.name === verticalName);
    if (!vertical) return [];
    const linkedIds = verticalSubVerticalLinks.filter(l => l.vertical_id === vertical.id).map(l => l.sub_vertical_id);
    if (linkedIds.length === 0) return [];
    return subVerticals.filter(sv => linkedIds.includes(sv.id));
  }, [verticals, subVerticals, verticalSubVerticalLinks]);

  const getAllVerticalNames = useCallback(() => verticals.map(v => v.name), [verticals]);
  const getAllSubVerticalNames = useCallback(() => subVerticals.map(sv => sv.name), [subVerticals]);

  const addVertical = useCallback(async (name: string) => {
    const { data, error } = await supabase.from('crm_verticals').insert({ name }).select().single();
    if (error || !data) return null;
    const v = data as any as TaxonomyVertical;
    setVerticals(prev => [...prev, v].sort((a, b) => a.name.localeCompare(b.name)));
    return v;
  }, []);

  const addSubVertical = useCallback(async (name: string) => {
    const { data, error } = await supabase.from('crm_sub_verticals').insert({ name }).select().single();
    if (error || !data) return null;
    const sv = data as any as TaxonomySubVertical;
    setSubVerticals(prev => [...prev, sv].sort((a, b) => a.name.localeCompare(b.name)));
    return sv;
  }, []);

  const renameVertical = useCallback(async (id: string, name: string) => {
    const current = verticals.find(v => v.id === id);
    if (!current) return;

    await Promise.all([
      supabase.from('crm_verticals').update({ name }).eq('id', id),
      supabase.from('companies').update({ vertical: name }).eq('vertical', current.name),
    ]);

    await Promise.all([fetchAll(), refreshCRM()]);
  }, [verticals, fetchAll, refreshCRM]);

  const renameSubVertical = useCallback(async (id: string, name: string) => {
    const current = subVerticals.find(sv => sv.id === id);
    if (!current) return;

    await Promise.all([
      supabase.from('crm_sub_verticals').update({ name }).eq('id', id),
      supabase.from('companies').update({ economic_activity: name }).eq('economic_activity', current.name),
    ]);

    await Promise.all([fetchAll(), refreshCRM()]);
  }, [subVerticals, fetchAll, refreshCRM]);

  const deleteVertical = useCallback(async (id: string) => {
    await supabase.from('crm_verticals').delete().eq('id', id);
    setVerticals(prev => prev.filter(v => v.id !== id));
    setCategoryVerticalLinks(prev => prev.filter(l => l.vertical_id !== id));
    setVerticalSubVerticalLinks(prev => prev.filter(l => l.vertical_id !== id));
  }, []);

  const deleteSubVertical = useCallback(async (id: string) => {
    await supabase.from('crm_sub_verticals').delete().eq('id', id);
    setSubVerticals(prev => prev.filter(sv => sv.id !== id));
    setVerticalSubVerticalLinks(prev => prev.filter(l => l.sub_vertical_id !== id));
  }, []);

  const linkCategoryVertical = useCallback(async (category: string, verticalId: string) => {
    const { data } = await supabase.from('crm_category_verticals').insert({ category, vertical_id: verticalId }).select().single();
    if (data) setCategoryVerticalLinks(prev => [...prev, data as any]);
  }, []);

  const unlinkCategoryVertical = useCallback(async (category: string, verticalId: string) => {
    await supabase.from('crm_category_verticals').delete().eq('category', category).eq('vertical_id', verticalId);
    setCategoryVerticalLinks(prev => prev.filter(l => !(l.category === category && l.vertical_id === verticalId)));
  }, []);

  const linkVerticalSubVertical = useCallback(async (verticalId: string, subVerticalId: string) => {
    const { data } = await supabase.from('crm_vertical_sub_verticals').insert({ vertical_id: verticalId, sub_vertical_id: subVerticalId }).select().single();
    if (data) setVerticalSubVerticalLinks(prev => [...prev, data as any]);
  }, []);

  const unlinkVerticalSubVertical = useCallback(async (verticalId: string, subVerticalId: string) => {
    await supabase.from('crm_vertical_sub_verticals').delete().eq('vertical_id', verticalId).eq('sub_vertical_id', subVerticalId);
    setVerticalSubVerticalLinks(prev => prev.filter(l => !(l.vertical_id === verticalId && l.sub_vertical_id === subVerticalId)));
  }, []);

  const addCategory = useCallback(async (name: string) => {
    const { data, error } = await supabase.from('crm_categories').insert({ name }).select().single();
    if (error || !data) return null;
    const cat = data as any as TaxonomyCategory;
    setCategories(prev => [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)));
    return cat;
  }, []);

  const deleteCategory = useCallback(async (name: string) => {
    await supabase.from('crm_category_verticals').delete().eq('category', name);
    await supabase.from('crm_categories').delete().eq('name', name);
    setCategoryVerticalLinks(prev => prev.filter(l => l.category !== name));
    setCategories(prev => prev.filter(c => c.name !== name));
  }, []);

  const renameCategory = useCallback(async (oldName: string, newName: string) => {
    const links = categoryVerticalLinks.filter(l => l.category === oldName);
    await Promise.all([
      supabase.from('crm_categories').update({ name: newName }).eq('name', oldName),
      supabase.from('companies').update({ category: newName }).eq('category', oldName),
      ...links.map(link => supabase.from('crm_category_verticals').update({ category: newName }).eq('id', link.id)),
    ]);

    await Promise.all([fetchAll(), refreshCRM()]);
  }, [categoryVerticalLinks, fetchAll, refreshCRM]);

  const updateCategoryLabels = useCallback(async (name: string, level1: string, level2: string) => {
    await supabase.from('crm_categories').update({ level1_label: level1, level2_label: level2 }).eq('name', name);
    setCategories(prev => prev.map(c => c.name === name ? { ...c, level1_label: level1, level2_label: level2 } : c));
  }, []);

  const renameOrphanVerticalName = useCallback(async (oldName: string, newName: string) => {
    await supabase.from('companies').update({ vertical: newName }).eq('vertical', oldName);
    await refreshCRM();
  }, [refreshCRM]);

  const renameOrphanSubVerticalName = useCallback(async (oldName: string, newName: string) => {
    await supabase.from('companies').update({ economic_activity: newName }).eq('economic_activity', oldName);
    await refreshCRM();
  }, [refreshCRM]);

  const clearOrphanVerticalName = useCallback(async (name: string) => {
    await supabase.from('companies').update({ vertical: '' }).eq('vertical', name);
    await refreshCRM();
  }, [refreshCRM]);

  const clearOrphanSubVerticalName = useCallback(async (name: string) => {
    await supabase.from('companies').update({ economic_activity: '' }).eq('economic_activity', name);
    await refreshCRM();
  }, [refreshCRM]);

  // Merge orphan vertical name into a managed vertical (updates all companies)
  const mergeVerticalName = useCallback(async (oldName: string, targetVerticalId: string) => {
    const target = verticals.find(v => v.id === targetVerticalId);
    if (!target) return;
    // Use direct DB update for all matching companies (not filtered by stale state)
    await supabase.from('companies').update({ vertical: target.name }).eq('vertical', oldName);
    await Promise.all([fetchAll(), refreshCRM()]);
  }, [verticals, fetchAll, refreshCRM]);

  const mergeSubVerticalName = useCallback(async (oldName: string, targetSubVerticalId: string) => {
    const target = subVerticals.find(sv => sv.id === targetSubVerticalId);
    if (!target) return;
    await supabase.from('companies').update({ economic_activity: target.name }).eq('economic_activity', oldName);
    await Promise.all([fetchAll(), refreshCRM()]);
  }, [subVerticals, fetchAll, refreshCRM]);

  // Merge a managed vertical into another managed vertical (re-assigns companies, moves links, deletes source)
  const mergeVertical = useCallback(async (sourceId: string, targetId: string) => {
    const source = verticals.find(v => v.id === sourceId);
    const target = verticals.find(v => v.id === targetId);
    if (!source || !target) return;
    // Update all companies using source name to target name (direct DB query)
    await supabase.from('companies').update({ vertical: target.name }).eq('vertical', source.name);
    // Move sub-vertical links from source to target (avoid duplicates)
    const sourceLinks = verticalSubVerticalLinks.filter(l => l.vertical_id === sourceId);
    const targetLinkedSvIds = new Set(verticalSubVerticalLinks.filter(l => l.vertical_id === targetId).map(l => l.sub_vertical_id));
    for (const link of sourceLinks) {
      if (!targetLinkedSvIds.has(link.sub_vertical_id)) {
        await supabase.from('crm_vertical_sub_verticals').insert({ vertical_id: targetId, sub_vertical_id: link.sub_vertical_id });
      }
    }
    // Move category links from source to target (avoid duplicates)
    const sourceCatLinks = categoryVerticalLinks.filter(l => l.vertical_id === sourceId);
    const targetCatNames = new Set(categoryVerticalLinks.filter(l => l.vertical_id === targetId).map(l => l.category));
    for (const link of sourceCatLinks) {
      if (!targetCatNames.has(link.category)) {
        await supabase.from('crm_category_verticals').insert({ category: link.category, vertical_id: targetId });
      }
    }
    // Delete source vertical (cascades links)
    await supabase.from('crm_verticals').delete().eq('id', sourceId);
    await Promise.all([fetchAll(), refreshCRM()]);
  }, [verticals, verticalSubVerticalLinks, categoryVerticalLinks, fetchAll, refreshCRM]);

  // Merge a managed sub-vertical into another managed sub-vertical
  const mergeSubVertical = useCallback(async (sourceId: string, targetId: string) => {
    const source = subVerticals.find(sv => sv.id === sourceId);
    const target = subVerticals.find(sv => sv.id === targetId);
    if (!source || !target) return;
    // Update all companies using source name to target name (direct DB query)
    await supabase.from('companies').update({ economic_activity: target.name }).eq('economic_activity', source.name);
    // Move vertical links from source to target (avoid duplicates)
    const sourceLinks = verticalSubVerticalLinks.filter(l => l.sub_vertical_id === sourceId);
    const targetLinkedVIds = new Set(verticalSubVerticalLinks.filter(l => l.sub_vertical_id === targetId).map(l => l.vertical_id));
    for (const link of sourceLinks) {
      if (!targetLinkedVIds.has(link.vertical_id)) {
        await supabase.from('crm_vertical_sub_verticals').insert({ vertical_id: link.vertical_id, sub_vertical_id: targetId });
      }
    }
    // Delete source sub-vertical (cascades links)
    await supabase.from('crm_sub_verticals').delete().eq('id', sourceId);
    await Promise.all([fetchAll(), refreshCRM()]);
  }, [subVerticals, verticalSubVerticalLinks, fetchAll, refreshCRM]);

  // Share vertical with an additional category (link without unlinking from current)
  const shareVerticalWithCategory = useCallback(async (verticalId: string, category: string) => {
    const existing = categoryVerticalLinks.find(l => l.vertical_id === verticalId && l.category === category);
    if (existing) return;
    const { data } = await supabase.from('crm_category_verticals').insert({ category, vertical_id: verticalId }).select().single();
    if (data) setCategoryVerticalLinks(prev => [...prev, data as any]);
  }, [categoryVerticalLinks]);

  // Share sub-vertical with an additional vertical
  const shareSubVerticalWithVertical = useCallback(async (subVerticalId: string, verticalId: string) => {
    const existing = verticalSubVerticalLinks.find(l => l.sub_vertical_id === subVerticalId && l.vertical_id === verticalId);
    if (existing) return;
    const { data } = await supabase.from('crm_vertical_sub_verticals').insert({ vertical_id: verticalId, sub_vertical_id: subVerticalId }).select().single();
    if (data) setVerticalSubVerticalLinks(prev => [...prev, data as any]);
  }, [verticalSubVerticalLinks]);

  // Move vertical from one category to another
  const moveVerticalToCategory = useCallback(async (verticalId: string, fromCategory: string, toCategory: string) => {
    await supabase.from('crm_category_verticals').delete().eq('category', fromCategory).eq('vertical_id', verticalId);
    setCategoryVerticalLinks(prev => prev.filter(l => !(l.category === fromCategory && l.vertical_id === verticalId)));
    const { data } = await supabase.from('crm_category_verticals').insert({ category: toCategory, vertical_id: verticalId }).select().single();
    if (data) setCategoryVerticalLinks(prev => [...prev, data as any]);
  }, []);

  // Move sub-vertical from one vertical to another
  const moveSubVerticalToVertical = useCallback(async (subVerticalId: string, fromVerticalId: string, toVerticalId: string) => {
    await supabase.from('crm_vertical_sub_verticals').delete().eq('vertical_id', fromVerticalId).eq('sub_vertical_id', subVerticalId);
    setVerticalSubVerticalLinks(prev => prev.filter(l => !(l.vertical_id === fromVerticalId && l.sub_vertical_id === subVerticalId)));
    const { data } = await supabase.from('crm_vertical_sub_verticals').insert({ vertical_id: toVerticalId, sub_vertical_id: subVerticalId }).select().single();
    if (data) setVerticalSubVerticalLinks(prev => [...prev, data as any]);
  }, []);

  return (
    <TaxonomyContext.Provider value={{
      verticals, subVerticals, categoryVerticalLinks, verticalSubVerticalLinks,
      categories, allCategories, loading,
      orphanVerticals, orphanSubVerticals,
      getVerticalsForCategory, getSubVerticalsForVertical, getAllVerticalNames, getAllSubVerticalNames,
      getCategoryConfig,
      addVertical, addSubVertical, renameVertical, renameSubVertical, deleteVertical, deleteSubVertical,
      linkCategoryVertical, unlinkCategoryVertical, linkVerticalSubVertical, unlinkVerticalSubVertical,
      addCategory, deleteCategory, renameCategory, updateCategoryLabels,
      renameOrphanVerticalName, renameOrphanSubVerticalName,
      clearOrphanVerticalName, clearOrphanSubVerticalName,
      mergeVerticalName, mergeVertical, mergeSubVerticalName, mergeSubVertical,
      shareVerticalWithCategory, shareSubVerticalWithVertical,
      moveVerticalToCategory, moveSubVerticalToVertical,
      refresh: fetchAll,
    }}>
      {children}
    </TaxonomyContext.Provider>
  );
}

export function useTaxonomy() {
  const ctx = useContext(TaxonomyContext);
  if (!ctx) throw new Error('useTaxonomy must be used within TaxonomyProvider');
  return ctx;
}
