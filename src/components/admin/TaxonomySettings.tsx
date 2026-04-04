import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTaxonomy } from '@/contexts/TaxonomyContext';
import { useCRM } from '@/contexts/CRMContext';
import { showSuccess, showError } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Save, Sparkles, Globe, ChevronDown, ChevronRight, Code2, ExternalLink, Loader2, BookOpen, Wand2 } from 'lucide-react';

interface TaxonomyOrganizeConfig {
  model: string;
  reasoning_effort: string;
  web_search_enabled: boolean;
  prompt: string;
}

const DEFAULT_CONFIG: TaxonomyOrganizeConfig = {
  model: 'gpt-4.1-mini',
  reasoning_effort: 'high',
  web_search_enabled: true,
  prompt: '',
};

const EDGE_FUNCTIONS = [
  {
    name: 'taxonomy-organize',
    description: 'Analiza el árbol taxonómico y sugiere reorganizaciones usando IA.',
  },
  {
    name: 'taxonomy-definitions',
    description: 'Genera definiciones automáticas para verticales y sub-verticales.',
  },
];

export default function TaxonomySettings() {
  const taxonomy = useTaxonomy();
  const { companies } = useCRM();
  const [config, setConfig] = useState<TaxonomyOrganizeConfig>(DEFAULT_CONFIG);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);

  // Definitions generator state
  const [definitions, setDefinitions] = useState('');
  const [definitionsId, setDefinitionsId] = useState<string | null>(null);
  const [generatingDefs, setGeneratingDefs] = useState(false);
  const [previewDefs, setPreviewDefs] = useState<string | null>(null);
  const [savingDefs, setSavingDefs] = useState(false);

  const fetchSettings = useCallback(async () => {
    const { data } = await supabase
      .from('feature_settings')
      .select('*')
      .eq('feature_key', 'taxonomy_organize')
      .single();
    if (data) {
      setSettingsId(data.id);
      const dbConfig = data.config as any;
      setConfig({
        ...DEFAULT_CONFIG,
        ...dbConfig,
        web_search_enabled: dbConfig?.web_search_enabled !== false,
      });
    }
  }, []);

  const fetchDefinitions = useCallback(async () => {
    const { data } = await supabase
      .from('feature_settings')
      .select('*')
      .eq('feature_key', 'taxonomy_definitions')
      .single();
    if (data) {
      setDefinitionsId(data.id);
      const cfg = data.config as any;
      setDefinitions(cfg?.definitions || '');
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchDefinitions();
  }, [fetchSettings, fetchDefinitions]);

  const handleSave = async () => {
    setSaving(true);
    if (settingsId) {
      const { error } = await supabase
        .from('feature_settings')
        .update({ config: config as any, updated_at: new Date().toISOString() } as any)
        .eq('id', settingsId);
      if (error) { showError('Error', 'No tienes permisos de admin'); setSaving(false); return; }
    } else {
      const { error } = await supabase
        .from('feature_settings')
        .insert({ feature_key: 'taxonomy_organize', config: config as any } as any);
      if (error) { showError('Error', 'No tienes permisos de admin'); setSaving(false); return; }
    }
    setSaving(false);
    showSuccess('Guardado', 'Configuración de Taxonomía actualizada');
    fetchSettings();
  };

  const handleSaveDefinitions = async (defsToSave: string) => {
    setSavingDefs(true);
    if (definitionsId) {
      await supabase
        .from('feature_settings')
        .update({ config: { definitions: defsToSave } as any, updated_at: new Date().toISOString() } as any)
        .eq('id', definitionsId);
    } else {
      await supabase
        .from('feature_settings')
        .insert({ feature_key: 'taxonomy_definitions', config: { definitions: defsToSave } as any } as any);
    }
    setDefinitions(defsToSave);
    setPreviewDefs(null);
    setSavingDefs(false);
    fetchDefinitions();
    showSuccess('Definiciones guardadas');
  };

  const handleGenerateDefinitions = async () => {
    setGeneratingDefs(true);
    try {
      const { data, error } = await supabase.functions.invoke('taxonomy-definitions', {
        body: {
          categories: taxonomy.allCategories,
          verticals: taxonomy.verticals.map(v => {
            const catLinks = taxonomy.categoryVerticalLinks.filter(l => l.vertical_id === v.id);
            return { id: v.id, name: v.name, categories: catLinks.map(l => l.category) };
          }),
          subVerticals: taxonomy.subVerticals.map(sv => {
            const vertLinks = taxonomy.verticalSubVerticalLinks.filter(l => l.sub_vertical_id === sv.id);
            const vertNames = vertLinks.map(l => taxonomy.verticals.find(v => v.id === l.vertical_id)?.name || '').filter(Boolean);
            return { id: sv.id, name: sv.name, verticals: vertNames };
          }),
          companyCounts: {
            total: companies.length,
            byCategory: taxonomy.allCategories.map(c => ({
              name: c,
              count: companies.filter(co => co.category === c).length,
            })),
          },
          currentDefinitions: definitions,
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setPreviewDefs(data.definitions);
    } catch (err: any) {
      showError('Error', err.message || 'No se pudieron generar definiciones');
    } finally {
      setGeneratingDefs(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Model config */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Configuración de Taxonomía IA</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Modelo OpenAI</Label>
            <Select value={config.model} onValueChange={v => setConfig(c => ({ ...c, model: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gpt-4.1-nano">gpt-4.1-nano</SelectItem>
                <SelectItem value="gpt-4.1-mini">gpt-4.1-mini</SelectItem>
                <SelectItem value="gpt-4.1">gpt-4.1</SelectItem>
                <SelectItem value="gpt-5">gpt-5</SelectItem>
                <SelectItem value="gpt-5-mini">gpt-5-mini</SelectItem>
                <SelectItem value="gpt-5.4">gpt-5.4</SelectItem>
                <SelectItem value="o3">o3</SelectItem>
                <SelectItem value="o4-mini">o4-mini</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Esfuerzo de razonamiento</Label>
            <Select value={config.reasoning_effort} onValueChange={v => setConfig(c => ({ ...c, reasoning_effort: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Bajo (low)</SelectItem>
                <SelectItem value="medium">Medio (medium)</SelectItem>
                <SelectItem value="high">Alto (high)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Web Search */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Búsqueda web (web_search)</p>
              <p className="text-xs text-muted-foreground">Permite al modelo buscar contexto en internet</p>
            </div>
          </div>
          <Switch checked={config.web_search_enabled} onCheckedChange={v => setConfig(c => ({ ...c, web_search_enabled: v }))} />
        </div>

        <Separator />

        {/* Custom prompt */}
        <Collapsible open={promptOpen} onOpenChange={setPromptOpen}>
          <CollapsibleTrigger className="flex items-center gap-2 w-full text-left">
            {promptOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span className="text-sm font-semibold">Prompt personalizado</span>
            <Badge variant="outline" className="text-[10px] ml-auto">opcional</Badge>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <Textarea
              className="min-h-[120px] text-xs font-mono leading-relaxed"
              value={config.prompt}
              onChange={e => setConfig(c => ({ ...c, prompt: e.target.value }))}
              placeholder="Instrucciones adicionales para la organización de taxonomía..."
            />
            <p className="text-xs text-muted-foreground mt-1">
              Se agrega al prompt base del sistema. Variables: {'{taxonomyTree}'}, {'{definitions}'}, {'{orphanVerticals}'}, {'{orphanSubVerticals}'}, {'{companyCounts}'}
            </p>
          </CollapsibleContent>
        </Collapsible>

        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" /> {saving ? 'Guardando...' : 'Guardar configuración'}
        </Button>
      </div>

      {/* Definitions generator */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Definiciones de clasificación</h2>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={handleGenerateDefinitions}
            disabled={generatingDefs}
          >
            {generatingDefs ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="h-3.5 w-3.5" />
            )}
            {generatingDefs ? 'Generando...' : 'Generar con IA'}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Define qué significa cada categoría, vertical y sub-vertical. La IA usa estas definiciones como contexto al organizar la taxonomía.
        </p>

        {previewDefs !== null ? (
          <div className="space-y-3">
            <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Wand2 className="h-3.5 w-3.5 text-primary" />
                <p className="text-xs font-semibold text-primary">Preview generado por IA</p>
              </div>
              <Textarea
                className="min-h-[200px] text-xs font-mono leading-relaxed"
                value={previewDefs}
                onChange={e => setPreviewDefs(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleSaveDefinitions(previewDefs)}
                  disabled={savingDefs}
                  className="gap-1.5 text-xs"
                >
                  <Save className="h-3 w-3" />
                  {savingDefs ? 'Guardando...' : 'Aprobar y guardar'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPreviewDefs(null)}
                  className="text-xs"
                >
                  Descartar
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Textarea
              className="min-h-[150px] text-xs font-mono leading-relaxed"
              value={definitions}
              onChange={e => setDefinitions(e.target.value)}
              placeholder={`Ejemplo:\n\nCATEGORÍAS:\n- Startup: Empresa con base tecnológica clara y modelo escalable.\n- EBT: Empresa de Base Tecnológica, tech propia pero no escalable.\n\nVERTICALES:\n- HealthTech: Tecnología aplicada a salud.\n- FinTech: Tecnología aplicada a finanzas.`}
            />
            <Button
              size="sm"
              onClick={() => handleSaveDefinitions(definitions)}
              disabled={savingDefs}
              className="gap-1.5 text-xs"
            >
              <Save className="h-3 w-3" />
              {savingDefs ? 'Guardando...' : 'Guardar definiciones'}
            </Button>
          </div>
        )}
      </div>

      {/* Edge Functions */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Code2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Edge Functions</h2>
        </div>

        <div className="space-y-3">
          {EDGE_FUNCTIONS.map(fn => (
            <div key={fn.name} className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold font-mono">{fn.name}</p>
                    <Badge variant="secondary" className="text-[10px]">deployed</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{fn.description}</p>
                </div>
                <Button variant="ghost" size="sm" className="gap-1 text-xs" asChild>
                  <a
                    href={`https://supabase.com/dashboard/project/xcrlxgfwzxuvqztmvrvv/functions/${fn.name}/logs`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-3 w-3" /> Logs
                  </a>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
