import React, { useState, useMemo } from 'react';
import { useTaxonomy, TaxonomyVertical, TaxonomySubVertical } from '@/contexts/TaxonomyContext';
import { useCustomFields } from '@/contexts/CustomFieldsContext';
import { useCRM } from '@/contexts/CRMContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  Plus, Trash2, Pencil, Check, X, ChevronRight, AlertTriangle, GitBranch,
  ArrowRight, Merge, Tag, Layers, FolderTree, ChevronDown, MoreHorizontal, ArrowRightLeft, Link2
} from 'lucide-react';
import { showSuccess, showError } from '@/lib/toast';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
}

function InlineEdit({ value, onSave, onCancel }: { value: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(value);
  return (
    <div className="flex items-center gap-1">
      <Input className="h-7 text-sm flex-1" value={v} onChange={e => setV(e.target.value)} autoFocus
        onKeyDown={e => { if (e.key === 'Enter' && v.trim()) onSave(v.trim()); if (e.key === 'Escape') onCancel(); }} />
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => v.trim() && onSave(v.trim())}><Check className="h-3 w-3" /></Button>
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onCancel}><X className="h-3 w-3" /></Button>
    </div>
  );
}

/* Connector line between columns */
function FlowConnector({ visible }: { visible: boolean }) {
  return (
    <div className={cn(
      "flex items-center justify-center w-8 shrink-0 transition-opacity duration-300",
      visible ? "opacity-100" : "opacity-0"
    )}>
      <svg width="32" height="60" viewBox="0 0 32 60" className="text-muted-foreground/40">
        <line x1="0" y1="30" x2="24" y2="30" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" />
        <polygon points="24,25 32,30 24,35" fill="currentColor" />
      </svg>
    </div>
  );
}

