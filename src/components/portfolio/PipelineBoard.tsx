import { useState, useMemo } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCRM } from '@/contexts/CRMContext';
import { useProfile } from '@/contexts/ProfileContext';
import { PortfolioOffer, PipelineEntry } from '@/types/portfolio';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Settings, Plus, ArrowLeft, Building2, X, ExternalLink, GripVertical, User, Mail, Upload, Search, ClipboardList } from 'lucide-react';
import * as Icons from 'lucide-react';
import StageManagerDialog from './StageManagerDialog';
import AddCompaniesToPipelineDialog from './AddCompaniesToPipelineDialog';
import BulkAddToPipelineDialog from './BulkAddToPipelineDialog';
import PipelineNotificationDialog from './PipelineNotificationDialog';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  offer: PortfolioOffer;
  onBack: () => void;
}

export default function PipelineBoard({ offer, onBack }: Props) {
  const navigate = useNavigate();
  const { getStagesForOffer, getEntriesForOffer, moveCompanyToStage, removeEntry } = usePortfolio();
  const { companies } = useCRM();
  const { allProfiles } = useProfile();
  const stages = getStagesForOffer(offer.id);
  const entries = getEntriesForOffer(offer.id);

  const [stageManagerOpen, setStageManagerOpen] = useState(false);
  const [addCompaniesOpen, setAddCompaniesOpen] = useState(false);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [draggedEntry, setDraggedEntry] = useState<PipelineEntry | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);

  const profileMap = useMemo(() => {
    const map: Record<string, string> = {};
    allProfiles.forEach(p => { map[p.userId] = p.name || 'Sin nombre'; });
    return map;
  }, [allProfiles]);

  const IconComponent = ({ name, ...props }: { name: string; className?: string; style?: React.CSSProperties }) => {
    const Comp = (Icons as any)[name] || Icons.Circle;
    return <Comp {...props} />;
  };

  const getCompany = (id: string) => companies.find(c => c.id === id);

  const handleDragStart = (e: React.DragEvent, entry: PipelineEntry) => {
    setDraggedEntry(entry);
    e.dataTransfer.effectAllowed = 'move';
    if (e.currentTarget instanceof HTMLElement) {
      e.dataTransfer.setDragImage(e.currentTarget, 50, 20);
    }
  };

  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStageId(stageId);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!e.currentTarget.contains(relatedTarget)) {
      setDragOverStageId(null);
    }
  };

  const handleDrop = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    if (draggedEntry && draggedEntry.stageId !== stageId) {
      moveCompanyToStage(draggedEntry.id, stageId);
    }
    setDraggedEntry(null);
    setDragOverStageId(null);
  };

  const handleDragEnd = () => {
    setDraggedEntry(null);
    setDragOverStageId(null);
  };

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
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setNotificationOpen(true)}>
            <Mail className="h-3.5 w-3.5" /> Notificar
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setStageManagerOpen(true)}>
            <Settings className="h-3.5 w-3.5" /> Etapas
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setBulkAddOpen(true)}>
            <Upload className="h-3.5 w-3.5" /> Masivo
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setAddCompaniesOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Agregar empresas
          </Button>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar empresa por nombre comercial, razón social o NIT…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-9 max-w-md"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>



      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map(stage => {
          const q = searchQuery.trim().toLowerCase();
          const stageEntries = entries.filter(e => {
            if (e.stageId !== stage.id) return false;
            if (!q) return true;
            const company = getCompany(e.companyId);
            if (!company) return false;
            return company.tradeName.toLowerCase().includes(q)
              || company.legalName.toLowerCase().includes(q)
              || company.nit?.replace(/[.\-\s]/g, '').includes(q.replace(/[.\-\s]/g, ''));
          });
          const isDropTarget = dragOverStageId === stage.id && draggedEntry?.stageId !== stage.id;

          return (
            <div
              key={stage.id}
              className={cn(
                "flex w-72 shrink-0 flex-col rounded-xl border bg-card transition-all duration-200",
                isDropTarget
                  ? "border-primary/50 bg-primary/5 shadow-md shadow-primary/10"
                  : "border-border/60"
              )}
              onDragOver={(e) => handleDragOver(e, stage.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, stage.id)}
            >
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
                <AnimatePresence mode="popLayout">
                  {stageEntries.map(entry => {
                    const company = getCompany(entry.companyId);
                    if (!company) return null;
                    const isDragging = draggedEntry?.id === entry.id;
                    const addedByName = entry.addedBy ? profileMap[entry.addedBy] : null;

                    return (
                      <motion.div
                        key={entry.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: isDragging ? 0.4 : 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        draggable
                        onDragStart={(e) => handleDragStart(e as unknown as React.DragEvent, entry)}
                        onDragEnd={handleDragEnd}
                        className={cn(
                          "group cursor-grab active:cursor-grabbing rounded-lg border bg-background p-2.5 transition-colors",
                          isDragging
                            ? "border-primary/40 shadow-lg"
                            : "border-border/50 hover:border-primary/30"
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <GripVertical className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
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
                            {addedByName && (
                              <div className="flex items-center gap-1 mt-0.5">
                                <User className="h-2.5 w-2.5 text-muted-foreground" />
                                <span className="text-[10px] text-muted-foreground">{addedByName}</span>
                              </div>
                            )}
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
                      </motion.div>
                    );
                  })}
                </AnimatePresence>

                {stageEntries.length === 0 && (
                  <div className={cn(
                    "flex flex-col items-center justify-center h-20 text-center text-xs text-muted-foreground rounded-lg border-2 border-dashed transition-colors",
                    isDropTarget ? "border-primary/40 bg-primary/5" : "border-transparent"
                  )}>
                    <Building2 className="h-5 w-5 mb-1 opacity-30" />
                    {isDropTarget ? 'Soltar aquí' : 'Sin empresas'}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <StageManagerDialog open={stageManagerOpen} onClose={() => setStageManagerOpen(false)} offerId={offer.id} />
      <AddCompaniesToPipelineDialog open={addCompaniesOpen} onClose={() => setAddCompaniesOpen(false)} offerId={offer.id} />
      <PipelineNotificationDialog open={notificationOpen} onClose={() => setNotificationOpen(false)} offerId={offer.id} />
      <BulkAddToPipelineDialog open={bulkAddOpen} onClose={() => setBulkAddOpen(false)} offerId={offer.id} />
    </div>
  );
}
