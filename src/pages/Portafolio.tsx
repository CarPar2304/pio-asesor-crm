import { useState, useMemo } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { PortfolioOffer } from '@/types/portfolio';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Package, Plus, Search, Layers, Users, Eye } from 'lucide-react';
import OfferCard from '@/components/portfolio/OfferCard';
import OfferFormDialog from '@/components/portfolio/OfferFormDialog';
import PipelineBoard from '@/components/portfolio/PipelineBoard';
import AlliesSection from '@/components/portfolio/AlliesSection';
import { Skeleton } from '@/components/ui/skeleton';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import ErrorBoundary from '@/components/ErrorBoundary';

export default function Portafolio() {
  const { offers, categories, loading, stages, entries, allies, getAlliesForOffer } = usePortfolio();
  const { session } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const pipelineOfferId = searchParams.get('pipeline');
  const viewingPipeline = pipelineOfferId ? offers.find(o => o.id === pipelineOfferId) ?? null : null;

  const [tab, setTab] = useState<'oferta' | 'aliados'>('oferta');
  const [search, setSearch] = useState('');
  const [filterProduct, setFilterProduct] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterAlly, setFilterAlly] = useState('');
  const [filterTracking, setFilterTracking] = useState<'all' | 'yes' | 'no'>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<PortfolioOffer | undefined>();

  const uniqueProducts = useMemo(() => {
    const set = new Set<string>();
    offers.forEach(o => { if (o.product) set.add(o.product); });
    return Array.from(set).sort();
  }, [offers]);

  // "En seguimiento": ofertas donde el usuario actual es gestor principal (assignedTo)
  // de al menos una empresa que está en una etapa con countsAsManagement = true.
  const myUserId = session?.user?.id;
  const trackedOfferIds = useMemo(() => {
    const ids = new Set<string>();
    if (!myUserId) return ids;
    const activeStageIds = new Set(stages.filter(s => s.countsAsManagement).map(s => s.id));
    entries.forEach(e => {
      if (e.assignedTo === myUserId && activeStageIds.has(e.stageId)) {
        ids.add(e.offerId);
      }
    });
    return ids;
  }, [entries, stages, myUserId]);

  const filteredOffers = offers.filter(o => {
    if (search && !o.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCategory && o.categoryId !== filterCategory) return false;
    if (filterProduct && o.product !== filterProduct) return false;
    if (filterAlly) {
      const offerAllyList = getAlliesForOffer(o.id);
      if (!offerAllyList.some(a => a.id === filterAlly)) return false;
    }
    if (filterTracking === 'yes' && !trackedOfferIds.has(o.id)) return false;
    if (filterTracking === 'no' && trackedOfferIds.has(o.id)) return false;
    return true;
  });

  const hasFilters = !!(search || filterCategory || filterProduct || filterAlly || filterTracking !== 'all');

  const handleEdit = (offer: PortfolioOffer) => {
    setEditingOffer(offer);
    setFormOpen(true);
  };

  const handleViewPipeline = (offer: PortfolioOffer) => {
    setSearchParams({ pipeline: offer.id });
  };

  const handleClosePipeline = () => {
    setSearchParams({});
  };

  const handleCloseForm = () => {
    setFormOpen(false);
    setEditingOffer(undefined);
  };

  if (viewingPipeline) {
    return <PipelineBoard offer={viewingPipeline} onBack={handleClosePipeline} />;
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
            <p className="text-sm text-muted-foreground">Gestiona tu oferta, aliados y pipelines</p>
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
          <TabsTrigger value="aliados" className="gap-1.5">
            <Users className="h-3.5 w-3.5" /> Aliados
          </TabsTrigger>
        </TabsList>

        <TabsContent value="oferta" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-[160px] max-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="pl-9" />
            </div>
            <Select value={filterProduct || 'all'} onValueChange={v => setFilterProduct(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filtrar por producto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los productos</SelectItem>
                {uniqueProducts.map(p => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterCategory || 'all'} onValueChange={v => setFilterCategory(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-[210px]">
                <SelectValue placeholder="Filtrar por categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                {categories.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterAlly || 'all'} onValueChange={v => setFilterAlly(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filtrar por aliado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los aliados</SelectItem>
                {allies.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterTracking} onValueChange={v => setFilterTracking(v as any)}>
              <SelectTrigger className="w-[180px]">
                <Eye className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                <SelectValue placeholder="En seguimiento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">En seguimiento: Todas</SelectItem>
                <SelectItem value="yes">En seguimiento: Sí</SelectItem>
                <SelectItem value="no">En seguimiento: No</SelectItem>
              </SelectContent>
            </Select>
          </div>

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
              <p className="text-sm text-muted-foreground">No hay ofertas {hasFilters ? 'con esos filtros' : 'aún'}</p>
              {!hasFilters && (
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

        <TabsContent value="aliados">
          <AlliesSection />
        </TabsContent>
      </Tabs>

      <OfferFormDialog open={formOpen} onClose={handleCloseForm} offer={editingOffer} />
    </div>
  );
}
