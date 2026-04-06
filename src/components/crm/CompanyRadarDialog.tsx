import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FilterState, DEFAULT_FILTERS } from '@/types/crm';
import { showError } from '@/lib/toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Search, X, Loader2, Radar } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  onApplyFilters: (filters: FilterState) => void;
  currentFilters: FilterState;
}

export default function CompanyRadarDialog({ open, onClose, onApplyFilters, currentFilters }: Props) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [reasoning, setReasoning] = useState<string | null>(null);
  const [appliedFilters, setAppliedFilters] = useState<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setReasoning(null);
      setAppliedFilters(null);
    }
  }, [open]);

  const handleSearch = async () => {
    if (!query.trim() || loading) return;
    setLoading(true);
    setReasoning(null);
    setAppliedFilters(null);

    try {
      const { data, error } = await supabase.functions.invoke('company-radar', {
        body: { query: query.trim() },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const filters = data.filters;
      if (!filters) throw new Error('No se recibieron filtros');

      setReasoning(filters.reasoning || null);
      setAppliedFilters(filters);

      // Build new FilterState from AI response, mapping ALL available filters
      const newFilters: FilterState = {
        ...DEFAULT_FILTERS,
        activeYear: currentFilters.activeYear,
        category: filters.category || [],
        vertical: filters.vertical || [],
        economicActivity: filters.economicActivity || [],
        city: filters.city || [],
        search: filters.search || '',
        salesMin: filters.salesMin || '',
        salesMax: filters.salesMax || '',
        avgYoYMin: filters.avgYoYMin || '',
        avgYoYMax: filters.avgYoYMax || '',
        lastYoYMin: filters.lastYoYMin || '',
        lastYoYMax: filters.lastYoYMax || '',
        nitFilter: filters.nitFilter || '',
        sortField: filters.sortField || DEFAULT_FILTERS.sortField,
        sortDirection: filters.sortDirection || DEFAULT_FILTERS.sortDirection,
      };

      onApplyFilters(newFilters);
    } catch (e: any) {
      console.error('Company Radar error:', e);
      showError('Error en Company Radar', e.message || 'No se pudo procesar la búsqueda');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
    if (e.key === 'Escape') onClose();
  };

  if (!open) return null;

  return (
    <div className="relative z-30 mb-4 animate-in fade-in slide-in-from-top-2 duration-200">
      {/* Glassmorphism container */}
      <div className="rounded-xl border border-primary/20 bg-background/80 backdrop-blur-xl shadow-lg shadow-primary/5 p-4">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center gap-1.5 text-primary">
            <Radar className="h-4 w-4" />
            <span className="text-xs font-semibold tracking-wide uppercase">Company Radar</span>
          </div>
          <Badge variant="outline" className="text-[10px] bg-primary/5 border-primary/20 text-primary">
            <Sparkles className="h-3 w-3 mr-1" />
            IA
          </Badge>
          <button onClick={onClose} className="ml-auto rounded-md p-1 hover:bg-accent transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Search input */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe qué tipo de empresas necesitas... Ej: &quot;startups de salud en Cali&quot;"
              className="pl-9 pr-4 h-10 bg-background border-border/60 focus-visible:ring-primary/30"
              disabled={loading}
            />
          </div>
          <Button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="gap-2 min-w-[100px]"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Buscando
              </>
            ) : (
              <>
                <Radar className="h-4 w-4" />
                Buscar
              </>
            )}
          </Button>
        </div>

        {/* Reasoning / Results */}
        {reasoning && (
          <div className="mt-3 rounded-lg bg-muted/50 border border-border/50 p-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Razonamiento del IA</p>
            <p className="text-sm text-foreground leading-relaxed">{reasoning}</p>
            {appliedFilters && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {(appliedFilters.category || []).map((c: string) => (
                  <Badge key={`cat-${c}`} variant="secondary" className="text-[10px]">Categoría: {c}</Badge>
                ))}
                {(appliedFilters.vertical || []).map((v: string) => (
                  <Badge key={`vert-${v}`} variant="secondary" className="text-[10px]">Vertical: {v}</Badge>
                ))}
                {(appliedFilters.economicActivity || []).map((ea: string) => (
                  <Badge key={`ea-${ea}`} variant="secondary" className="text-[10px]">Sub-vertical: {ea}</Badge>
                ))}
                {(appliedFilters.city || []).map((ci: string) => (
                  <Badge key={`city-${ci}`} variant="secondary" className="text-[10px]">Ciudad: {ci}</Badge>
                ))}
                {appliedFilters.search && (
                  <Badge variant="secondary" className="text-[10px]">Búsqueda: {appliedFilters.search}</Badge>
                )}
                {appliedFilters.salesMin && (
                  <Badge variant="secondary" className="text-[10px]">Ventas ≥ {appliedFilters.salesMin}M</Badge>
                )}
                {appliedFilters.salesMax && (
                  <Badge variant="secondary" className="text-[10px]">Ventas ≤ {appliedFilters.salesMax}M</Badge>
                )}
                {appliedFilters.avgYoYMin && (
                  <Badge variant="secondary" className="text-[10px]">Crec. prom. ≥ {appliedFilters.avgYoYMin}%</Badge>
                )}
                {appliedFilters.avgYoYMax && (
                  <Badge variant="secondary" className="text-[10px]">Crec. prom. ≤ {appliedFilters.avgYoYMax}%</Badge>
                )}
                {appliedFilters.lastYoYMin && (
                  <Badge variant="secondary" className="text-[10px]">Crec. último año ≥ {appliedFilters.lastYoYMin}%</Badge>
                )}
                {appliedFilters.lastYoYMax && (
                  <Badge variant="secondary" className="text-[10px]">Crec. último año ≤ {appliedFilters.lastYoYMax}%</Badge>
                )}
                {appliedFilters.nitFilter === 'has' && (
                  <Badge variant="secondary" className="text-[10px]">Con NIT</Badge>
                )}
                {appliedFilters.nitFilter === 'no' && (
                  <Badge variant="secondary" className="text-[10px]">Sin NIT</Badge>
                )}
                {appliedFilters.sortField && appliedFilters.sortField !== 'tradeName' && (
                  <Badge variant="secondary" className="text-[10px]">
                    Orden: {appliedFilters.sortField === 'salesByYear' ? 'Ventas' : appliedFilters.sortField === 'createdAt' ? 'Fecha' : appliedFilters.sortField} {appliedFilters.sortDirection === 'desc' ? '↓' : '↑'}
                  </Badge>
                )}
              </div>
            )}
          </div>
        )}

        {/* Loading animation */}
        {loading && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <div className="flex gap-1">
              <span className="animate-pulse">●</span>
              <span className="animate-pulse" style={{ animationDelay: '0.2s' }}>●</span>
              <span className="animate-pulse" style={{ animationDelay: '0.4s' }}>●</span>
            </div>
            Analizando taxonomía y generando filtros inteligentes...
          </div>
        )}
      </div>
    </div>
  );
}
