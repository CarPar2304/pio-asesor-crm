import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCRM } from '@/contexts/CRMContext';
import { useProfile } from '@/contexts/ProfileContext';
import { showSuccess, showError } from '@/lib/toast';
import { Search, UserCog, GitBranch, Users } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  offerId: string;
}

export default function PipelineBulkActionsDialog({ open, onClose, offerId }: Props) {
  const { getEntriesForOffer, getStagesForOffer, moveCompanyToStage, updateEntryAssignment } = usePortfolio();
  const { companies } = useCRM();
  const { allProfiles } = useProfile();

  const entries = getEntriesForOffer(offerId);
  const stages = getStagesForOffer(offerId);

  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<'stage' | 'assign'>('stage');
  const [targetStage, setTargetStage] = useState<string>('');
  const [targetAssignee, setTargetAssignee] = useState<string>('none');
  const [saving, setSaving] = useState(false);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter(e => {
      if (stageFilter !== 'all' && e.stageId !== stageFilter) return false;
      if (!q) return true;
      const c = companies.find(co => co.id === e.companyId);
      if (!c) return false;
      return c.tradeName.toLowerCase().includes(q)
        || c.legalName.toLowerCase().includes(q)
        || c.nit?.replace(/[.\-\s]/g, '').includes(q.replace(/[.\-\s]/g, ''));
    });
  }, [entries, companies, search, stageFilter]);

  const allVisibleSelected = filteredEntries.length > 0 && filteredEntries.every(e => selected.has(e.id));

  const toggleAll = () => {
    const next = new Set(selected);
    if (allVisibleSelected) {
      filteredEntries.forEach(e => next.delete(e.id));
    } else {
      filteredEntries.forEach(e => next.add(e.id));
    }
    setSelected(next);
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const handleApply = async () => {
    if (selected.size === 0) {
      showError('Selecciona empresas', 'Marca al menos una empresa');
      return;
    }
    if (action === 'stage' && !targetStage) {
      showError('Selecciona etapa', 'Elige la etapa destino');
      return;
    }
    setSaving(true);
    try {
      const ids = Array.from(selected);
      if (action === 'stage') {
        for (const id of ids) {
          const entry = entries.find(e => e.id === id);
          if (entry && entry.stageId !== targetStage) {
            await moveCompanyToStage(id, targetStage);
          }
        }
        const stageName = stages.find(s => s.id === targetStage)?.name ?? '';
        showSuccess('Etapas actualizadas', `${ids.length} empresas movidas a "${stageName}"`);
      } else {
        const assignTo = targetAssignee === 'none' ? null : targetAssignee;
        for (const id of ids) {
          await updateEntryAssignment(id, assignTo);
        }
        const name = assignTo ? (allProfiles.find(p => p.userId === assignTo)?.name ?? 'gestor') : 'sin asignar';
        showSuccess('Gestor actualizado', `${ids.length} empresas asignadas a ${name}`);
      }
      setSelected(new Set());
      onClose();
    } catch {
      showError('Error', 'No se pudieron aplicar los cambios');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" /> Acciones masivas
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Filters */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o NIT…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="h-9 w-44 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las etapas</SelectItem>
                {stages.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Selection list */}
          <div className="rounded-lg border border-border/60">
            <div className="flex items-center justify-between border-b border-border/40 px-3 py-2">
              <div className="flex items-center gap-2">
                <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAll} />
                <span className="text-xs font-medium">
                  {selected.size} seleccionadas · {filteredEntries.length} visibles
                </span>
              </div>
              {selected.size > 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelected(new Set())}>
                  Limpiar
                </Button>
              )}
            </div>
            <ScrollArea className="h-64">
              <div className="p-1.5">
                {filteredEntries.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">Sin empresas</p>
                ) : filteredEntries.map(entry => {
                  const company = companies.find(c => c.id === entry.companyId);
                  if (!company) return null;
                  const stage = stages.find(s => s.id === entry.stageId);
                  return (
                    <label
                      key={entry.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60"
                    >
                      <Checkbox
                        checked={selected.has(entry.id)}
                        onCheckedChange={() => toggleOne(entry.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-xs font-medium">{company.tradeName}</p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {stage?.name} {company.nit ? `· ${company.nit}` : ''}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {/* Action selector */}
          <Tabs value={action} onValueChange={v => setAction(v as 'stage' | 'assign')}>
            <TabsList className="grid w-full grid-cols-2 h-8">
              <TabsTrigger value="stage" className="text-xs gap-1.5"><GitBranch className="h-3 w-3" /> Cambiar etapa</TabsTrigger>
              <TabsTrigger value="assign" className="text-xs gap-1.5"><UserCog className="h-3 w-3" /> Cambiar gestor</TabsTrigger>
            </TabsList>
            <TabsContent value="stage" className="mt-2">
              <Label className="text-xs">Etapa destino</Label>
              <Select value={targetStage} onValueChange={setTargetStage}>
                <SelectTrigger className="mt-1 h-9 text-xs">
                  <SelectValue placeholder="Selecciona etapa" />
                </SelectTrigger>
                <SelectContent>
                  {stages.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TabsContent>
            <TabsContent value="assign" className="mt-2">
              <Label className="text-xs">Gestor</Label>
              <Select value={targetAssignee} onValueChange={setTargetAssignee}>
                <SelectTrigger className="mt-1 h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar</SelectItem>
                  {allProfiles.map(p => (
                    <SelectItem key={p.userId} value={p.userId}>{p.name || 'Sin nombre'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
            <Button size="sm" onClick={handleApply} disabled={saving || selected.size === 0}>
              {saving ? 'Aplicando…' : `Aplicar a ${selected.size}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
