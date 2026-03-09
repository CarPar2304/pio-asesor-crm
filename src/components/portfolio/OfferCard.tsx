import { PortfolioOffer } from '@/types/portfolio';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Pencil, Trash2, GitBranch, Calendar, Package, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const STATUS_CONFIG = {
  active:   { label: 'Activo',    className: 'bg-success/10 text-success border-success/30' },
  inactive: { label: 'Inactivo',  className: 'bg-muted text-muted-foreground' },
  draft:    { label: 'Borrador',  className: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
};

const TYPE_ICON = { product: Package, service: Wrench };

interface Props {
  offer: PortfolioOffer;
  onEdit: (offer: PortfolioOffer) => void;
  onViewPipeline: (offer: PortfolioOffer) => void;
}

export default function OfferCard({ offer, onEdit, onViewPipeline }: Props) {
  const { deleteOffer, categories, getStagesForOffer, getEntriesForOffer } = usePortfolio();
  const category = categories.find(c => c.id === offer.categoryId);
  const stageCount = getStagesForOffer(offer.id).length;
  const entryCount = getEntriesForOffer(offer.id).length;
  const TypeIcon = TYPE_ICON[offer.type];
  const statusCfg = STATUS_CONFIG[offer.status];

  const handleDelete = () => {
    if (confirm(`¿Eliminar "${offer.name}"? Esto eliminará también su pipeline.`)) {
      deleteOffer(offer.id);
    }
  };

  return (
    <Card className="group flex flex-col border-border/60 bg-card transition-all hover:shadow-md hover:shadow-primary/5 hover:border-primary/20">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <TypeIcon className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-bold leading-tight">{offer.name}</h3>
              {category && (
                <div className="mt-0.5">
                  <Badge className={cn('border text-[10px] px-1.5 py-0')} style={{ backgroundColor: category.color + '20', color: category.color, borderColor: category.color + '40' }}>
                    {category.name}
                  </Badge>
                </div>
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
        {(offer.startDate || offer.endDate) && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {offer.startDate && format(new Date(offer.startDate), 'dd MMM yyyy', { locale: es })}
            {offer.startDate && offer.endDate && ' → '}
            {offer.endDate && format(new Date(offer.endDate), 'dd MMM yyyy', { locale: es })}
          </div>
        )}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><GitBranch className="h-3 w-3" /> {stageCount} etapas</span>
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
            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => onEdit(offer)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={handleDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}
