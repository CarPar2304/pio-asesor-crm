import { useState } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCRM } from '@/contexts/CRMContext';
import { PortfolioOffer, PipelineStage } from '@/types/portfolio';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings, Plus, ArrowLeft, Building2, X, ExternalLink } from 'lucide-react';
import * as Icons from 'lucide-react';
import StageManagerDialog from './StageManagerDialog';
import AddCompaniesToPipelineDialog from './AddCompaniesToPipelineDialog';
import { useNavigate } from 'react-router-dom';

interface Props {
  offer: PortfolioOffer;
  onBack: () => void;
}

export default function PipelineBoard({ offer, onBack }: Props) {
  const navigate = useNavigate();
  const { getStagesForOffer, getEntriesForOffer, moveCompanyToStage, removeEntry } = usePortfolio();
  const { companies } = useCRM();
  const stages = getStagesForOffer(offer.id);
  const entries = getEntriesForOffer(offer.id);

  const [stageManagerOpen, setStageManagerOpen] = useState(false);
  const [addCompaniesOpen, setAddCompaniesOpen] = useState(false);

  const IconComponent = ({ name, ...props }: { name: string; className?: string; style?: React.CSSProperties }) => {
    const Comp = (Icons as any)[name] || Icons.Circle;
    return <Comp {...props} />;
  };

  const getCompany = (id: string) => companies.find(c => c.id === id);

  return (
    <div className="container py-6 animate-fade-in">
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-4 gap-1.5 text-muted-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Volver a Oferta
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">{offer.name}</h1>
          <p className="text-sm text-muted-foreground">Pipeline · {entries.length} empresas en {stages.length} etapas</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setStageManagerOpen(true)}>
            <Settings className="h-3.5 w-3.5" /> Etapas
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setAddCompaniesOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Agregar empresas
          </Button>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map(stage => {
          const stageEntries = entries.filter(e => e.stageId === stage.id);
          return (
            <div key={stage.id} className="flex w-72 shrink-0 flex-col rounded-xl border border-border/60 bg-card">
              {/* Stage header */}
              <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2.5">
                <div className="flex h-6 w-6 items-center justify-center rounded-md" style={{ backgroundColor: stage.color + '20' }}>
                  <IconComponent name={stage.icon} className="h-3.5 w-3.5" style={{ color: stage.color }} />
                </div>
                <span className="flex-1 text-sm font-semibold">{stage.name}</span>
                <Badge variant="secondary" className="text-[10px] px-1.5">{stageEntries.length}</Badge>
              </div>

              {/* Entries */}
              <div className="flex-1 space-y-2 p-2 min-h-[120px]">
                {stageEntries.map(entry => {
                  const company = getCompany(entry.companyId);
                  if (!company) return null;
                  return (
                    <div key={entry.id} className="group rounded-lg border border-border/50 bg-background p-2.5 transition-colors hover:border-primary/30">
                      <div className="flex items-start gap-2">
                        {company.logo ? (
                          <img src={company.logo} alt="" className="h-8 w-8 shrink-0 rounded-md border border-border/40 object-contain bg-white p-0.5" />
                        ) : (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">
                            {company.tradeName.charAt(0)}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">{company.tradeName}</p>
                          <p className="truncate text-[10px] text-muted-foreground">{company.vertical}</p>
                        </div>
                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => navigate(`/empresa/${company.id}`)}
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title="Ver perfil"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => removeEntry(entry.id)}
                            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            title="Remover del pipeline"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      {/* Move to stage selector */}
                      <div className="mt-2">
                        <Select value={entry.stageId} onValueChange={newId => moveCompanyToStage(entry.id, newId)}>
                          <SelectTrigger className="h-6 text-[10px] px-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {stages.map(s => (
                              <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  );
                })}

                {stageEntries.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-20 text-center text-xs text-muted-foreground">
                    <Building2 className="h-5 w-5 mb-1 opacity-30" />
                    Sin empresas
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <StageManagerDialog open={stageManagerOpen} onClose={() => setStageManagerOpen(false)} offerId={offer.id} />
      <AddCompaniesToPipelineDialog open={addCompaniesOpen} onClose={() => setAddCompaniesOpen(false)} offerId={offer.id} />
    </div>
  );
}
