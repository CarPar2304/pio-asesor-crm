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
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Plus, Trash2, Pencil, Check, X, ChevronRight, AlertTriangle, GitBranch,
  ArrowRight, Merge, Tag, Layers, FolderTree
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

function TaxonomyTab() {
  const { companies } = useCRM();
  const taxonomy = useTaxonomy();
  const {
    verticals, subVerticals, categoryVerticalLinks, verticalSubVerticalLinks,
    allCategories, categories, orphanVerticals, orphanSubVerticals
  } = taxonomy;

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedVerticalId, setSelectedVerticalId] = useState<string | null>(null);

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

  const companiesUsingCategory = (cat: string) => companies.filter(c => c.category === cat).length;
  const companiesUsingVertical = (name: string) => companies.filter(c => c.vertical === name).length;
  const companiesUsingSubVertical = (name: string) => companies.filter(c => c.economicActivity === name).length;

  // Get config for selected category
  const categoryConfig = selectedCategory ? taxonomy.getCategoryConfig(selectedCategory) : undefined;
  const level1Label = categoryConfig?.level1_label || 'Verticales';
  const level2Label = categoryConfig?.level2_label || 'Sub-verticales';

  // Verticals for selected category
  const categoryVerticals = useMemo(() => {
    if (!selectedCategory) return [];
    const linkedIds = categoryVerticalLinks.filter(l => l.category === selectedCategory).map(l => l.vertical_id);
    if (linkedIds.length === 0) return verticals;
    return verticals.filter(v => linkedIds.includes(v.id));
  }, [selectedCategory, categoryVerticalLinks, verticals]);

  // All verticals (for linking)
  const allVerticals = verticals;

  // Sub-verticals for selected vertical
  const verticalSubVerticals = useMemo(() => {
    if (!selectedVerticalId) return [];
    const linkedIds = verticalSubVerticalLinks.filter(l => l.vertical_id === selectedVerticalId).map(l => l.sub_vertical_id);
    if (linkedIds.length === 0) return [];
    return subVerticals.filter(sv => linkedIds.includes(sv.id));
  }, [selectedVerticalId, verticalSubVerticalLinks, subVerticals]);

  const isCategoryVerticalLinked = (cat: string, vId: string) =>
    categoryVerticalLinks.some(l => l.category === cat && l.vertical_id === vId);

  const isVerticalSubVerticalLinked = (vId: string, svId: string) =>
    verticalSubVerticalLinks.some(l => l.vertical_id === vId && l.sub_vertical_id === svId);

  // Handlers
  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name || allCategories.includes(name)) return;
    await taxonomy.addCategory(name);
    setNewCategoryName('');
    showSuccess('Categoría creada', name);
  };

  const handleDeleteCategory = async (cat: string) => {
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
    await taxonomy.deleteVertical(id);
    if (selectedVerticalId === id) setSelectedVerticalId(null);
    showSuccess(`${level1Label.slice(0, -1)} eliminada`);
  };

  const handleDeleteSubVertical = async (id: string) => {
    await taxonomy.deleteSubVertical(id);
    showSuccess(`${level2Label.slice(0, -1)} eliminada`);
  };

  const toggleLink = async (cat: string, vId: string) => {
    if (isCategoryVerticalLinked(cat, vId)) {
      await taxonomy.unlinkCategoryVertical(cat, vId);
    } else {
      await taxonomy.linkCategoryVertical(cat, vId);
    }
  };

  const toggleSubLink = async (vId: string, svId: string) => {
    if (isVerticalSubVerticalLinked(vId, svId)) {
      await taxonomy.unlinkVerticalSubVertical(vId, svId);
    } else {
      await taxonomy.linkVerticalSubVertical(vId, svId);
    }
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
      showSuccess('Verticales fusionadas', `"${mergeTarget.name}" → fusionada`);
    }
    setMergeTarget(null);
    setMergeTargetId('');
  };

  const selectedVertical = verticals.find(v => v.id === selectedVerticalId);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-lg border border-border p-3 space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <FolderTree className="h-3.5 w-3.5" /> Taxonomía de clasificación
        </p>
        <p className="text-xs text-muted-foreground">
          Selecciona una categoría para ver y gestionar sus ramas. Cada categoría puede tener nombres personalizados (ej. "Industrias" en vez de "Verticales"). Las empresas existentes no se modifican al cambiar la estructura.
        </p>
      </div>

      {/* Orphan alerts */}
      {(orphanVerticals.length > 0 || orphanSubVerticals.length > 0) && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
          <p className="text-xs font-semibold text-amber-600 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Valores sin gestionar
          </p>
          <p className="text-xs text-muted-foreground">
            Existen valores en empresas que no están en la taxonomía. Puedes fusionarlos con una opción existente o crearlos como nuevas entradas.
          </p>
          {orphanVerticals.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Verticales huérfanas ({orphanVerticals.length})</p>
              <div className="flex flex-wrap gap-1">
                {orphanVerticals.map(name => (
                  <div key={name} className="flex items-center gap-1">
                    <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600">
                      {name} ({companiesUsingVertical(name)} emp.)
                    </Badge>
                    <Button variant="ghost" size="icon" className="h-5 w-5" title="Fusionar con vertical existente"
                      onClick={() => { setMergeTarget({ name, type: 'vertical' }); setMergeTargetId(''); }}>
                      <Merge className="h-3 w-3 text-amber-600" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-5 w-5" title="Crear como nueva vertical"
                      onClick={async () => {
                        const v = await taxonomy.addVertical(name);
                        if (v) showSuccess('Vertical creada', name);
                      }}>
                      <Plus className="h-3 w-3 text-primary" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {orphanSubVerticals.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Sub-verticales huérfanas ({orphanSubVerticals.length})</p>
              <div className="flex flex-wrap gap-1">
                {orphanSubVerticals.map(name => (
                  <div key={name} className="flex items-center gap-1">
                    <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600">
                      {name} ({companiesUsingSubVertical(name)} emp.)
                    </Badge>
                    <Button variant="ghost" size="icon" className="h-5 w-5" title="Crear como nueva sub-vertical"
                      onClick={async () => {
                        const sv = await taxonomy.addSubVertical(name);
                        if (sv) showSuccess('Sub-vertical creada', name);
                      }}>
                      <Plus className="h-3 w-3 text-primary" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Merge dialog inline */}
      {mergeTarget && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
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

      {/* 3-column flow */}
      <div className="grid grid-cols-3 gap-3 min-h-[350px]">
        {/* Column 1: Categories */}
        <Card className="flex flex-col">
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
            <ScrollArea className="flex-1">
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
                            'w-full flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-left transition-colors group',
                            isSelected ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-accent'
                          )}
                          onClick={() => { setSelectedCategory(cat); setSelectedVerticalId(null); }}
                        >
                          <ChevronRight className={cn('h-3 w-3 shrink-0 transition-transform', isSelected && 'rotate-90')} />
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

        {/* Column 2: Verticals */}
        <Card className="flex flex-col">
          <CardHeader className="pb-2 px-3 pt-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5" /> {selectedCategory ? level1Label : 'Nivel 1'}
              </CardTitle>
              {selectedCategory && (
                <Button variant="ghost" size="icon" className="h-5 w-5" title="Editar etiquetas de rama"
                  onClick={() => setEditingLabels({ l1: level1Label, l2: level2Label })}>
                  <Pencil className="h-2.5 w-2.5 text-muted-foreground" />
                </Button>
              )}
            </div>
            {editingLabels && (
              <div className="space-y-1 mt-1">
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
            {!selectedCategory ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-xs text-muted-foreground text-center">Selecciona una categoría</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1 mb-2">
                  <Input className="h-7 text-xs flex-1" placeholder={`Nueva ${level1Label.toLowerCase().slice(0, -1)}...`} value={newVerticalName}
                    onChange={e => setNewVerticalName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddVertical(); }} />
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleAddVertical} disabled={!newVerticalName.trim()}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <ScrollArea className="flex-1">
                  <div className="space-y-0.5 pr-2">
                    {/* Linked verticals */}
                    {allVerticals.map(v => {
                      const isLinked = isCategoryVerticalLinked(selectedCategory, v.id);
                      const isSelected = selectedVerticalId === v.id;
                      const count = companiesUsingVertical(v.name);

                      return (
                        <div key={v.id} className="flex items-center gap-1 group">
                          <Checkbox checked={isLinked} onCheckedChange={() => toggleLink(selectedCategory, v.id)} className="h-3.5 w-3.5 shrink-0" />
                          {editingVertical === v.id ? (
                            <div className="flex-1">
                              <InlineEdit value={v.name} onSave={n => { taxonomy.renameVertical(v.id, n); setEditingVertical(null); }} onCancel={() => setEditingVertical(null)} />
                            </div>
                          ) : (
                            <button
                              className={cn(
                                'flex-1 flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-left transition-colors',
                                isSelected ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-accent',
                                !isLinked && 'opacity-40'
                              )}
                              onClick={() => setSelectedVerticalId(v.id)}
                            >
                              <span className="flex-1 truncate">{v.name}</span>
                              {count > 0 && <span className="text-[10px] text-muted-foreground">{count}</span>}
                            </button>
                          )}
                          <div className="hidden group-hover:flex items-center shrink-0">
                            <button className="p-0.5" onClick={() => setEditingVertical(v.id)}>
                              <Pencil className="h-2.5 w-2.5 text-muted-foreground" />
                            </button>
                            <button className="p-0.5" onClick={() => handleDeleteVertical(v.id)}>
                              <Trash2 className="h-2.5 w-2.5 text-destructive" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </>
            )}
          </CardContent>
        </Card>

        {/* Column 3: Sub-verticals */}
        <Card className="flex flex-col">
          <CardHeader className="pb-2 px-3 pt-3">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <GitBranch className="h-3.5 w-3.5" /> {selectedCategory ? level2Label : 'Nivel 2'}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-2 flex-1 flex flex-col min-h-0">
            {!selectedVerticalId ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-xs text-muted-foreground text-center">
                  {selectedCategory ? `Selecciona una ${level1Label.toLowerCase().slice(0, -1)}` : 'Selecciona una categoría primero'}
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1 mb-2">
                  <Input className="h-7 text-xs flex-1" placeholder={`Nueva ${level2Label.toLowerCase().slice(0, -1)}...`} value={newSubVerticalName}
                    onChange={e => setNewSubVerticalName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddSubVertical(); }} />
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleAddSubVertical} disabled={!newSubVerticalName.trim()}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <ScrollArea className="flex-1">
                  <div className="space-y-0.5 pr-2">
                    {subVerticals.map(sv => {
                      const isLinked = isVerticalSubVerticalLinked(selectedVerticalId, sv.id);
                      const count = companiesUsingSubVertical(sv.name);

                      return (
                        <div key={sv.id} className="flex items-center gap-1 group">
                          <Checkbox checked={isLinked} onCheckedChange={() => toggleSubLink(selectedVerticalId, sv.id)} className="h-3.5 w-3.5 shrink-0" />
                          {editingSubVertical === sv.id ? (
                            <div className="flex-1">
                              <InlineEdit value={sv.name} onSave={n => { taxonomy.renameSubVertical(sv.id, n); setEditingSubVertical(null); }} onCancel={() => setEditingSubVertical(null)} />
                            </div>
                          ) : (
                            <div className={cn(
                              'flex-1 flex items-center gap-1 rounded-md px-1.5 py-1 text-xs',
                              !isLinked && 'opacity-40'
                            )}>
                              <span className="flex-1 truncate">{sv.name}</span>
                              {count > 0 && <span className="text-[10px] text-muted-foreground">{count}</span>}
                            </div>
                          )}
                          <div className="hidden group-hover:flex items-center shrink-0">
                            <button className="p-0.5" onClick={() => setEditingSubVertical(sv.id)}>
                              <Pencil className="h-2.5 w-2.5 text-muted-foreground" />
                            </button>
                            <button className="p-0.5" onClick={() => handleDeleteSubVertical(sv.id)}>
                              <Trash2 className="h-2.5 w-2.5 text-destructive" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {subVerticals.length === 0 && (
                      <p className="text-xs text-muted-foreground italic py-2 text-center">No hay {level2Label.toLowerCase()} creadas</p>
                    )}
                  </div>
                </ScrollArea>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Connection arrows between columns */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <span>Categoría</span>
        <ArrowRight className="h-3 w-3" />
        <span>{level1Label}</span>
        <ArrowRight className="h-3 w-3" />
        <span>{level2Label}</span>
      </div>
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
