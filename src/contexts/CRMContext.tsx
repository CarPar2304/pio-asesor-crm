import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Company, CompanyAction, Milestone, CompanyTask, Contact, SavedView, CustomProperty, CustomFieldValue, MetricByYear } from '@/types/crm';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface CRMContextType {
  companies: Company[];
  savedViews: SavedView[];
  loading: boolean;
  addCompany: (company: Company) => Promise<string | null>;
  updateCompany: (company: Company) => Promise<void>;
  deleteCompany: (id: string) => Promise<void>;
  getCompany: (id: string) => Company | undefined;
  addAction: (companyId: string, action: CompanyAction) => Promise<void>;
  addMilestone: (companyId: string, milestone: Milestone) => Promise<void>;
  addTask: (companyId: string, task: CompanyTask) => Promise<void>;
  updateTask: (companyId: string, taskId: string, updates: Partial<CompanyTask>) => Promise<void>;
  addContact: (companyId: string, contact: Contact) => Promise<void>;
  updateContact: (companyId: string, contact: Contact) => Promise<void>;
  removeContact: (companyId: string, contactId: string) => Promise<void>;
  saveView: (view: SavedView) => Promise<void>;
  deleteView: (id: string) => Promise<void>;
  saveFieldValues: (companyId: string, values: CustomFieldValue[]) => Promise<void>;
  refresh: () => Promise<void>;
}

const CRMContext = createContext<CRMContextType | null>(null);

