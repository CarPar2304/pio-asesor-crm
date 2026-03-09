import { useState } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { PortfolioOffer } from '@/types/portfolio';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Package, Plus, Search, GitBranch, Layers } from 'lucide-react';
import OfferCard from '@/components/portfolio/OfferCard';
import OfferFormDialog from '@/components/portfolio/OfferFormDialog';
import PipelineBoard from '@/components/portfolio/PipelineBoard';
import { Skeleton } from '@/components/ui/skeleton';

export default function Portafolio() {
  const { offers, categories, loading } = usePortfolio();
  const [tab, setTab] = useState<'oferta' | 'pipeline'>('oferta');
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterType, setFilterType] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<PortfolioOffer | undefined>();
  const [viewingPipeline, setViewingPipeline] = useState<PortfolioOffer | null>(null);

  const filteredOffers = offers.filter(o => {
    if (search && !o.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCategory && o.categoryId !== filterCategory) return false;
    if (filterType && o.type !== filterType) return false;
    return true;
  });

  const handleEdit = (offer: PortfolioOffer) => {
    setEditingOffer(offer);
    setFormOpen(true);
  };

  const handleViewPipeline = (offer: PortfolioOffer) => {
    setViewingPipeline(offer);
    setTab('pipeline');
  };

  const handleCloseForm = () => {
    setFormOpen(false);
    setEditingOffer(undefined);
  };

  // If viewing a specific pipeline
  if (viewingPipeline) {
    return <PipelineBoard offer={viewingPipeline} onBack={() => setViewingPipeline(null)} />;
  }

  return (
    <div className="container py-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Layers className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Portafolio</h1>
            <p className="text-sm text-muted-foreground">Gestiona tu oferta y pipelines</p>
          </div>
        </div>
        <Button onClick={() => setFormOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Nueva oferta
        </Button>
      </div>

      <Tabs value={tab} onValueChange={v => setTab(v as any)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="oferta" className="gap-1.5">
            <Package className="h-3.5 w-3.5" /> Oferta
          </TabsTrigger>
          <TabsTrigger value="pipeline" className="gap-1.5">
            <GitBranch className="h-3.5 w-3.5" /> Pipeline
          </TabsTrigger>
        </TabsList>

        <TabsContent value="oferta" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar ofertas..." className="pl-9" />
            </div>
            <Select value={filterCategory || 'all'} onValueChange={v => setFilterCategory(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {categories.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterType || 'all'} onValueChange={v => setFilterType(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="product">Producto</SelectItem>
                <SelectItem value="service">Servicio</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Offers grid */}
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="rounded-lg border border-border/60 p-4 space-y-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : filteredOffers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Package className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No hay ofertas {search || filterCategory || filterType ? 'con esos filtros' : 'aún'}</p>
              {!search && !filterCategory && !filterType && (
                <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => setFormOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> Crear primera oferta
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredOffers.map(offer => (
                <OfferCard key={offer.id} offer={offer} onEdit={handleEdit} onViewPipeline={handleViewPipeline} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="pipeline" className="space-y-4">
          <div className="rounded-lg border border-border/60 bg-card p-6">
            <div className="flex flex-col items-center justify-center text-center">
              <GitBranch className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <h3 className="text-sm font-medium mb-1">Selecciona una oferta</h3>
              <p className="text-xs text-muted-foreground mb-4">Elige una oferta desde el tab "Oferta" para ver su pipeline</p>
              <Button variant="outline" size="sm" onClick={() => setTab('oferta')}>Ver ofertas</Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <OfferFormDialog open={formOpen} onClose={handleCloseForm} offer={editingOffer} />
    </div>
  );
}
