import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCRM } from '@/contexts/CRMContext';
import { showSuccess } from '@/lib/toast';
import { useCustomFields } from '@/contexts/CustomFieldsContext';
import { FilterState, DEFAULT_FILTERS } from '@/types/crm';
import { calculateGrowth } from '@/lib/calculations';
// exportExcel removed - now using ExportDialog
import CompanyCard from '@/components/crm/CompanyCard';
import { CompanyGridSkeleton, CompanyTableSkeleton } from '@/components/crm/CompanySkeleton';
import CompanyTable from '@/components/crm/CompanyTable';
import CRMFilters from '@/components/crm/CRMFilters';
import CompanyForm from '@/components/crm/CompanyForm';
import BulkUploadDialog from '@/components/crm/BulkUploadDialog';
import BulkUpdateDialog from '@/components/crm/BulkUpdateDialog';
import ExportDialog from '@/components/crm/ExportDialog';
import QuickActionDialog from '@/components/crm/QuickActionDialog';
import CRMSettingsDialog from '@/components/crm/CRMSettingsDialog';
import { ExpandableTabs } from '@/components/ui/expandable-tabs';
import { LayoutGrid, List, FileSpreadsheet, Plus, Download, RefreshCw, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function Index() {
  const navigate = useNavigate();
  const { companies, loading, deleteCompany } = useCRM();
  const { fields } = useCustomFields();
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [filters, setFilters] = useState<FilterState>(() => {
    try {
      const saved = sessionStorage.getItem('crm-filters');
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_FILTERS;
  });

  // Persist filters to sessionStorage
  const updateFilters = (f: FilterState) => {
    setFilters(f);
    try { sessionStorage.setItem('crm-filters', JSON.stringify(f)); } catch {}
  };
  const [formOpen, setFormOpen] = useState(false);
  const [quickAction, setQuickAction] = useState<{ type: 'action' | 'task' | 'milestone'; companyId: string } | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkUpdateOpen, setBulkUpdateOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const dashboardTabs = [
    { title: 'Cuadrícula', icon: LayoutGrid },
    { title: 'Tabla', icon: List },
    { type: 'separator' as const },
    { title: 'Carga masiva', icon: FileSpreadsheet },
    { title: 'Actualizar masivo', icon: RefreshCw },
    { title: 'Nueva empresa', icon: Plus },
    { title: 'Exportar', icon: Download },
    { title: 'Ajustes', icon: Settings2 },
  ];

  const filtered = useMemo(() => {
    const result = companies.filter(c => {
      if (filters.search) {
        const s = filters.search.toLowerCase();
        if (!c.tradeName.toLowerCase().includes(s) && !c.legalName.toLowerCase().includes(s) && !c.nit.includes(s)) return false;
      }
      if (filters.category.length > 0 && !filters.category.includes(c.category)) return false;
      if (filters.vertical.length > 0 && !filters.vertical.includes(c.vertical)) return false;
      if (filters.city.length > 0 && !filters.city.includes(c.city)) return false;
      if (filters.economicActivity.length > 0 && !filters.economicActivity.includes(c.economicActivity)) return false;
      if (filters.nitFilter === 'has' && (!c.nit || c.nit === '0')) return false;
      if (filters.nitFilter === 'no' && c.nit && c.nit !== '0') return false;

      const yearSales = c.salesByYear[filters.activeYear];
      if (filters.salesMin && (yearSales === undefined || yearSales < Number(filters.salesMin) * 1_000_000)) return false;
      if (filters.salesMax && (yearSales === undefined || yearSales > Number(filters.salesMax) * 1_000_000)) return false;

      const { avgYoY, lastYoY } = calculateGrowth(c.salesByYear);
      if (filters.avgYoYMin && (avgYoY === null || avgYoY < Number(filters.avgYoYMin))) return false;
      if (filters.avgYoYMax && (avgYoY === null || avgYoY > Number(filters.avgYoYMax))) return false;
      if (filters.lastYoYMin && (lastYoY === null || lastYoY < Number(filters.lastYoYMin))) return false;
      if (filters.lastYoYMax && (lastYoY === null || lastYoY > Number(filters.lastYoYMax))) return false;

      const customFilters = filters.customFieldFilters || {};
      for (const [fieldId, filterValue] of Object.entries(customFilters)) {
        if (!filterValue) continue;
        const field = fields.find(f => f.id === fieldId);
        if (!field) continue;
        const val = (c.fieldValues || []).find(v => v.fieldId === fieldId);
        if (!val) return false;
        if (field.fieldType === 'select') {
          if (val.textValue !== filterValue) return false;
        } else {
          if (!val.textValue.toLowerCase().includes(filterValue.toLowerCase())) return false;
        }
      }

      return true;
    });

    // Sort
    const { sortField, sortDirection } = filters;
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'tradeName': cmp = a.tradeName.localeCompare(b.tradeName); break;
        case 'city': cmp = a.city.localeCompare(b.city); break;
        case 'vertical': cmp = a.vertical.localeCompare(b.vertical); break;
        case 'salesByYear': cmp = (a.salesByYear[filters.activeYear] || 0) - (b.salesByYear[filters.activeYear] || 0); break;
        case 'createdAt': cmp = a.createdAt.localeCompare(b.createdAt); break;
      }
      return sortDirection === 'desc' ? -cmp : cmp;
    });

    return result;
  }, [companies, filters, fields]);

  const handleDashboardTab = useCallback((index: number | null) => {
    if (index === null) return;
    if (index === 0) setView('grid');
    else if (index === 1) setView('table');
    else if (index === 3) setBulkOpen(true);
    else if (index === 4) setBulkUpdateOpen(true);
    else if (index === 5) setFormOpen(true);
    else if (index === 6) setExportOpen(true);
    else if (index === 7) setSettingsOpen(true);
  }, []);

  return (
    <div className="container py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Empresas</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} de {companies.length} empresas</p>
        </div>
        <div className="flex items-center gap-2">
          <ExpandableTabs tabs={dashboardTabs} onChange={handleDashboardTab} />
        </div>
      </div>

      <CRMFilters filters={filters} onChange={updateFilters} />

      <div className="mt-6">
        {loading ? (
          view === 'grid' ? <CompanyGridSkeleton /> : <CompanyTableSkeleton />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
            <p className="text-sm text-muted-foreground">No se encontraron empresas con los filtros actuales</p>
            <Button variant="link" size="sm" onClick={() => updateFilters(DEFAULT_FILTERS)} className="mt-2">
              Limpiar filtros
            </Button>
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map(c => (
              <CompanyCard
                key={c.id}
                company={c}
                onOpenProfile={id => navigate(`/empresa/${id}`)}
                onQuickAction={(type, companyId) => setQuickAction({ type, companyId })}
                onDelete={async (id) => { const name = companies.find(c => c.id === id)?.tradeName; await deleteCompany(id); showSuccess('Empresa eliminada', `"${name}" fue eliminada`); }}
              />
            ))}
          </div>
        ) : (
          <CompanyTable companies={filtered} onOpenProfile={id => navigate(`/empresa/${id}`)} activeYear={filters.activeYear} onDelete={async (id) => { const name = companies.find(c => c.id === id)?.tradeName; await deleteCompany(id); showSuccess('Empresa eliminada', `"${name}" fue eliminada`); }} />
        )}
      </div>

      <CompanyForm open={formOpen} onClose={() => setFormOpen(false)} />
      <BulkUploadDialog open={bulkOpen} onClose={() => setBulkOpen(false)} />
      <BulkUpdateDialog open={bulkUpdateOpen} onClose={() => setBulkUpdateOpen(false)} />
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} companies={filtered} activeYear={filters.activeYear} />
      {quickAction && (
        <QuickActionDialog type={quickAction.type} companyId={quickAction.companyId} onClose={() => setQuickAction(null)} />
      )}
    </div>
  );
}