export function CRMProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [loading, setLoading] = useState(true);
  const hasLoadedOnce = useRef(false);

  const fetchAll = useCallback(async () => {
    if (!session) { setCompanies([]); setSavedViews([]); setLoading(false); return; }
    if (!hasLoadedOnce.current) setLoading(true);

    const [companiesRes, contactsRes, actionsRes, milestonesRes, tasksRes, propsRes, viewsRes, fieldValsRes] = await Promise.all([
      supabase.from('companies').select('*').order('created_at', { ascending: false }),
      supabase.from('contacts').select('*'),
      supabase.from('company_actions').select('*').order('date', { ascending: false }),
      supabase.from('milestones').select('*').order('date', { ascending: false }),
      supabase.from('company_tasks').select('*').order('due_date', { ascending: false }),
      supabase.from('custom_properties').select('*'),
      supabase.from('saved_views').select('*'),
      supabase.from('custom_field_values').select('*'),
    ]);

    const contactsByCompany = new Map<string, Contact[]>();
    (contactsRes.data || []).forEach((c: any) => {
      const list = contactsByCompany.get(c.company_id) || [];
      list.push({ id: c.id, name: c.name, position: c.position, email: c.email, phone: c.phone, notes: c.notes, isPrimary: c.is_primary, gender: c.gender || '' });
      contactsByCompany.set(c.company_id, list);
    });

    const actionsByCompany = new Map<string, CompanyAction[]>();
    (actionsRes.data || []).forEach((a: any) => {
      const list = actionsByCompany.get(a.company_id) || [];
      list.push({ id: a.id, type: a.type, description: a.description, date: a.date, notes: a.notes, createdBy: a.created_by });
      actionsByCompany.set(a.company_id, list);
    });

    const milestonesByCompany = new Map<string, Milestone[]>();
    (milestonesRes.data || []).forEach((m: any) => {
      const list = milestonesByCompany.get(m.company_id) || [];
      list.push({ id: m.id, type: m.type, title: m.title, description: m.description, date: m.date, createdBy: m.created_by });
      milestonesByCompany.set(m.company_id, list);
    });

    const tasksByCompany = new Map<string, CompanyTask[]>();
    (tasksRes.data || []).forEach((t: any) => {
      const list = tasksByCompany.get(t.company_id) || [];
      list.push({ id: t.id, title: t.title, description: t.description, status: t.status, dueDate: t.due_date, completedDate: t.completed_date, createdBy: t.created_by, assignedTo: t.assigned_to });
      tasksByCompany.set(t.company_id, list);
    });

    const propsByCompany = new Map<string, CustomProperty[]>();
    (propsRes.data || []).forEach((p: any) => {
      const list = propsByCompany.get(p.company_id) || [];
      list.push({ id: p.id, name: p.name, type: p.type, value: p.value, yearValues: p.year_values as MetricByYear });
      propsByCompany.set(p.company_id, list);
    });

    const fieldValsByCompany = new Map<string, CustomFieldValue[]>();
    (fieldValsRes.data || []).forEach((v: any) => {
      const list = fieldValsByCompany.get(v.company_id) || [];
      list.push({ id: v.id, companyId: v.company_id, fieldId: v.field_id, textValue: v.text_value || '', numberValue: v.number_value, yearValues: (v.year_values || {}) as MetricByYear });
      fieldValsByCompany.set(v.company_id, list);
    });

    const mapped: Company[] = (companiesRes.data || []).map((c: any) => ({
      id: c.id,
      tradeName: c.trade_name,
      legalName: c.legal_name,
      nit: c.nit,
      category: c.category,
      vertical: c.vertical,
      economicActivity: c.economic_activity,
      description: c.description,
      city: c.city,
      salesByYear: (c.sales_by_year || {}) as MetricByYear,
      exportsUSD: Number(c.exports_usd),
      website: c.website || '',
      logo: c.logo,
      contacts: contactsByCompany.get(c.id) || [],
      actions: actionsByCompany.get(c.id) || [],
      milestones: milestonesByCompany.get(c.id) || [],
      tasks: tasksByCompany.get(c.id) || [],
      customProperties: propsByCompany.get(c.id) || [],
      fieldValues: fieldValsByCompany.get(c.id) || [],
      createdAt: c.created_at,
    }));

    setCompanies(mapped);
    setSavedViews((viewsRes.data || []).map((v: any) => ({ id: v.id, name: v.name, filters: v.filters })));
    setLoading(false);
    hasLoadedOnce.current = true;
  }, [session]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const getCompany = useCallback((id: string) => companies.find(c => c.id === id), [companies]);

  const addCompany = useCallback(async (company: Company): Promise<string | null> => {
    const { data, error } = await supabase.from('companies').insert({
      trade_name: company.tradeName,
      legal_name: company.legalName,
      nit: company.nit,
      category: company.category,
      vertical: company.vertical,
      economic_activity: company.economicActivity,
      description: company.description,
      city: company.city,
      sales_by_year: company.salesByYear as any,
      exports_usd: company.exportsUSD,
      website: company.website || '',
      logo: company.logo,
    } as any).select().single();

    if (error || !data) return null;

    // Insert contacts
    if (company.contacts.length > 0) {
      await supabase.from('contacts').insert(
        company.contacts.filter(c => c.name.trim()).map(c => ({
          company_id: data.id,
          name: c.name,
          position: c.position,
          email: c.email,
          phone: c.phone,
          notes: c.notes,
          is_primary: c.isPrimary,
          gender: c.gender || '',
        })) as any
      );
    }

    await fetchAll();
    return data.id as string;
  }, [fetchAll]);

  const updateCompany = useCallback(async (company: Company) => {
    await supabase.from('companies').update({
      trade_name: company.tradeName,
      legal_name: company.legalName,
      nit: company.nit,
      category: company.category,
      vertical: company.vertical,
      economic_activity: company.economicActivity,
      description: company.description,
      city: company.city,
      sales_by_year: company.salesByYear as any,
      exports_usd: company.exportsUSD,
      website: company.website || '',
      logo: company.logo,
    } as any).eq('id', company.id);

    // Sync contacts: delete all and re-insert
    await supabase.from('contacts').delete().eq('company_id', company.id);
    if (company.contacts.length > 0) {
      await supabase.from('contacts').insert(
        company.contacts.filter(c => c.name.trim()).map(c => ({
          company_id: company.id,
          name: c.name,
          position: c.position,
          email: c.email,
          phone: c.phone,
          notes: c.notes,
          is_primary: c.isPrimary,
          gender: c.gender || '',
        })) as any
      );
    }

    await fetchAll();
  }, [fetchAll]);

  const deleteCompany = useCallback(async (id: string) => {
    await supabase.from('companies').delete().eq('id', id);
    await fetchAll();
  }, [fetchAll]);

  const addAction = useCallback(async (companyId: string, action: CompanyAction) => {
    await supabase.from('company_actions').insert({
      company_id: companyId,
      type: action.type,
      description: action.description,
      date: action.date,
      notes: action.notes,
      created_by: session?.user.id,
    });
    await fetchAll();
  }, [fetchAll, session]);

  const addMilestone = useCallback(async (companyId: string, milestone: Milestone) => {
    await supabase.from('milestones').insert({
      company_id: companyId,
      type: milestone.type,
      title: milestone.title,
      description: milestone.description,
      date: milestone.date,
    });
    await fetchAll();
  }, [fetchAll]);

  const addTask = useCallback(async (companyId: string, task: CompanyTask) => {
    await supabase.from('company_tasks').insert({
      company_id: companyId,
      title: task.title,
      description: task.description,
      status: task.status,
      due_date: task.dueDate,
    });
    await fetchAll();
  }, [fetchAll]);

  const updateTask = useCallback(async (companyId: string, taskId: string, updates: Partial<CompanyTask>) => {
    const mapped: any = {};
    if (Object.prototype.hasOwnProperty.call(updates, 'status')) mapped.status = updates.status;
    if (Object.prototype.hasOwnProperty.call(updates, 'completedDate')) mapped.completed_date = updates.completedDate;
    if (Object.prototype.hasOwnProperty.call(updates, 'title')) mapped.title = updates.title;
    if (Object.prototype.hasOwnProperty.call(updates, 'description')) mapped.description = updates.description;
    if (Object.prototype.hasOwnProperty.call(updates, 'dueDate')) mapped.due_date = updates.dueDate;

    await supabase.from('company_tasks').update(mapped).eq('id', taskId);
    await fetchAll();
  }, [fetchAll]);

  const addContact = useCallback(async (companyId: string, contact: Contact) => {
    await supabase.from('contacts').insert({
      company_id: companyId,
      name: contact.name,
      position: contact.position,
      email: contact.email,
      phone: contact.phone,
      notes: contact.notes,
      is_primary: contact.isPrimary,
      gender: contact.gender || '',
    });
    await fetchAll();
  }, [fetchAll]);

  const updateContact = useCallback(async (companyId: string, contact: Contact) => {
    await supabase.from('contacts').update({
      name: contact.name,
      position: contact.position,
      email: contact.email,
      phone: contact.phone,
      notes: contact.notes,
      is_primary: contact.isPrimary,
      gender: contact.gender || '',
    }).eq('id', contact.id);
    await fetchAll();
  }, [fetchAll]);

  const removeContact = useCallback(async (companyId: string, contactId: string) => {
    await supabase.from('contacts').delete().eq('id', contactId);
    await fetchAll();
  }, [fetchAll]);

  const saveView = useCallback(async (view: SavedView) => {
    const existing = savedViews.find(v => v.id === view.id);
    if (existing) {
      await supabase.from('saved_views').update({ name: view.name, filters: view.filters as any } as any).eq('id', view.id);
    } else {
      await supabase.from('saved_views').insert({ name: view.name, filters: view.filters as any } as any);
    }
    await fetchAll();
  }, [savedViews, fetchAll]);

  const deleteView = useCallback(async (id: string) => {
    await supabase.from('saved_views').delete().eq('id', id);
    await fetchAll();
  }, [fetchAll]);

  const saveFieldValues = useCallback(async (companyId: string, values: CustomFieldValue[]) => {
    // Delete existing and re-insert
    await supabase.from('custom_field_values').delete().eq('company_id', companyId);
    if (values.length > 0) {
      await supabase.from('custom_field_values').insert(
        values.map(v => ({
          company_id: companyId,
          field_id: v.fieldId,
          text_value: v.textValue || '',
          number_value: v.numberValue,
          year_values: v.yearValues || {},
        })) as any
      );
    }
    await fetchAll();
  }, [fetchAll]);

  return (
    <CRMContext.Provider value={{
      companies, savedViews, loading, getCompany,
      addCompany, updateCompany, deleteCompany,
      addAction, addMilestone, addTask, updateTask,
      addContact, updateContact, removeContact,
      saveView, deleteView, saveFieldValues, refresh: fetchAll,
    }}>
      {children}
    </CRMContext.Provider>
  );
}

export function useCRM() {
  const ctx = useContext(CRMContext);
  if (!ctx) throw new Error('useCRM must be used within CRMProvider');
  return ctx;
}