function TaxonomyTab() {
  const { companies } = useCRM();
  const taxonomy = useTaxonomy();
  const {
    verticals, subVerticals, categoryVerticalLinks, verticalSubVerticalLinks,
    allCategories, categories, orphanVerticals, orphanSubVerticals
  } = taxonomy;

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedVerticalId, setSelectedVerticalId] = useState<string | null>(null);
  const [showOrphans, setShowOrphans] = useState(false);

  // Editing states
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newVerticalName, setNewVerticalName] = useState('');
  const [newSubVerticalName, setNewSubVerticalName] = useState('');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingVertical, setEditingVertical] = useState<string | null>(null);
  const [editingSubVertical, setEditingSubVertical] = useState<string | null>(null);
  const [editingLabels, setEditingLabels] = useState<{ l1: string; l2: string } | null>(null);
  const [mergeTarget, setMergeTarget] = useState<{ name: string; type: 'vertical' | 'subvertical' } | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [mergeManagedTarget, setMergeManagedTarget] = useState<{ id: string; name: string; type: 'vertical' | 'subvertical' } | null>(null);
  const [mergeManagedTargetId, setMergeManagedTargetId] = useState('');
  const [linkingVertical, setLinkingVertical] = useState(false);
  const [linkingSubVertical, setLinkingSubVertical] = useState(false);
  const [sharingVerticalId, setSharingVerticalId] = useState<string | null>(null);
  const [sharingSubVerticalId, setSharingSubVerticalId] = useState<string | null>(null);

  const companiesUsingCategory = (cat: string) => companies.filter(c => c.category === cat).length;
  const companiesUsingVertical = (name: string) => companies.filter(c => c.vertical === name).length;
  const companiesUsingSubVertical = (name: string) => companies.filter(c => c.economicActivity === name).length;

  // Get config for selected category
  const categoryConfig = selectedCategory ? taxonomy.getCategoryConfig(selectedCategory) : undefined;
  const level1Label = categoryConfig?.level1_label || 'Verticales';
  const level2Label = categoryConfig?.level2_label || 'Sub-verticales';

  // Verticals linked to selected category
  const linkedVerticals = useMemo(() => {
    if (!selectedCategory) return [];
    const linkedIds = categoryVerticalLinks.filter(l => l.category === selectedCategory).map(l => l.vertical_id);
    return verticals.filter(v => linkedIds.includes(v.id));
  }, [selectedCategory, categoryVerticalLinks, verticals]);

  // Verticals NOT linked to selected category (for linking dialog)
  const unlinkableVerticals = useMemo(() => {
    if (!selectedCategory) return [];
    const linkedIds = new Set(categoryVerticalLinks.filter(l => l.category === selectedCategory).map(l => l.vertical_id));
    return verticals.filter(v => !linkedIds.has(v.id));
  }, [selectedCategory, categoryVerticalLinks, verticals]);

  // Sub-verticals linked to selected vertical
  const linkedSubVerticals = useMemo(() => {
    if (!selectedVerticalId) return [];
    const linkedIds = verticalSubVerticalLinks.filter(l => l.vertical_id === selectedVerticalId).map(l => l.sub_vertical_id);
    return subVerticals.filter(sv => linkedIds.includes(sv.id));
  }, [selectedVerticalId, verticalSubVerticalLinks, subVerticals]);

  // Sub-verticals NOT linked to selected vertical
  const unlinkableSubVerticals = useMemo(() => {
    if (!selectedVerticalId) return [];
    const linkedIds = new Set(verticalSubVerticalLinks.filter(l => l.vertical_id === selectedVerticalId).map(l => l.sub_vertical_id));
    return subVerticals.filter(sv => !linkedIds.has(sv.id));
  }, [selectedVerticalId, verticalSubVerticalLinks, subVerticals]);

  const selectedVertical = verticals.find(v => v.id === selectedVerticalId);

  // Other categories for moving
  const otherCategories = allCategories.filter(c => c !== selectedCategory);
  // Other verticals for moving sub-verticals
  const otherVerticals = verticals.filter(v => v.id !== selectedVerticalId);

  const orphanCount = orphanVerticals.length + orphanSubVerticals.length;

  // Handlers
  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name || allCategories.includes(name)) return;
    await taxonomy.addCategory(name);
    setNewCategoryName('');
    showSuccess('Categoría creada', name);
  };

  const handleDeleteCategory = async (cat: string) => {
    if (companiesUsingCategory(cat) > 0) {
      showError('No se puede eliminar', `${companiesUsingCategory(cat)} empresas usan esta categoría`);
      return;
    }
    await taxonomy.deleteCategory(cat);
    if (selectedCategory === cat) { setSelectedCategory(null); setSelectedVerticalId(null); }
    showSuccess('Categoría eliminada', cat);
  };

  const handleRenameCategory = async (oldName: string, newName: string) => {
    await taxonomy.renameCategory(oldName, newName);
    if (selectedCategory === oldName) setSelectedCategory(newName);
    setEditingCategory(null);
    showSuccess('Categoría renombrada');
  };

  const handleAddVertical = async () => {
    const name = newVerticalName.trim();
    if (!name) return;
    const existing = verticals.find(v => v.name.toLowerCase() === name.toLowerCase());
    if (existing) { showError('Ya existe', `"${name}" ya existe`); return; }
    const v = await taxonomy.addVertical(name);
    if (v && selectedCategory) {
      await taxonomy.linkCategoryVertical(selectedCategory, v.id);
    }
    setNewVerticalName('');
    showSuccess(`${level1Label.slice(0, -1)} creada`, name);
  };

  const handleAddSubVertical = async () => {
    const name = newSubVerticalName.trim();
    if (!name) return;
    const existing = subVerticals.find(sv => sv.name.toLowerCase() === name.toLowerCase());
    if (existing) { showError('Ya existe', `"${name}" ya existe`); return; }
    const sv = await taxonomy.addSubVertical(name);
    if (sv && selectedVerticalId) {
      await taxonomy.linkVerticalSubVertical(selectedVerticalId, sv.id);
    }
    setNewSubVerticalName('');
    showSuccess(`${level2Label.slice(0, -1)} creada`, name);
  };

  const handleDeleteVertical = async (id: string) => {
    const v = verticals.find(vt => vt.id === id);
    if (v && companiesUsingVertical(v.name) > 0) {
      showError('No se puede eliminar', `${companiesUsingVertical(v.name)} empresas usan esta vertical`);
      return;
    }
    await taxonomy.deleteVertical(id);
    if (selectedVerticalId === id) setSelectedVerticalId(null);
    showSuccess(`${level1Label.slice(0, -1)} eliminada`);
  };

  const handleDeleteSubVertical = async (id: string) => {
    const sv = subVerticals.find(s => s.id === id);
    if (sv && companiesUsingSubVertical(sv.name) > 0) {
      showError('No se puede eliminar', `${companiesUsingSubVertical(sv.name)} empresas usan esta sub-vertical`);
      return;
    }
    await taxonomy.deleteSubVertical(id);
    showSuccess(`${level2Label.slice(0, -1)} eliminada`);
  };

  const handleUnlinkVertical = async (vId: string) => {
    if (!selectedCategory) return;
    await taxonomy.unlinkCategoryVertical(selectedCategory, vId);
    if (selectedVerticalId === vId) setSelectedVerticalId(null);
    showSuccess('Desvinculada');
  };

  const handleUnlinkSubVertical = async (svId: string) => {
    if (!selectedVerticalId) return;
    await taxonomy.unlinkVerticalSubVertical(selectedVerticalId, svId);
    showSuccess('Desvinculada');
  };

  const handleMoveVertical = async (vId: string, toCategory: string) => {
    if (!selectedCategory) return;
    await taxonomy.moveVerticalToCategory(vId, selectedCategory, toCategory);
    showSuccess('Movida', `→ ${toCategory}`);
  };

  const handleMoveSubVertical = async (svId: string, toVerticalId: string) => {
    if (!selectedVerticalId) return;
    const target = verticals.find(v => v.id === toVerticalId);
    await taxonomy.moveSubVerticalToVertical(svId, selectedVerticalId, toVerticalId);
    showSuccess('Movida', `→ ${target?.name || ''}`);
  };

  const handleSaveLabels = async () => {
    if (!selectedCategory || !editingLabels) return;
    await taxonomy.updateCategoryLabels(selectedCategory, editingLabels.l1, editingLabels.l2);
    setEditingLabels(null);
    showSuccess('Etiquetas actualizadas');
  };

  const handleMerge = async () => {
    if (!mergeTarget || !mergeTargetId) return;
    if (mergeTarget.type === 'vertical') {
      await taxonomy.mergeVerticalName(mergeTarget.name, mergeTargetId);
      await taxonomy.refresh();
      showSuccess('Fusionadas', `"${mergeTarget.name}" → fusionada`);
    }
    setMergeTarget(null);
    setMergeTargetId('');
  };

  const handleMergeManaged = async () => {
    if (!mergeManagedTarget || !mergeManagedTargetId) return;
    if (mergeManagedTarget.type === 'vertical') {
      await taxonomy.mergeVertical(mergeManagedTarget.id, mergeManagedTargetId);
      if (selectedVerticalId === mergeManagedTarget.id) setSelectedVerticalId(null);
      showSuccess('Fusionada', `"${mergeManagedTarget.name}" fusionada exitosamente`);
    } else {
      await taxonomy.mergeSubVertical(mergeManagedTarget.id, mergeManagedTargetId);
      showSuccess('Fusionada', `"${mergeManagedTarget.name}" fusionada exitosamente`);
    }
    setMergeManagedTarget(null);
    setMergeManagedTargetId('');
  };

  // Categories where a vertical is already linked (for "shared with" display)
  const getCategoriesForVertical = (vId: string) => categoryVerticalLinks.filter(l => l.vertical_id === vId).map(l => l.category);
  // Verticals where a sub-vertical is already linked
  const getVerticalsForSubVertical = (svId: string) => verticalSubVerticalLinks.filter(l => l.sub_vertical_id === svId).map(l => l.vertical_id);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-lg border border-border p-3 space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <FolderTree className="h-3.5 w-3.5" /> Taxonomía de clasificación
        </p>
        <p className="text-xs text-muted-foreground">
          Selecciona una categoría para ver sus ramas. Puedes mover, vincular o desvincular elementos entre ramas.
        </p>
      </div>

      {/* Merge dialog inline (orphan) */}
      {mergeTarget && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2 animate-fade-in">
          <p className="text-xs font-semibold">Fusionar "{mergeTarget.name}" con:</p>
          <Select value={mergeTargetId} onValueChange={setMergeTargetId}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Seleccionar destino..." /></SelectTrigger>
            <SelectContent>
              {verticals.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Button size="sm" variant="default" onClick={handleMerge} disabled={!mergeTargetId}>Fusionar</Button>
            <Button size="sm" variant="ghost" onClick={() => setMergeTarget(null)}>Cancelar</Button>
          </div>
        </div>
      )}

      {/* Merge dialog inline (managed) */}
      {mergeManagedTarget && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2 animate-fade-in">
          <p className="text-xs font-semibold">Fusionar "{mergeManagedTarget.name}" con:</p>
          <Select value={mergeManagedTargetId} onValueChange={setMergeManagedTargetId}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Seleccionar destino..." /></SelectTrigger>
            <SelectContent>
              {(mergeManagedTarget.type === 'vertical' ? verticals : subVerticals)
                .filter(v => v.id !== mergeManagedTarget.id)
                .map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Button size="sm" variant="default" onClick={handleMergeManaged} disabled={!mergeManagedTargetId}>Fusionar</Button>
            <Button size="sm" variant="ghost" onClick={() => setMergeManagedTarget(null)}>Cancelar</Button>
          </div>
        </div>
      )}

      {/* Flow breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
        <span className={cn("font-medium", selectedCategory && "text-primary")}>Categoría</span>
        <ArrowRight className="h-3 w-3" />
        <span className={cn("font-medium", selectedVerticalId && "text-primary")}>{level1Label}</span>
        <ArrowRight className="h-3 w-3" />
        <span>{level2Label}</span>
      </div>

      {/* 3-column flow */}
      <div className="flex items-start gap-0 min-h-[200px]">
        {/* Column 1: Categories */}
        <Card className="flex flex-col flex-1 min-w-0">
          <CardHeader className="pb-2 px-3 pt-3">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5" /> Categorías
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-2 flex-1 flex flex-col min-h-0">
            <div className="flex items-center gap-1 mb-2">
              <Input className="h-7 text-xs flex-1" placeholder="Nueva categoría..." value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(); }} />
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleAddCategory} disabled={!newCategoryName.trim()}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            <ScrollArea className="max-h-[420px]">
              <div className="space-y-0.5 pr-2">
                {allCategories.map(cat => {
                  const isSelected = selectedCategory === cat;
                  const count = companiesUsingCategory(cat);
                  return (
                    <div key={cat}>
                      {editingCategory === cat ? (
                        <div className="px-1 py-1">
                          <InlineEdit value={cat} onSave={n => handleRenameCategory(cat, n)} onCancel={() => setEditingCategory(null)} />
                        </div>
                      ) : (
                        <button
                          className={cn(
                            'w-full flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-left transition-all duration-200 group',
                            isSelected ? 'bg-primary/10 text-primary font-medium shadow-sm' : 'hover:bg-accent'
                          )}
                          onClick={() => { setSelectedCategory(isSelected ? null : cat); setSelectedVerticalId(null); }}
                        >
                          <ChevronRight className={cn('h-3 w-3 shrink-0 transition-transform duration-200', isSelected && 'rotate-90')} />
                          <span className="flex-1 truncate">{cat}</span>
                          {count > 0 && <span className="text-[10px] text-muted-foreground">{count}</span>}
                          <div className="hidden group-hover:flex items-center shrink-0">
                            <button className="p-0.5" onClick={e => { e.stopPropagation(); setEditingCategory(cat); }}>
                              <Pencil className="h-2.5 w-2.5 text-muted-foreground" />
                            </button>
                            <button className="p-0.5" onClick={e => { e.stopPropagation(); handleDeleteCategory(cat); }}>
                              <Trash2 className="h-2.5 w-2.5 text-destructive" />
                            </button>
                          </div>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Connector 1→2 */}
        <FlowConnector visible={!!selectedCategory} />

        {/* Column 2: Verticals */}
        <div className={cn(
          "flex flex-col flex-1 min-w-0 transition-all duration-300",
          selectedCategory ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
        )}>
          {selectedCategory && (
            <Card className="flex flex-col h-full animate-fade-in">
              <CardHeader className="pb-2 px-3 pt-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5" /> {level1Label}
                  </CardTitle>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-5 w-5" title="Editar etiquetas"
                      onClick={() => setEditingLabels({ l1: level1Label, l2: level2Label })}>
                      <Pencil className="h-2.5 w-2.5 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
                {editingLabels && (
                  <div className="space-y-1 mt-1 animate-fade-in">
                    <Input className="h-6 text-[10px]" placeholder="Nombre nivel 1" value={editingLabels.l1}
                      onChange={e => setEditingLabels(p => p ? { ...p, l1: e.target.value } : p)} />
                    <Input className="h-6 text-[10px]" placeholder="Nombre nivel 2" value={editingLabels.l2}
                      onChange={e => setEditingLabels(p => p ? { ...p, l2: e.target.value } : p)} />
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleSaveLabels}><Check className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setEditingLabels(null)}><X className="h-3 w-3" /></Button>
                    </div>
                  </div>
                )}
              </CardHeader>
              <CardContent className="px-3 pb-2 flex-1 flex flex-col min-h-0">
                <div className="flex items-center gap-1 mb-2">
                  <Input className="h-7 text-xs flex-1" placeholder={`Crear ${level1Label.toLowerCase().slice(0, -1)}...`} value={newVerticalName}
                    onChange={e => setNewVerticalName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddVertical(); }} />
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleAddVertical} disabled={!newVerticalName.trim()}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Link existing vertical button */}
                {unlinkableVerticals.length > 0 && (
                  <Collapsible open={linkingVertical} onOpenChange={setLinkingVertical}>
                    <CollapsibleTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full h-6 text-[10px] mb-2 gap-1">
                        <Link2 className="h-3 w-3" /> Vincular existente ({unlinkableVerticals.length})
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="animate-fade-in">
                      <div className="border rounded-md p-1 mb-2 max-h-24 overflow-y-auto space-y-0.5">
                        {unlinkableVerticals.map(v => (
                          <button key={v.id} className="w-full text-left text-xs px-2 py-1 rounded hover:bg-accent transition-colors truncate"
                            onClick={async () => {
                              await taxonomy.linkCategoryVertical(selectedCategory!, v.id);
                              showSuccess('Vinculada', v.name);
                            }}>
                            + {v.name}
                          </button>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                <ScrollArea className="max-h-[420px]">
                  <div className="space-y-0.5 pr-2">
                    {linkedVerticals.map(v => {
                      const isSelected = selectedVerticalId === v.id;
                      const count = companiesUsingVertical(v.name);
                      const sharedCats = getCategoriesForVertical(v.id).filter(c => c !== selectedCategory);
                      return (
                        <div key={v.id}>
                          {editingVertical === v.id ? (
                            <div className="px-1 py-1">
                              <InlineEdit value={v.name} onSave={n => { taxonomy.renameVertical(v.id, n); setEditingVertical(null); }} onCancel={() => setEditingVertical(null)} />
                            </div>
                          ) : (
                            <div className="flex items-center gap-0.5 group min-w-0">
                              <button
                                className={cn(
                                  'flex-1 min-w-0 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-left transition-all duration-200',
                                  isSelected ? 'bg-primary/10 text-primary font-medium shadow-sm' : 'hover:bg-accent'
                                )}
                                onClick={() => setSelectedVerticalId(isSelected ? null : v.id)}
                              >
                                <ChevronRight className={cn('h-3 w-3 shrink-0 transition-transform duration-200', isSelected && 'rotate-90')} />
                                <span className="flex-1 truncate">{v.name}</span>
                                {sharedCats.length > 0 && (
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-primary/30 text-primary/70">{sharedCats.length}+</Badge>
                                )}
                                {count > 0 && <span className="text-[10px] text-muted-foreground">{count}</span>}
                              </button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button className="p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-52">
                                  <DropdownMenuItem onClick={() => setEditingVertical(v.id)}>
                                    <Pencil className="h-3 w-3 mr-2" /> Renombrar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => { setMergeManagedTarget({ id: v.id, name: v.name, type: 'vertical' }); setMergeManagedTargetId(''); }}>
                                    <Merge className="h-3 w-3 mr-2" /> Fusionar con otra
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setSharingVerticalId(sharingVerticalId === v.id ? null : v.id)}>
                                    <Link2 className="h-3 w-3 mr-2" /> Compartir con categorías
                                  </DropdownMenuItem>
                                  {otherCategories.length > 0 && otherCategories.map(cat => (
                                    <DropdownMenuItem key={cat} onClick={() => handleMoveVertical(v.id, cat)}>
                                      <ArrowRightLeft className="h-3 w-3 mr-2" /> Mover a {cat}
                                    </DropdownMenuItem>
                                  ))}
                                  <DropdownMenuItem onClick={() => handleUnlinkVertical(v.id)} className="text-amber-600">
                                    <X className="h-3 w-3 mr-2" /> Desvincular
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleDeleteVertical(v.id)} className="text-destructive">
                                    <Trash2 className="h-3 w-3 mr-2" /> Eliminar
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          )}
                          {/* Share with categories inline */}
                          {sharingVerticalId === v.id && (
                            <div className="ml-4 mt-1 mb-1 p-2 rounded border border-border bg-muted/30 space-y-1 animate-fade-in">
                              <p className="text-[10px] font-medium text-muted-foreground">Compartida con:</p>
                              {sharedCats.map(cat => (
                                <div key={cat} className="flex items-center justify-between text-xs">
                                  <span>{cat}</span>
                                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={async () => {
                                    await taxonomy.unlinkCategoryVertical(cat, v.id);
                                    showSuccess('Desvinculada de', cat);
                                  }}><X className="h-3 w-3 text-destructive" /></Button>
                                </div>
                              ))}
                              <p className="text-[10px] font-medium text-muted-foreground mt-1">Agregar a:</p>
                              {allCategories.filter(c => c !== selectedCategory && !sharedCats.includes(c)).map(cat => (
                                <button key={cat} className="w-full text-left text-xs px-2 py-1 rounded hover:bg-accent transition-colors"
                                  onClick={async () => {
                                    await taxonomy.shareVerticalWithCategory(v.id, cat);
                                    showSuccess('Compartida con', cat);
                                  }}>+ {cat}</button>
                              ))}
                              <Button variant="ghost" size="sm" className="w-full h-6 text-[10px]" onClick={() => setSharingVerticalId(null)}>Cerrar</Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {linkedVerticals.length === 0 && (
                      <p className="text-xs text-muted-foreground italic py-4 text-center">
                        Sin {level1Label.toLowerCase()} vinculadas.<br />Crea una nueva o vincula una existente.
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Connector 2→3 */}
        <FlowConnector visible={!!selectedVerticalId} />

        {/* Column 3: Sub-verticals */}
        <div className={cn(
          "flex flex-col flex-1 min-w-0 transition-all duration-300",
          selectedVerticalId ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
        )}>
          {selectedVerticalId && (
            <Card className="flex flex-col h-full animate-fade-in">
              <CardHeader className="pb-2 px-3 pt-3">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <GitBranch className="h-3.5 w-3.5" /> {level2Label}
                  {selectedVertical && (
                    <Badge variant="secondary" className="text-[10px] font-normal ml-1">{selectedVertical.name}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-2 flex-1 flex flex-col min-h-0">
                <div className="flex items-center gap-1 mb-2">
                  <Input className="h-7 text-xs flex-1" placeholder={`Crear ${level2Label.toLowerCase().slice(0, -1)}...`} value={newSubVerticalName}
                    onChange={e => setNewSubVerticalName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddSubVertical(); }} />
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleAddSubVertical} disabled={!newSubVerticalName.trim()}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Link existing sub-vertical */}
                {unlinkableSubVerticals.length > 0 && (
                  <Collapsible open={linkingSubVertical} onOpenChange={setLinkingSubVertical}>
                    <CollapsibleTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full h-6 text-[10px] mb-2 gap-1">
                        <Link2 className="h-3 w-3" /> Vincular existente ({unlinkableSubVerticals.length})
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="animate-fade-in">
                      <div className="border rounded-md p-1 mb-2 max-h-24 overflow-y-auto space-y-0.5">
                        {unlinkableSubVerticals.map(sv => (
                          <button key={sv.id} className="w-full text-left text-xs px-2 py-1 rounded hover:bg-accent transition-colors truncate"
                            onClick={async () => {
                              await taxonomy.linkVerticalSubVertical(selectedVerticalId!, sv.id);
                              showSuccess('Vinculada', sv.name);
                            }}>
                            + {sv.name}
                          </button>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                <ScrollArea className="max-h-[420px]">
                  <div className="space-y-0.5 pr-2">
                    {linkedSubVerticals.map(sv => {
                      const count = companiesUsingSubVertical(sv.name);
                      const sharedVerts = getVerticalsForSubVertical(sv.id).filter(vid => vid !== selectedVerticalId);
                      const sharedVertNames = sharedVerts.map(vid => verticals.find(v => v.id === vid)?.name).filter(Boolean);
                      return (
                        <div key={sv.id}>
                          {editingSubVertical === sv.id ? (
                            <div className="px-1 py-1">
                              <InlineEdit value={sv.name} onSave={n => { taxonomy.renameSubVertical(sv.id, n); setEditingSubVertical(null); }} onCancel={() => setEditingSubVertical(null)} />
                            </div>
                          ) : (
                            <div className="flex items-center gap-0.5 group min-w-0">
                              <div className="flex-1 min-w-0 flex items-center gap-1 rounded-md px-2 py-1.5 text-xs hover:bg-accent transition-colors">
                                <span className="flex-1 truncate">{sv.name}</span>
                                {sharedVerts.length > 0 && (
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-primary/30 text-primary/70">{sharedVerts.length}+</Badge>
                                )}
                                {count > 0 && <span className="text-[10px] text-muted-foreground">{count}</span>}
                              </div>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button className="p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-52">
                                  <DropdownMenuItem onClick={() => setEditingSubVertical(sv.id)}>
                                    <Pencil className="h-3 w-3 mr-2" /> Renombrar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => { setMergeManagedTarget({ id: sv.id, name: sv.name, type: 'subvertical' }); setMergeManagedTargetId(''); }}>
                                    <Merge className="h-3 w-3 mr-2" /> Fusionar con otra
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setSharingSubVerticalId(sharingSubVerticalId === sv.id ? null : sv.id)}>
                                    <Link2 className="h-3 w-3 mr-2" /> Compartir con {level1Label.toLowerCase()}
                                  </DropdownMenuItem>
                                  {otherVerticals.map(v => (
                                    <DropdownMenuItem key={v.id} onClick={() => handleMoveSubVertical(sv.id, v.id)}>
                                      <ArrowRightLeft className="h-3 w-3 mr-2" /> Mover a {v.name}
                                    </DropdownMenuItem>
                                  ))}
                                  <DropdownMenuItem onClick={() => handleUnlinkSubVertical(sv.id)} className="text-amber-600">
                                    <X className="h-3 w-3 mr-2" /> Desvincular
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleDeleteSubVertical(sv.id)} className="text-destructive">
                                    <Trash2 className="h-3 w-3 mr-2" /> Eliminar
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          )}
                          {/* Share with verticals inline */}
                          {sharingSubVerticalId === sv.id && (
                            <div className="ml-4 mt-1 mb-1 p-2 rounded border border-border bg-muted/30 space-y-1 animate-fade-in">
                              <p className="text-[10px] font-medium text-muted-foreground">Compartida con:</p>
                              {sharedVertNames.map((vName, i) => (
                                <div key={sharedVerts[i]} className="flex items-center justify-between text-xs">
                                  <span>{vName}</span>
                                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={async () => {
                                    await taxonomy.unlinkVerticalSubVertical(sharedVerts[i], sv.id);
                                    showSuccess('Desvinculada de', vName || '');
                                  }}><X className="h-3 w-3 text-destructive" /></Button>
                                </div>
                              ))}
                              <p className="text-[10px] font-medium text-muted-foreground mt-1">Agregar a:</p>
                              {verticals.filter(v => v.id !== selectedVerticalId && !sharedVerts.includes(v.id)).map(v => (
                                <button key={v.id} className="w-full text-left text-xs px-2 py-1 rounded hover:bg-accent transition-colors"
                                  onClick={async () => {
                                    await taxonomy.shareSubVerticalWithVertical(sv.id, v.id);
                                    showSuccess('Compartida con', v.name);
                                  }}>+ {v.name}</button>
                              ))}
                              <Button variant="ghost" size="sm" className="w-full h-6 text-[10px]" onClick={() => setSharingSubVerticalId(null)}>Cerrar</Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {linkedSubVerticals.length === 0 && (
                      <p className="text-xs text-muted-foreground italic py-4 text-center">
                        Sin {level2Label.toLowerCase()} vinculadas.<br />Crea una nueva o vincula una existente.
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Orphan section - collapsible, below flow */}
      {orphanCount > 0 && (
        <Collapsible open={showOrphans} onOpenChange={setShowOrphans}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="w-full gap-2 text-xs text-amber-600 border-amber-500/30 hover:bg-amber-500/5">
              <AlertTriangle className="h-3.5 w-3.5" />
              Valores sin gestionar ({orphanCount})
              <ChevronDown className={cn("h-3 w-3 ml-auto transition-transform", showOrphans && "rotate-180")} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="animate-fade-in">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 mt-2 space-y-2">
              <p className="text-xs text-muted-foreground">
                Valores en empresas que no están en la taxonomía. Fusiona con una existente o crea como nueva.
              </p>
              {orphanVerticals.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Verticales ({orphanVerticals.length})</p>
                  <div className="flex flex-wrap gap-1">
                    {orphanVerticals.map(name => (
                      <div key={name} className="flex items-center gap-1">
                        <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600">
                          {name} ({companiesUsingVertical(name)})
                        </Badge>
                        <Button variant="ghost" size="icon" className="h-5 w-5" title="Fusionar"
                          onClick={() => { setMergeTarget({ name, type: 'vertical' }); setMergeTargetId(''); }}>
                          <Merge className="h-3 w-3 text-amber-600" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-5 w-5" title="Crear"
                          onClick={async () => { const v = await taxonomy.addVertical(name); if (v) showSuccess('Creada', name); }}>
                          <Plus className="h-3 w-3 text-primary" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {orphanSubVerticals.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Sub-verticales ({orphanSubVerticals.length})</p>
                  <div className="flex flex-wrap gap-1">
                    {orphanSubVerticals.map(name => (
                      <div key={name} className="flex items-center gap-1">
                        <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600">
                          {name} ({companiesUsingSubVertical(name)})
                        </Badge>
                        <Button variant="ghost" size="icon" className="h-5 w-5" title="Crear"
                          onClick={async () => { const sv = await taxonomy.addSubVertical(name); if (sv) showSuccess('Creada', name); }}>
                          <Plus className="h-3 w-3 text-primary" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
function FormFieldsTab() {
  const { sections, fields, addSection, addField, deleteSection, deleteField, updateField, updateSection } = useCustomFields();

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border p-3 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Campos personalizados</p>
        <p className="text-xs text-muted-foreground">Gestiona las secciones y campos del formulario de empresa.</p>
      </div>

      {sections.map(section => {
        const sectionFields = fields.filter(f => f.sectionId === section.id);
        return (
          <div key={section.id} className="rounded-md border border-border/50 p-2 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{section.name}</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                  const newName = prompt('Nuevo nombre de sección:', section.name);
                  if (newName?.trim()) updateSection(section.id, newName.trim());
                }}>
                  <Pencil className="h-3 w-3 text-muted-foreground" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteSection(section.id)}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </div>
            {sectionFields.map(f => (
              <div key={f.id} className="flex items-center gap-2 px-2 py-1 text-xs rounded hover:bg-accent/50">
                <span className="flex-1">{f.name}</span>
                <Badge variant="secondary" className="text-[10px]">{f.fieldType}</Badge>
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => deleteField(f.id)}>
                  <Trash2 className="h-2.5 w-2.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        );
      })}

      {fields.filter(f => !f.sectionId).length > 0 && (
        <div className="rounded-md border border-border/50 p-2 space-y-1">
          <span className="text-sm font-semibold text-muted-foreground">Sin sección</span>
          {fields.filter(f => !f.sectionId).map(f => (
            <div key={f.id} className="flex items-center gap-2 px-2 py-1 text-xs rounded hover:bg-accent/50">
              <span className="flex-1">{f.name}</span>
              <Badge variant="secondary" className="text-[10px]">{f.fieldType}</Badge>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => deleteField(f.id)}>
                <Trash2 className="h-2.5 w-2.5 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CRMSettingsDialog({ open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[min(90vh,52rem)] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle>Ajustes del CRM</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="taxonomy" className="flex-1 min-h-0 flex flex-col">
          <TabsList className="mx-6 shrink-0">
            <TabsTrigger value="taxonomy">Taxonomía</TabsTrigger>
            <TabsTrigger value="fields">Campos</TabsTrigger>
          </TabsList>
          <TabsContent value="taxonomy" className="flex-1 min-h-0 mt-0">
            <ScrollArea className="h-full px-6 pb-6">
              <TaxonomyTab />
            </ScrollArea>
          </TabsContent>
          <TabsContent value="fields" className="flex-1 min-h-0 mt-0">
            <ScrollArea className="h-full px-6 pb-6">
              <FormFieldsTab />
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
