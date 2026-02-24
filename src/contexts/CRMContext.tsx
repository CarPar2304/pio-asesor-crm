import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Company, CompanyAction, Milestone, CompanyTask, Contact, SavedView } from '@/types/crm';
import { initialCompanies } from '@/data/mockData';

interface CRMContextType {
  companies: Company[];
  savedViews: SavedView[];
  addCompany: (company: Company) => void;
  updateCompany: (company: Company) => void;
  deleteCompany: (id: string) => void;
  getCompany: (id: string) => Company | undefined;
  addAction: (companyId: string, action: CompanyAction) => void;
  addMilestone: (companyId: string, milestone: Milestone) => void;
  addTask: (companyId: string, task: CompanyTask) => void;
  updateTask: (companyId: string, taskId: string, updates: Partial<CompanyTask>) => void;
  addContact: (companyId: string, contact: Contact) => void;
  updateContact: (companyId: string, contact: Contact) => void;
  removeContact: (companyId: string, contactId: string) => void;
  saveView: (view: SavedView) => void;
  deleteView: (id: string) => void;
}

const CRMContext = createContext<CRMContextType | null>(null);

export function CRMProvider({ children }: { children: React.ReactNode }) {
  const [companies, setCompanies] = useState<Company[]>(() => {
    try {
      const saved = localStorage.getItem('crm-companies');
      return saved ? JSON.parse(saved) : initialCompanies;
    } catch { return initialCompanies; }
  });

  const [savedViews, setSavedViews] = useState<SavedView[]>(() => {
    try {
      const saved = localStorage.getItem('crm-views');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem('crm-companies', JSON.stringify(companies));
  }, [companies]);

  useEffect(() => {
    localStorage.setItem('crm-views', JSON.stringify(savedViews));
  }, [savedViews]);

  const getCompany = useCallback((id: string) => companies.find(c => c.id === id), [companies]);

  const addCompany = useCallback((company: Company) => {
    setCompanies(prev => [...prev, company]);
  }, []);

  const updateCompany = useCallback((company: Company) => {
    setCompanies(prev => prev.map(c => c.id === company.id ? company : c));
  }, []);

  const deleteCompany = useCallback((id: string) => {
    setCompanies(prev => prev.filter(c => c.id !== id));
  }, []);

  const addAction = useCallback((companyId: string, action: CompanyAction) => {
    setCompanies(prev => prev.map(c =>
      c.id === companyId ? { ...c, actions: [action, ...c.actions] } : c
    ));
  }, []);

  const addMilestone = useCallback((companyId: string, milestone: Milestone) => {
    setCompanies(prev => prev.map(c =>
      c.id === companyId ? { ...c, milestones: [milestone, ...c.milestones] } : c
    ));
  }, []);

  const addTask = useCallback((companyId: string, task: CompanyTask) => {
    setCompanies(prev => prev.map(c =>
      c.id === companyId ? { ...c, tasks: [task, ...c.tasks] } : c
    ));
  }, []);

  const updateTask = useCallback((companyId: string, taskId: string, updates: Partial<CompanyTask>) => {
    setCompanies(prev => prev.map(c =>
      c.id === companyId ? {
        ...c,
        tasks: c.tasks.map(t => t.id === taskId ? { ...t, ...updates } : t)
      } : c
    ));
  }, []);

  const addContact = useCallback((companyId: string, contact: Contact) => {
    setCompanies(prev => prev.map(c =>
      c.id === companyId ? { ...c, contacts: [...c.contacts, contact] } : c
    ));
  }, []);

  const updateContact = useCallback((companyId: string, contact: Contact) => {
    setCompanies(prev => prev.map(c =>
      c.id === companyId ? {
        ...c,
        contacts: c.contacts.map(ct => ct.id === contact.id ? contact : ct)
      } : c
    ));
  }, []);

  const removeContact = useCallback((companyId: string, contactId: string) => {
    setCompanies(prev => prev.map(c =>
      c.id === companyId ? {
        ...c,
        contacts: c.contacts.filter(ct => ct.id !== contactId)
      } : c
    ));
  }, []);

  const saveView = useCallback((view: SavedView) => {
    setSavedViews(prev => {
      const idx = prev.findIndex(v => v.id === view.id);
      if (idx >= 0) return prev.map(v => v.id === view.id ? view : v);
      return [...prev, view];
    });
  }, []);

  const deleteView = useCallback((id: string) => {
    setSavedViews(prev => prev.filter(v => v.id !== id));
  }, []);

  return (
    <CRMContext.Provider value={{
      companies, savedViews, getCompany,
      addCompany, updateCompany, deleteCompany,
      addAction, addMilestone, addTask, updateTask,
      addContact, updateContact, removeContact,
      saveView, deleteView,
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
