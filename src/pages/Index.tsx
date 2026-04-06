import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCRM } from '@/contexts/CRMContext';
import { showSuccess } from '@/lib/toast';
import { useCustomFields } from '@/contexts/CustomFieldsContext';
import { FilterState, DEFAULT_FILTERS } from '@/types/crm';
import { calculateGrowth, getLatestSalesValue } from '@/lib/calculations';
import CompanyCard from '@/components/crm/CompanyCard';
import { CompanyGridSkeleton, CompanyTableSkeleton } from '@/components/crm/CompanySkeleton';
import CompanyTable from '@/components/crm/CompanyTable';
import CRMFilters from '@/components/crm/CRMFilters';
import CRMPagination from '@/components/crm/CRMPagination';
import CompanyForm from '@/components/crm/CompanyForm';
import BulkUploadDialog from '@/components/crm/BulkUploadDialog';
import BulkUpdateDialog from '@/components/crm/BulkUpdateDialog';
import ExportDialog from '@/components/crm/ExportDialog';
import QuickActionDialog from '@/components/crm/QuickActionDialog';
import CRMSettingsDialog from '@/components/crm/CRMSettingsDialog';
import { ExpandableTabs } from '@/components/ui/expandable-tabs';
import { LayoutGrid, List, FileSpreadsheet, Plus, Download, RefreshCw, Settings2, Radar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CompanyRadarDialog from '@/components/crm/CompanyRadarDialog';

const DASHBOARD_TABS = [
  { title: 'Cuadrícula', icon: LayoutGrid },
  { title: 'Tabla', icon: List },
  { type: 'separator' as const },
  { title: 'Company Radar', icon: Radar },
  { title: 'Carga masiva', icon: FileSpreadsheet },
  { title: 'Actualizar masivo', icon: RefreshCw },
  { title: 'Nueva empresa', icon: Plus },
  { title: 'Exportar', icon: Download },
  { title: 'Ajustes', icon: Settings2 },
];

export default function Index() {
  const navigate = useNavigate();
  const { companies, loading, deleteCompany } = useCRM();
  const { fields } = useCustomFields();
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [page, setPage] = useState(() => {
    try {
      const saved = sessionStorage.getItem('crm-page');
      if (saved) return Number(saved);
    } catch {}
    return 1;
  });
  const [pageSize, setPageSize] = useState(() => {
    try {
      const saved = sessionStorage.getItem('crm-pageSize');
      if (saved) return Math.min(Number(saved), 100);
    } catch {}
    return 25;
  });
  const [filters, setFilters] = useState<FilterState>(() => {
    try {
      const saved = sessionStorage.getItem('crm-filters');
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_FILTERS;
  });

  const [formOpen, setFormOpen] = useState(false);
  const [quickAction, setQuickAction] = useState<{ type: 'action' | 'task' | 'milestone'; companyId: string } | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkUpdateOpen, setBulkUpdateOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [radarOpen, setRadarOpen] = useState(false);

  // Persist filters to sessionStorage
  const updateFilters = useCallback((f: FilterState) => {
    setFilters(f);
    setPage(1);
    try {
      sessionStorage.setItem('crm-filters', JSON.stringify(f));
      sessionStorage.setItem('crm-page', '1');
    } catch {}
  }, []);

  const updatePage = useCallback((p: number) => {
    setPage(p);
    try { sessionStorage.setItem('crm-page', String(p)); } catch {}
  }, []);

  const updatePageSize = useCallback((size: number) => {
    setPageSize(size);
    setPage(1);
    try { sessionStorage.setItem('crm-pageSize', String(size)); } catch {}
  }, []);

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

      // Sales filter uses latest year with data for each company
      const latestSales = getLatestSalesValue(c.salesByYear);
      if (filters.salesMin && (latestSales === null || latestSales < Number(filters.salesMin) * 1_000_000)) return false;
      if (filters.salesMax && (latestSales === null || latestSales > Number(filters.salesMax) * 1_000_000)) return false;

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
        case 'salesByYear': {
          const sa = getLatestSalesValue(a.salesByYear);
          const sb = getLatestSalesValue(b.salesByYear);
          // Companies without sales always go last
          if (sa === null && sb === null) cmp = 0;
          else if (sa === null) cmp = sortDirection === 'asc' ? 1 : -1;
          else if (sb === null) cmp = sortDirection === 'asc' ? -1 : 1;
          else cmp = sa - sb;
          break;
        }
        case 'createdAt': cmp = a.createdAt.localeCompare(b.createdAt); break;
      }
      return sortDirection === 'desc' ? -cmp : cmp;
    });

    return result;
  }, [companies, filters, fields]);

  // Paginate — sync page state when it exceeds total pages
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  if (safePage !== page) {
    // Schedule state update to avoid rendering stale page
    Promise.resolve().then(() => {
      setPage(safePage);
      try { sessionStorage.setItem('crm-page', String(safePage)); } catch {}
    });
  }
  const paginatedItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage, pageSize]);

  const handleDashboardTab = useCallback((index: number | null) => {
    if (index === null) return;
    if (index === 0) setView('grid');
    else if (index === 1) setView('table');
    else if (index === 3) setRadarOpen(prev => !prev);
    else if (index === 4) setBulkOpen(true);
    else if (index === 5) setBulkUpdateOpen(true);
    else if (index === 6) setFormOpen(true);
    else if (index === 7) setExportOpen(true);
    else if (index === 8) setSettingsOpen(true);
  }, []);

  const handleOpenProfile = useCallback((id: string) => navigate(`/empresa/${id}`), [navigate]);

  const handleQuickAction = useCallback((type: 'action' | 'task' | 'milestone', companyId: string) => {
    setQuickAction({ type, companyId });
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    const name = companies.find(c => c.id === id)?.tradeName;
    await deleteCompany(id);
    showSuccess('Empresa eliminada', `"${name}" fue eliminada`);
  }, [companies, deleteCompany]);

  return (
    <div className="container py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Empresas</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} de {companies.length} empresas</p>
        </div>
        <div className="flex items-center gap-2">
          <ExpandableTabs tabs={DASHBOARD_TABS} onChange={handleDashboardTab} />
        </div>
      </div>
      <CompanyRadarDialog
        open={radarOpen}
        onClose={() => setRadarOpen(false)}
        onApplyFilters={updateFilters}
        currentFilters={filters}
      />

      <CRMFilters filters={filters} onChange={updateFilters} />

      {filtered.length > 0 && (
        <div className="mt-4">
          <CRMPagination
            total={filtered.length}
            page={safePage}
            pageSize={pageSize}
            onPageChange={updatePage}
            onPageSizeChange={updatePageSize}
          />
        </div>
      )}

      <div className="mt-4">
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
            {paginatedItems.map(c => (
              <CompanyCard
                key={c.id}
                company={c}
                onOpenProfile={handleOpenProfile}
                onQuickAction={handleQuickAction}
                onDelete={handleDelete}
              />
            ))}
          </div>
        ) : (
          <CompanyTable companies={paginatedItems} onOpenProfile={handleOpenProfile} activeYear={filters.activeYear} onDelete={handleDelete} />
        )}

        {filtered.length > 0 && (
          <CRMPagination
            total={filtered.length}
            page={safePage}
            pageSize={pageSize}
            onPageChange={updatePage}
            onPageSizeChange={updatePageSize}
          />
        )}
      </div>

      <CompanyForm open={formOpen} onClose={() => setFormOpen(false)} />
      <BulkUploadDialog open={bulkOpen} onClose={() => setBulkOpen(false)} />
      <BulkUpdateDialog open={bulkUpdateOpen} onClose={() => setBulkUpdateOpen(false)} />
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} companies={filtered} activeYear={filters.activeYear} />
      <CRMSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {quickAction && (
        <QuickActionDialog type={quickAction.type} companyId={quickAction.companyId} onClose={() => setQuickAction(null)} />
      )}
    </div>
  );
}
