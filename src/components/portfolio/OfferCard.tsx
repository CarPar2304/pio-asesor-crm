import { PortfolioOffer } from '@/types/portfolio';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Pencil, Trash2, GitBranch, Calendar, Package, Wrench, Users, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const STATUS_CONFIG = {
  active:   { label: 'Activo',    className: 'bg-success/10 text-success border-success/30' },
  inactive: { label: 'Inactivo',  className: 'bg-muted text-muted-foreground' },
  draft:    { label: 'Borrador',  className: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
};

interface Props {
  offer: PortfolioOffer;
  onEdit: (offer: PortfolioOffer) => void;
  onViewPipeline: (offer: PortfolioOffer) => void;
}

export default function OfferCard({ offer, onEdit, onViewPipeline }: Props) {
  const { deleteOffer, duplicateOffer, categories, getStagesForOffer, getEntriesForOffer, getAlliesForOffer } = usePortfolio();
  const category = categories.find(c => c.id === offer.categoryId);
  const stageCount = getStagesForOffer(offer.id).length;
  const entryCount = getEntriesForOffer(offer.id).length;
  const offerAllies = getAlliesForOffer(offer.id);
  const statusCfg = STATUS_CONFIG[offer.status];

  const handleDuplicate = () => {
    if (confirm(`¿Duplicar "${offer.name}"? Se copiarán etapas y aliados como borrador.`)) {
      duplicateOffer(offer.id);
    }
  };

  const handleDelete = () => {
    if (confirm(`¿Eliminar "${offer.name}"? Esto eliminará también su pipeline.`)) {
      deleteOffer(offer.id);
    }
  };

  return (
    <Card className="group flex flex-col border-border/60 bg-card transition-all hover:shadow-md hover:shadow-primary/5 hover:border-primary/20">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold leading-tight">{offer.name}</h3>
            <div className="mt-1 flex flex-wrap gap-1">
              {offer.product && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  <Package className="h-2.5 w-2.5 mr-0.5" /> {offer.product}
                </Badge>
              )}
              {category && (
                <Badge className={cn('border text-[10px] px-1.5 py-0')} style={{ backgroundColor: category.color + '20', color: category.color, borderColor: category.color + '40' }}>
                  {category.name}
                </Badge>
              )}
            </div>
          </div>
          <Badge className={cn('shrink-0 border text-[10px] px-1.5', statusCfg.className)}>{statusCfg.label}</Badge>
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-2 pb-2">
        {offer.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{offer.description}</p>
        )}
        {offerAllies.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Users className="h-3 w-3 text-muted-foreground shrink-0" />
            {offerAllies.map(ally => (
              <div key={ally.id} className="flex items-center gap-1">
                {ally.logo ? (
                  <img src={ally.logo} alt="" className="h-4 w-4 rounded object-contain bg-white" />
                ) : null}
                <span className="text-[11px] text-muted-foreground">{ally.name}</span>
              </div>
            ))}
          </div>
        )}
        {(offer.startDate || offer.endDate) && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>
              {[
                offer.startDate && format(new Date(offer.startDate), 'dd MMM yyyy', { locale: es }),
                offer.endDate && format(new Date(offer.endDate), 'dd MMM yyyy', { locale: es }),
              ].filter(Boolean).join(' → ')}
            </span>
          </div>
        )}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><GitBranch className="h-3 w-3" /> <span>{stageCount} etapas</span></span>
          <span>·</span>
          <span>{entryCount} empresas</span>
        </div>
      </CardContent>

      <CardFooter className="border-t border-border/40 px-3 py-2">
        <div className="flex w-full items-center justify-between">
          <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs text-primary hover:text-primary" onClick={() => onViewPipeline(offer)}>
            <GitBranch className="h-3 w-3" /> Ver Pipeline
          </Button>
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => onEdit(offer)} title="Editar">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={handleDuplicate} title="Duplicar oferta">
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={handleDelete} title="Eliminar">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}
