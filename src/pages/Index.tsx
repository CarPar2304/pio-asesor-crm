import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCRM } from '@/contexts/CRMContext';
import { FilterState, DEFAULT_FILTERS } from '@/types/crm';
import { calculateGrowth } from '@/lib/calculations';
import CompanyCard from '@/components/crm/CompanyCard';
import CompanyTable from '@/components/crm/CompanyTable';
import CRMFilters from '@/components/crm/CRMFilters';
import CompanyForm from '@/components/crm/CompanyForm';
import QuickActionDialog from '@/components/crm/QuickActionDialog';
import { Button } from '@/components/ui/button';
import { LayoutGrid, List, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Index() {
  const navigate = useNavigate();
  const { companies, loading } = useCRM();
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [formOpen, setFormOpen] = useState(false);
  const [quickAction, setQuickAction] = useState<{ type: 'action' | 'task' | 'milestone'; companyId: string } | null>(null);

  const filtered = useMemo(() => {
    return companies.filter(c => {
      if (filters.search) {
        const s = filters.search.toLowerCase();
        if (!c.tradeName.toLowerCase().includes(s) && !c.legalName.toLowerCase().includes(s) && !c.nit.includes(s)) return false;
      }
      if (filters.category && c.category !== filters.category) return false;
      if (filters.vertical && c.vertical !== filters.vertical) return false;
      if (filters.city && c.city !== filters.city) return false;
      if (filters.economicActivity && !c.economicActivity.toLowerCase().includes(filters.economicActivity.toLowerCase())) return false;

      const yearSales = c.salesByYear[filters.activeYear];
      if (filters.salesMin && (yearSales === undefined || yearSales < Number(filters.salesMin) * 1_000_000)) return false;
      if (filters.salesMax && (yearSales === undefined || yearSales > Number(filters.salesMax) * 1_000_000)) return false;

      const { avgYoY, lastYoY } = calculateGrowth(c.salesByYear);
      if (filters.avgYoYMin && (avgYoY === null || avgYoY < Number(filters.avgYoYMin))) return false;
      if (filters.avgYoYMax && (avgYoY === null || avgYoY > Number(filters.avgYoYMax))) return false;
      if (filters.lastYoYMin && (lastYoY === null || lastYoY < Number(filters.lastYoYMin))) return false;
      if (filters.lastYoYMax && (lastYoY === null || lastYoY > Number(filters.lastYoYMax))) return false;

      return true;
    });
  }, [companies, filters]);

  return (
    <div className="container py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Empresas</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} de {companies.length} empresas</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border p-0.5">
            <button
              className={cn('rounded-md px-2.5 py-1 text-xs font-medium transition-colors', view === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
              onClick={() => setView('grid')}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              className={cn('rounded-md px-2.5 py-1 text-xs font-medium transition-colors', view === 'table' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
              onClick={() => setView('table')}
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => setFormOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Nueva empresa
          </Button>
        </div>
      </div>

      <CRMFilters filters={filters} onChange={setFilters} />

      <div className="mt-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
            <p className="text-sm text-muted-foreground">No se encontraron empresas con los filtros actuales</p>
            <Button variant="link" size="sm" onClick={() => setFilters(DEFAULT_FILTERS)} className="mt-2">
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
              />
            ))}
          </div>
        ) : (
          <CompanyTable companies={filtered} onOpenProfile={id => navigate(`/empresa/${id}`)} activeYear={filters.activeYear} />
        )}
      </div>

      <CompanyForm open={formOpen} onClose={() => setFormOpen(false)} />
      {quickAction && (
        <QuickActionDialog type={quickAction.type} companyId={quickAction.companyId} onClose={() => setQuickAction(null)} />
      )}
    </div>
  );
}
