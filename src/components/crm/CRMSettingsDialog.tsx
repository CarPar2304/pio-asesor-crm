import React, { useState, useMemo } from 'react';
import { useTaxonomy } from '@/contexts/TaxonomyContext';
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Plus, Trash2, Pencil, Check, X, ChevronRight, ChevronDown, AlertTriangle, GitBranch } from 'lucide-react';
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
  const { verticals, subVerticals, categoryVerticalLinks, verticalSubVerticalLinks, allCategories } = taxonomy;

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newVerticalName, setNewVerticalName] = useState('');
  const [newSubVerticalName, setNewSubVerticalName] = useState('');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingVertical, setEditingVertical] = useState<string | null>(null);
  const [editingSubVertical, setEditingSubVertical] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedVerticals, setExpandedVerticals] = useState<Set<string>>(new Set());
  const [addVerticalToCategory, setAddVerticalToCategory] = useState<string | null>(null);
  const [addSubVerticalToVertical, setAddSubVerticalToVertical] = useState<string | null>(null);

  const toggleExpand = (set: Set<string>, key: string, setter: React.Dispatch<React.SetStateAction<Set<string>>>) => {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
    setter(next);
  };

  const companiesUsingCategory = (cat: string) => companies.filter(c => c.category === cat).length;
  const companiesUsingVertical = (name: string) => companies.filter(c => c.vertical === name).length;
  const companiesUsingSubVertical = (name: string) => companies.filter(c => c.economicActivity === name).length;

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name || allCategories.includes(name)) return;
    // Link all existing verticals to new category
    for (const v of verticals) {
      await taxonomy.linkCategoryVertical(name, v.id);
    }
    setNewCategoryName('');
    showSuccess('Categoría creada', name);
  };

  const handleDeleteCategory = async (cat: string) => {
    const count = companiesUsingCategory(cat);
    if (count > 0) {
      showError('No se puede eliminar', `Hay ${count} empresa(s) usando esta categoría. Las empresas no se verán afectadas pero los vínculos se eliminarán.`);
    }
    await taxonomy.deleteCategory(cat);
    showSuccess('Categoría eliminada', cat);
  };

  const handleRenameCategory = async (oldName: string, newName: string) => {
    await taxonomy.renameCategory(oldName, newName);
    setEditingCategory(null);
    showSuccess('Categoría renombrada', `${oldName} → ${newName}`);
  };

  const handleAddVertical = async () => {
    const name = newVerticalName.trim();
    if (!name) return;
    const existing = verticals.find(v => v.name.toLowerCase() === name.toLowerCase());
    if (existing) { showError('Ya existe', `La vertical "${name}" ya existe`); return; }
    const v = await taxonomy.addVertical(name);
    if (v) {
      // Link to all categories by default
      for (const cat of allCategories) {
        await taxonomy.linkCategoryVertical(cat, v.id);
      }
      setNewVerticalName('');
      showSuccess('Vertical creada', name);
    }
  };

  const handleAddSubVertical = async () => {
    const name = newSubVerticalName.trim();
    if (!name) return;
    const existing = subVerticals.find(sv => sv.name.toLowerCase() === name.toLowerCase());
    if (existing) { showError('Ya existe', `La sub-vertical "${name}" ya existe`); return; }
    await taxonomy.addSubVertical(name);
    setNewSubVerticalName('');
    showSuccess('Sub-vertical creada', name);
  };

  const handleDeleteVertical = async (id: string) => {
    const v = verticals.find(vv => vv.id === id);
    if (!v) return;
    await taxonomy.deleteVertical(id);
    showSuccess('Vertical eliminada', v.name);
  };

  const handleDeleteSubVertical = async (id: string) => {
    const sv = subVerticals.find(s => s.id === id);
    if (!sv) return;
    await taxonomy.deleteSubVertical(id);
    showSuccess('Sub-vertical eliminada', sv.name);
  };

  const isCategoryVerticalLinked = (cat: string, vId: string) =>
    categoryVerticalLinks.some(l => l.category === cat && l.vertical_id === vId);

  const isVerticalSubVerticalLinked = (vId: string, svId: string) =>
    verticalSubVerticalLinks.some(l => l.vertical_id === vId && l.sub_vertical_id === svId);

  const toggleCategoryVertical = async (cat: string, vId: string) => {
    if (isCategoryVerticalLinked(cat, vId)) {
      await taxonomy.unlinkCategoryVertical(cat, vId);
    } else {
      await taxonomy.linkCategoryVertical(cat, vId);
    }
  };

  const toggleVerticalSubVertical = async (vId: string, svId: string) => {
    if (isVerticalSubVerticalLinked(vId, svId)) {
      await taxonomy.unlinkVerticalSubVertical(vId, svId);
    } else {
      await taxonomy.linkVerticalSubVertical(vId, svId);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border p-3 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5" /> Árbol de taxonomía
        </p>
        <p className="text-xs text-muted-foreground">
          Gestiona la jerarquía Categoría → Vertical → Sub-vertical. Las empresas existentes no se modifican al cambiar la estructura.
        </p>
      </div>

      {/* Categories */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">Categorías</h4>
          <div className="flex items-center gap-1">
            <Input className="h-7 w-40 text-xs" placeholder="Nueva categoría..." value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(); }} />
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleAddCategory} disabled={!newCategoryName.trim()}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="space-y-1">
          {allCategories.map(cat => {
            const isExpanded = expandedCategories.has(cat);
            const linkedVerticals = verticals.filter(v => isCategoryVerticalLinked(cat, v.id));
            const count = companiesUsingCategory(cat);

            return (
              <div key={cat} className="rounded-md border border-border/50">
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <button className="shrink-0" onClick={() => toggleExpand(expandedCategories, cat, setExpandedCategories)}>
                    {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                  {editingCategory === cat ? (
                    <InlineEdit value={cat} onSave={n => handleRenameCategory(cat, n)} onCancel={() => setEditingCategory(null)} />
                  ) : (
                    <>
                      <span className="text-sm font-medium flex-1">{cat}</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{linkedVerticals.length} vert.</Badge>
                      {count > 0 && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{count} emp.</Badge>}
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingCategory(cat)}>
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDeleteCategory(cat)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
                {isExpanded && (
                  <div className="border-t border-border/30 px-4 py-2 space-y-1 bg-muted/30">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Verticales vinculadas</p>
                    {verticals.map(v => (
                      <label key={v.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-accent/50 rounded px-1 py-0.5">
                        <Checkbox checked={isCategoryVerticalLinked(cat, v.id)} onCheckedChange={() => toggleCategoryVertical(cat, v.id)} className="h-3.5 w-3.5" />
                        {v.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* Verticals */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">Verticales</h4>
          <div className="flex items-center gap-1">
            <Input className="h-7 w-40 text-xs" placeholder="Nueva vertical..." value={newVerticalName}
              onChange={e => setNewVerticalName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddVertical(); }} />
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleAddVertical} disabled={!newVerticalName.trim()}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="space-y-1">
          {verticals.map(v => {
            const isExpanded = expandedVerticals.has(v.id);
            const linkedSubs = subVerticals.filter(sv => isVerticalSubVerticalLinked(v.id, sv.id));
            const count = companiesUsingVertical(v.name);
            const linkedCats = allCategories.filter(cat => isCategoryVerticalLinked(cat, v.id));

            return (
              <div key={v.id} className="rounded-md border border-border/50">
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <button className="shrink-0" onClick={() => toggleExpand(expandedVerticals, v.id, setExpandedVerticals)}>
                    {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                  {editingVertical === v.id ? (
                    <InlineEdit value={v.name} onSave={n => { taxonomy.renameVertical(v.id, n); setEditingVertical(null); }} onCancel={() => setEditingVertical(null)} />
                  ) : (
                    <>
                      <span className="text-sm font-medium flex-1">{v.name}</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{linkedSubs.length} sub.</Badge>
                      {linkedCats.length > 0 && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{linkedCats.join(', ')}</Badge>
                      )}
                      {count > 0 && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{count} emp.</Badge>}
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingVertical(v.id)}>
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDeleteVertical(v.id)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
                {isExpanded && (
                  <div className="border-t border-border/30 px-4 py-2 space-y-1 bg-muted/30">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Sub-verticales vinculadas</p>
                    {subVerticals.map(sv => (
                      <label key={sv.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-accent/50 rounded px-1 py-0.5">
                        <Checkbox checked={isVerticalSubVerticalLinked(v.id, sv.id)} onCheckedChange={() => toggleVerticalSubVertical(v.id, sv.id)} className="h-3.5 w-3.5" />
                        {sv.name}
                      </label>
                    ))}
                    {subVerticals.length === 0 && <p className="text-xs text-muted-foreground italic">No hay sub-verticales creadas</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* Sub-verticals */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">Sub-verticales</h4>
          <div className="flex items-center gap-1">
            <Input className="h-7 w-40 text-xs" placeholder="Nueva sub-vertical..." value={newSubVerticalName}
              onChange={e => setNewSubVerticalName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddSubVertical(); }} />
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleAddSubVertical} disabled={!newSubVerticalName.trim()}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="space-y-1">
          {subVerticals.map(sv => {
            const count = companiesUsingSubVertical(sv.name);
            const linkedVerts = verticals.filter(v => isVerticalSubVerticalLinked(v.id, sv.id));

            return (
              <div key={sv.id} className="flex items-center gap-1 rounded-md border border-border/50 px-2 py-1.5">
                {editingSubVertical === sv.id ? (
                  <InlineEdit value={sv.name} onSave={n => { taxonomy.renameSubVertical(sv.id, n); setEditingSubVertical(null); }} onCancel={() => setEditingSubVertical(null)} />
                ) : (
                  <>
                    <span className="text-sm flex-1">{sv.name}</span>
                    {linkedVerts.length > 0 && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{linkedVerts.map(v => v.name).join(', ')}</Badge>
                    )}
                    {count > 0 && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{count} emp.</Badge>}
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingSubVertical(sv.id)}>
                      <Pencil className="h-3 w-3 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDeleteSubVertical(sv.id)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </>
                )}
              </div>
            );
          })}
        </div>
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
        <p className="text-xs text-muted-foreground">Gestiona las secciones y campos del formulario de empresa. Los cambios se reflejan en todas las empresas.</p>
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

      {/* Unsectioned fields */}
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
      <DialogContent className="max-w-2xl h-[min(90vh,48rem)] flex flex-col p-0">
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
