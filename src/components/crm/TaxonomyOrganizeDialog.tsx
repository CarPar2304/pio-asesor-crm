import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTaxonomy } from '@/contexts/TaxonomyContext';
import { useCRM } from '@/contexts/CRMContext';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError, showInfo } from '@/lib/toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sparkles, Merge, Pencil, Trash2, ArrowRightLeft, Link2, Share2,
  CheckCircle2, AlertTriangle, Info, Loader2, Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  definitions: string;
}

interface Suggestion {
  id: string;
  action: 'merge' | 'rename' | 'delete' | 'move' | 'link' | 'share';
  priority: 'high' | 'medium' | 'low';
  target_type: 'category' | 'vertical' | 'sub_vertical';
  target_name: string;
  target_id?: string;
  destination_name?: string | null;
  destination_id?: string | null;
  new_name?: string | null;
  reason: string;
  affected_companies: number;
}

interface OrganizeResult {
  summary: string;
  suggestions: Suggestion[];
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  merge: <Merge className="h-3.5 w-3.5" />,
  rename: <Pencil className="h-3.5 w-3.5" />,
  delete: <Trash2 className="h-3.5 w-3.5" />,
  move: <ArrowRightLeft className="h-3.5 w-3.5" />,
  link: <Link2 className="h-3.5 w-3.5" />,
  share: <Share2 className="h-3.5 w-3.5" />,
};

const ACTION_LABELS: Record<string, string> = {
  merge: 'Fusionar',
  rename: 'Renombrar',
  delete: 'Eliminar',
  move: 'Mover',
  link: 'Vincular',
  share: 'Compartir',
};

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-destructive border-destructive/30 bg-destructive/10',
  medium: 'text-amber-600 border-amber-500/30 bg-amber-500/10',
  low: 'text-muted-foreground border-border bg-muted/50',
};

const TYPE_LABELS: Record<string, string> = {
  category: 'Categoría',
  vertical: 'Vertical',
  sub_vertical: 'Sub-vertical',
};

