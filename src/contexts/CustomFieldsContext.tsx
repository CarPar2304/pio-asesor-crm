import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { CustomSection, CustomField } from '@/types/crm';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface CustomFieldsContextType {
  sections: CustomSection[];
  fields: CustomField[];
  loading: boolean;
  addSection: (name: string) => Promise<CustomSection | null>;
  updateSection: (id: string, name: string) => Promise<void>;
  deleteSection: (id: string) => Promise<void>;
  addField: (field: Omit<CustomField, 'id'>) => Promise<CustomField | null>;
  updateField: (field: CustomField) => Promise<void>;
  deleteField: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const CustomFieldsContext = createContext<CustomFieldsContextType | null>(null);

export function CustomFieldsProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [sections, setSections] = useState<CustomSection[]>([]);
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!session) { setSections([]); setFields([]); setLoading(false); return; }
    setLoading(true);

    const [sectionsRes, fieldsRes] = await Promise.all([
      supabase.from('custom_sections').select('*').order('display_order'),
      supabase.from('custom_fields').select('*').order('display_order'),
    ]);

    setSections((sectionsRes.data || []).map((s: any) => ({
      id: s.id, name: s.name, displayOrder: s.display_order,
    })));

    setFields((fieldsRes.data || []).map((f: any) => ({
      id: f.id, sectionId: f.section_id, name: f.name,
      fieldType: f.field_type, options: f.options || [],
      displayOrder: f.display_order,
    })));

    setLoading(false);
  }, [session]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const addSection = useCallback(async (name: string) => {
    const maxOrder = sections.reduce((m, s) => Math.max(m, s.displayOrder), -1);
    const { data, error } = await supabase.from('custom_sections').insert({
      name, display_order: maxOrder + 1,
    } as any).select().single();
    if (error || !data) return null;
    await fetchAll();
    return { id: data.id, name: data.name, displayOrder: data.display_order } as CustomSection;
  }, [sections, fetchAll]);

  const updateSection = useCallback(async (id: string, name: string) => {
    await supabase.from('custom_sections').update({ name } as any).eq('id', id);
    await fetchAll();
  }, [fetchAll]);

  const deleteSection = useCallback(async (id: string) => {
    await supabase.from('custom_sections').delete().eq('id', id);
    await fetchAll();
  }, [fetchAll]);

  const addField = useCallback(async (field: Omit<CustomField, 'id'>) => {
    const maxOrder = fields.filter(f => f.sectionId === field.sectionId).reduce((m, f) => Math.max(m, f.displayOrder), -1);
    const { data, error } = await supabase.from('custom_fields').insert({
      section_id: field.sectionId,
      name: field.name,
      field_type: field.fieldType,
      options: field.options,
      display_order: maxOrder + 1,
    } as any).select().single();
    if (error || !data) return null;
    await fetchAll();
    return { id: data.id, sectionId: data.section_id, name: data.name, fieldType: data.field_type, options: data.options || [], displayOrder: data.display_order } as CustomField;
  }, [fields, fetchAll]);

  const updateField = useCallback(async (field: CustomField) => {
    await supabase.from('custom_fields').update({
      name: field.name, field_type: field.fieldType, options: field.options, section_id: field.sectionId,
    } as any).eq('id', field.id);
    await fetchAll();
  }, [fetchAll]);

  const deleteField = useCallback(async (id: string) => {
    await supabase.from('custom_fields').delete().eq('id', id);
    await fetchAll();
  }, [fetchAll]);

  return (
    <CustomFieldsContext.Provider value={{
      sections, fields, loading,
      addSection, updateSection, deleteSection,
      addField, updateField, deleteField,
      refresh: fetchAll,
    }}>
      {children}
    </CustomFieldsContext.Provider>
  );
}

export function useCustomFields() {
  const ctx = useContext(CustomFieldsContext);
  if (!ctx) throw new Error('useCustomFields must be used within CustomFieldsProvider');
  return ctx;
}
