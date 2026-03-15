import { useMemo } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useProfile } from '@/contexts/ProfileContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GitBranch, User, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Props {
  companyId: string;
}

export default function CompanyPortfolioTab({ companyId }: Props) {
  const navigate = useNavigate();
  const { entries, offers, stages, categories } = usePortfolio();
  const { allProfiles } = useProfile();

  const profileMap = useMemo(() => {
    const map: Record<string, string> = {};
    allProfiles.forEach(p => { map[p.userId] = p.name || 'Sin nombre'; });
    return map;
  }, [allProfiles]);

  const companyEntries = useMemo(() => {
    return entries
      .filter(e => e.companyId === companyId)
      .map(entry => {
        const offer = offers.find(o => o.id === entry.offerId);
        const stage = stages.find(s => s.id === entry.stageId);
        const category = offer?.categoryId ? categories.find(c => c.id === offer.categoryId) : null;
        const addedByName = entry.addedBy ? profileMap[entry.addedBy] : null;
        return { entry, offer, stage, category, addedByName };
      })
      .filter(x => x.offer);
  }, [entries, offers, stages, categories, companyId, profileMap]);

  if (companyEntries.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">Esta empresa no está en ningún pipeline</p>
    );
  }

  return (
    <div className="space-y-2">
      {companyEntries.map(({ entry, offer, stage, category, addedByName }) => (
        <div
          key={entry.id}
          className="flex items-center gap-3 rounded-lg border border-border/50 bg-card p-3 transition-colors hover:bg-secondary/30 cursor-pointer"
          onClick={() => navigate(`/portafolio?pipeline=${offer!.id}`)}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <GitBranch className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium">{offer!.name}</p>
              {category && (
                <Badge className="border text-[10px] px-1.5 py-0" style={{ backgroundColor: category.color + '20', color: category.color, borderColor: category.color + '40' }}>
                  {category.name}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
              {stage && (
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: stage.color }} />
                  {stage.name}
                </span>
              )}
              {addedByName && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-1"><User className="h-3 w-3" />{addedByName}</span>
                </>
              )}
            </div>
          </div>
          <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
      ))}
    </div>
  );
}