export default function TaxonomyOrganizeDialog({ open, onClose, definitions }: Props) {
  const taxonomy = useTaxonomy();
  const { companies } = useCRM();
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState('');
  const [result, setResult] = useState<OrganizeResult | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());

  const buildTaxonomyTree = useCallback(() => {
    const { allCategories, verticals, subVerticals, categoryVerticalLinks, verticalSubVerticalLinks } = taxonomy;

    let tree = '';
    for (const cat of allCategories) {
      const catCompanies = companies.filter(c => c.category === cat).length;
      tree += `📁 ${cat} (${catCompanies} empresas)\n`;

      const linkedVerticalIds = categoryVerticalLinks.filter(l => l.category === cat).map(l => l.vertical_id);
      const catVerticals = verticals.filter(v => linkedVerticalIds.includes(v.id));

      for (const vert of catVerticals) {
        const vertCompanies = companies.filter(c => c.vertical === vert.name).length;
        tree += `  ├── ${vert.name} [id:${vert.id}] (${vertCompanies} empresas)\n`;

        const linkedSvIds = verticalSubVerticalLinks.filter(l => l.vertical_id === vert.id).map(l => l.sub_vertical_id);
        const vertSubs = subVerticals.filter(sv => linkedSvIds.includes(sv.id));

        for (const sv of vertSubs) {
          const svCompanies = companies.filter(c => c.economicActivity === sv.name).length;
          tree += `  │   └── ${sv.name} [id:${sv.id}] (${svCompanies} empresas)\n`;
        }
      }
      tree += '\n';
    }

    return tree;
  }, [taxonomy, companies]);

  const handleAnalyze = async () => {
    setLoading(true);
    setResult(null);
    setSelectedIds(new Set());
    setAppliedIds(new Set());
    setStage('Construyendo árbol taxonómico...');

    try {
      const taxonomyTree = buildTaxonomyTree();

      const orphanVerticals = taxonomy.orphanVerticals.map(name => ({
        name,
        count: companies.filter(c => c.vertical === name).length,
      }));
      const orphanSubVerticals = taxonomy.orphanSubVerticals.map(name => ({
        name,
        count: companies.filter(c => c.economicActivity === name).length,
      }));

      const companyCounts = `Total empresas: ${companies.length}\n` +
        `Empresas con categoría asignada: ${companies.filter(c => c.category).length}\n` +
        `Empresas con vertical asignada: ${companies.filter(c => c.vertical).length}\n` +
        `Empresas con sub-vertical asignada: ${companies.filter(c => c.economicActivity).length}`;

      setStage('Analizando con IA...');
      const timer1 = setTimeout(() => setStage('Evaluando relaciones...'), 8000);
      const timer2 = setTimeout(() => setStage('Generando sugerencias...'), 16000);

      const { data, error } = await supabase.functions.invoke('taxonomy-organize', {
        body: {
          taxonomyTree,
          definitions,
          orphanVerticals,
          orphanSubVerticals,
          companyCounts,
        },
      });

      clearTimeout(timer1);
      clearTimeout(timer2);

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setResult(data as OrganizeResult);
      // Pre-select high priority suggestions
      const highPriority = (data.suggestions || [])
        .filter((s: Suggestion) => s.priority === 'high')
        .map((s: Suggestion) => s.id);
      setSelectedIds(new Set(highPriority));

      setStage('¡Listo!');
    } catch (err: any) {
      console.error('Taxonomy organize error:', err);
      showError('Error', err.message || 'No se pudo analizar la taxonomía');
    } finally {
      setTimeout(() => {
        setLoading(false);
        setStage('');
      }, 800);
    }
  };

  const toggleSuggestion = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (!result) return;
    const available = result.suggestions.filter(s => !appliedIds.has(s.id));
    if (selectedIds.size === available.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(available.map(s => s.id)));
    }
  };

  const applySuggestion = async (suggestion: Suggestion) => {
    try {
      switch (suggestion.action) {
        case 'rename': {
          if (!suggestion.new_name) break;
          if (suggestion.target_type === 'category') {
            await taxonomy.renameCategory(suggestion.target_name, suggestion.new_name);
          } else if (suggestion.target_type === 'vertical' && suggestion.target_id) {
            await taxonomy.renameVertical(suggestion.target_id, suggestion.new_name);
          } else if (suggestion.target_type === 'sub_vertical' && suggestion.target_id) {
            await taxonomy.renameSubVertical(suggestion.target_id, suggestion.new_name);
          }
          break;
        }
        case 'merge': {
          if (suggestion.target_type === 'vertical') {
            if (suggestion.target_id && suggestion.destination_id) {
              await taxonomy.mergeVertical(suggestion.target_id, suggestion.destination_id);
            } else if (!suggestion.target_id && suggestion.destination_id) {
              // Orphan merge
              await taxonomy.mergeVerticalName(suggestion.target_name, suggestion.destination_id);
            }
          } else if (suggestion.target_type === 'sub_vertical' && suggestion.target_id && suggestion.destination_id) {
            await taxonomy.mergeSubVertical(suggestion.target_id, suggestion.destination_id);
          }
          break;
        }
        case 'delete': {
          if (suggestion.target_type === 'category') {
            await taxonomy.deleteCategory(suggestion.target_name);
          } else if (suggestion.target_type === 'vertical' && suggestion.target_id) {
            await taxonomy.deleteVertical(suggestion.target_id);
          } else if (suggestion.target_type === 'sub_vertical' && suggestion.target_id) {
            await taxonomy.deleteSubVertical(suggestion.target_id);
          }
          break;
        }
        case 'move': {
          if (suggestion.target_type === 'vertical' && suggestion.target_id && suggestion.destination_name) {
            // Find current category
            const currentCat = taxonomy.categoryVerticalLinks.find(l => l.vertical_id === suggestion.target_id);
            if (currentCat) {
              await taxonomy.moveVerticalToCategory(suggestion.target_id, currentCat.category, suggestion.destination_name);
            }
          }
          break;
        }
        case 'link': {
          if (suggestion.target_type === 'vertical' && suggestion.destination_name) {
            // Create the vertical if orphan, then link
            let vertId = suggestion.target_id;
            if (!vertId) {
              const existing = taxonomy.verticals.find(v => v.name === suggestion.target_name);
              if (existing) {
                vertId = existing.id;
              } else {
                const newVert = await taxonomy.addVertical(suggestion.target_name);
                vertId = newVert?.id;
              }
            }
            if (vertId) {
              await taxonomy.linkCategoryVertical(suggestion.destination_name, vertId);
            }
          } else if (suggestion.target_type === 'sub_vertical' && suggestion.destination_id) {
            let svId = suggestion.target_id;
            if (!svId) {
              const existing = taxonomy.subVerticals.find(sv => sv.name === suggestion.target_name);
              if (existing) {
                svId = existing.id;
              } else {
                const newSv = await taxonomy.addSubVertical(suggestion.target_name);
                svId = newSv?.id;
              }
            }
            if (svId) {
              await taxonomy.linkVerticalSubVertical(suggestion.destination_id, svId);
            }
          }
          break;
        }
        case 'share': {
          if (suggestion.target_type === 'vertical' && suggestion.target_id && suggestion.destination_name) {
            await taxonomy.shareVerticalWithCategory(suggestion.target_id, suggestion.destination_name);
          } else if (suggestion.target_type === 'sub_vertical' && suggestion.target_id && suggestion.destination_id) {
            await taxonomy.shareSubVerticalWithVertical(suggestion.target_id, suggestion.destination_id);
          }
          break;
        }
      }
      return true;
    } catch (err) {
      console.error('Error applying suggestion:', err);
      return false;
    }
  };

  const handleApplySelected = async () => {
    if (selectedIds.size === 0 || !result) return;
    setApplying(true);

    const toApply = result.suggestions.filter(s => selectedIds.has(s.id) && !appliedIds.has(s.id));
    let successCount = 0;
    const newApplied = new Set(appliedIds);

    for (const suggestion of toApply) {
      const ok = await applySuggestion(suggestion);
      if (ok) {
        successCount++;
        newApplied.add(suggestion.id);
      }
    }

    setAppliedIds(newApplied);
    setSelectedIds(new Set());
    setApplying(false);

    if (successCount > 0) {
      await taxonomy.refresh();
      showSuccess('Cambios aplicados', `${successCount} sugerencia${successCount > 1 ? 's' : ''} aplicada${successCount > 1 ? 's' : ''}`);
    }
  };

  const getSuggestionDescription = (s: Suggestion) => {
    switch (s.action) {
      case 'merge':
        return `"${s.target_name}" → fusionar con "${s.destination_name}"`;
      case 'rename':
        return `"${s.target_name}" → renombrar a "${s.new_name}"`;
      case 'delete':
        return `Eliminar "${s.target_name}"`;
      case 'move':
        return `"${s.target_name}" → mover a "${s.destination_name}"`;
      case 'link':
        return `"${s.target_name}" → vincular a "${s.destination_name}"`;
      case 'share':
        return `"${s.target_name}" → compartir con "${s.destination_name}"`;
      default:
        return s.target_name;
    }
  };

  const groupedByPriority = result?.suggestions.reduce(
    (acc, s) => {
      acc[s.priority].push(s);
      return acc;
    },
    { high: [] as Suggestion[], medium: [] as Suggestion[], low: [] as Suggestion[] }
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Organizar taxonomía con IA
          </DialogTitle>
          <DialogDescription className="text-xs">
            La IA analizará el árbol taxonómico completo y sugerirá cambios para mejorar la consistencia y organización.
          </DialogDescription>
        </DialogHeader>

        <Separator />

        <div className="flex-1 min-h-0 overflow-hidden">
          {loading && <TaxonomyLoadingAnimation stage={stage} />}

          {!loading && !result && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="rounded-full bg-primary/10 p-4">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium">Análisis de taxonomía</p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Se enviará el árbol completo de categorías, verticales, sub-verticales y valores huérfanos a la IA para obtener sugerencias de organización.
                </p>
              </div>
              <Button onClick={handleAnalyze} className="gap-2">
                <Sparkles className="h-4 w-4" />
                Analizar taxonomía
              </Button>
            </div>
          )}

          {!loading && result && (
            <ScrollArea className="h-[calc(90vh-220px)] px-6 py-4">
              <div className="space-y-4 pb-4">
                {/* Summary */}
                <div className="rounded-lg bg-muted/50 border border-border p-3">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <p className="text-xs leading-relaxed">{result.summary}</p>
                  </div>
                </div>

                {result.suggestions.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle2 className="h-8 w-8 text-success mx-auto mb-2" />
                    <p className="text-sm font-medium">La taxonomía está bien organizada</p>
                    <p className="text-xs text-muted-foreground">No se encontraron sugerencias de mejora.</p>
                  </div>
                ) : (
                  <>
                    {/* Select all */}
                    <div className="flex items-center justify-between">
                      <Button variant="ghost" size="sm" className="text-xs gap-1.5" onClick={toggleAll}>
                        <Checkbox checked={selectedIds.size === result.suggestions.filter(s => !appliedIds.has(s.id)).length && selectedIds.size > 0} />
                        Seleccionar todas ({result.suggestions.length})
                      </Button>
                      <Badge variant="outline" className="text-[10px]">
                        {selectedIds.size} seleccionada{selectedIds.size !== 1 ? 's' : ''}
                      </Badge>
                    </div>

                    {/* Suggestions grouped by priority */}
                    {(['high', 'medium', 'low'] as const).map(priority => {
                      const items = groupedByPriority?.[priority] || [];
                      if (items.length === 0) return null;
                      const priorityLabel = priority === 'high' ? 'Alta prioridad' : priority === 'medium' ? 'Media prioridad' : 'Baja prioridad';
                      const PriorityIcon = priority === 'high' ? AlertTriangle : priority === 'medium' ? Info : Info;

                      return (
                        <div key={priority} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <PriorityIcon className={cn("h-3.5 w-3.5", priority === 'high' ? 'text-destructive' : priority === 'medium' ? 'text-amber-600' : 'text-muted-foreground')} />
                            <span className="text-xs font-semibold uppercase tracking-wider">{priorityLabel}</span>
                            <Badge variant="outline" className="text-[10px]">{items.length}</Badge>
                          </div>
                          <div className="space-y-1.5">
                            {items.map(suggestion => {
                              const isApplied = appliedIds.has(suggestion.id);
                              const isSelected = selectedIds.has(suggestion.id);
                              return (
                                <div
                                  key={suggestion.id}
                                  className={cn(
                                    "rounded-lg border p-3 transition-colors",
                                    isApplied
                                      ? "border-success/30 bg-success/5 opacity-60"
                                      : isSelected
                                        ? "border-primary/30 bg-primary/5"
                                        : "border-border hover:bg-muted/30"
                                  )}
                                >
                                  <div className="flex items-start gap-3">
                                    {!isApplied && (
                                      <Checkbox
                                        checked={isSelected}
                                        onCheckedChange={() => toggleSuggestion(suggestion.id)}
                                        className="mt-0.5"
                                      />
                                    )}
                                    {isApplied && (
                                      <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
                                    )}
                                    <div className="flex-1 min-w-0 space-y-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <Badge
                                          variant="outline"
                                          className={cn("text-[10px] gap-1", PRIORITY_COLORS[suggestion.priority])}
                                        >
                                          {ACTION_ICONS[suggestion.action]}
                                          {ACTION_LABELS[suggestion.action]}
                                        </Badge>
                                        <Badge variant="secondary" className="text-[10px]">
                                          {TYPE_LABELS[suggestion.target_type]}
                                        </Badge>
                                        {suggestion.affected_companies > 0 && (
                                          <span className="text-[10px] text-muted-foreground">
                                            {suggestion.affected_companies} empresa{suggestion.affected_companies !== 1 ? 's' : ''}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-sm font-medium">
                                        {getSuggestionDescription(suggestion)}
                                      </p>
                                      <p className="text-xs text-muted-foreground">{suggestion.reason}</p>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Footer */}
        {result && result.suggestions.length > 0 && (
          <>
            <Separator />
            <div className="flex items-center justify-between px-6 py-3">
              <Button variant="ghost" size="sm" onClick={handleAnalyze} disabled={loading} className="gap-1.5 text-xs">
                <Sparkles className="h-3.5 w-3.5" />
                Re-analizar
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>Cerrar</Button>
                <Button
                  size="sm"
                  onClick={handleApplySelected}
                  disabled={selectedIds.size === 0 || applying}
                  className="gap-1.5"
                >
                  {applying ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  Aplicar {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
