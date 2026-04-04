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
import { Save, Sparkles, Globe, ChevronDown, ChevronRight, Code2, ExternalLink, Loader2, BookOpen, Wand2, RefreshCw } from 'lucide-react';

interface TaxonomyOrganizeConfig {
  model: string;
  reasoning_effort: string;
  web_search_enabled: boolean;
  prompt: string;
}

interface TaxonomyRunLog {
  id: string;
  created_at: string;
  model: string;
  reasoning_effort: string;
  suggestions_count: number;
  orphan_verticals: number;
  orphan_sub_verticals: number;
  diagnostics?: {
    categories?: number;
    managedVerticals?: number;
    managedSubVerticals?: number;
    sharedVerticals?: number;
    sharedSubVerticals?: number;
    definitionsIncluded?: boolean;
  };
  summary: string;
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

const PROMPT_VARIABLES = [
  { key: 'taxonomyTree', label: 'Árbol legible completo' },
  { key: 'definitions', label: 'Definiciones de categorías y términos' },
  { key: 'categories', label: 'Categorías estructuradas' },
  { key: 'managedVerticals', label: 'Verticales gestionadas con relaciones' },
  { key: 'managedSubVerticals', label: 'Sub-verticales gestionadas con relaciones' },
  { key: 'orphanVerticals', label: 'Verticales sin gestionar' },
  { key: 'orphanSubVerticals', label: 'Sub-verticales sin gestionar' },
  { key: 'companyCounts', label: 'Conteos de empresas' },
  { key: 'diagnostics', label: 'Diagnóstico del payload enviado' },
];

export default function TaxonomySettings() {
  const taxonomy = useTaxonomy();
  const { companies } = useCRM();
  const [config, setConfig] = useState<TaxonomyOrganizeConfig>(DEFAULT_CONFIG);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [runHistory, setRunHistory] = useState<TaxonomyRunLog[]>([]);
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
      setRunHistory(Array.isArray(dbConfig?.run_history) ? dbConfig.run_history : []);
    } else {
      setRunHistory([]);
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
        .update({ config: { ...config, run_history: runHistory } as any, updated_at: new Date().toISOString() } as any)
        .eq('id', settingsId);
      if (error) { showError('Error', 'No tienes permisos de admin'); setSaving(false); return; }
    } else {
      const { error } = await supabase
        .from('feature_settings')
        .insert({ feature_key: 'taxonomy_organize', config: { ...config, run_history: runHistory } as any } as any);
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
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Variables disponibles <span className="text-[10px]">(clic para insertar)</span></p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {PROMPT_VARIABLES.map(variable => {
                  const token = `{${variable.key}}`;
                  const isUsed = config.prompt.includes(token);
                  return (
                    <button
                      key={variable.key}
                      type="button"
                      onClick={() => {
                        if (!config.prompt.includes(token)) {
                          setConfig(current => ({
                            ...current,
                            prompt: current.prompt ? `${current.prompt}\n${token}` : token,
                          }));
                        }
                      }}
                      className={isUsed ? "inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-mono text-primary" : "inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-mono text-muted-foreground hover:border-primary/30 hover:text-primary"}
                    >
                      <span>{token}</span>
                      <span className="text-[9px] font-sans opacity-70">{variable.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <Textarea
              className="min-h-[120px] text-xs font-mono leading-relaxed"
              value={config.prompt}
              onChange={e => setConfig(c => ({ ...c, prompt: e.target.value }))}
              placeholder="Instrucciones adicionales para la organización integral de taxonomía..."
            />
            <p className="text-xs text-muted-foreground mt-1">
              El agente recibe definiciones, árbol validado, relaciones estructuradas, huérfanos y conteos para analizar huérfanos, fusiones y compartidos de forma integral.
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

      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Logs del organizador</h2>
            <p className="text-xs text-muted-foreground">Últimas ejecuciones guardadas desde la app con resumen y validación del payload.</p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={fetchSettings}>
            <RefreshCw className="h-3.5 w-3.5" /> Refrescar
          </Button>
        </div>

        {runHistory.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
            Aún no hay logs guardados del organizador.
          </div>
        ) : (
          <div className="space-y-3">
            {runHistory.map(log => (
              <div key={log.id} className="rounded-lg border border-border p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">{log.model}</Badge>
                  <Badge variant="outline" className="text-[10px]">reasoning {log.reasoning_effort}</Badge>
                  <Badge variant="outline" className="text-[10px]">{log.suggestions_count} sugerencias</Badge>
                  <Badge variant="outline" className="text-[10px]">{log.orphan_verticals} huérfanas</Badge>
                  <Badge variant="outline" className="text-[10px]">{log.orphan_sub_verticals} sub-huérfanas</Badge>
                  <span className="text-[10px] text-muted-foreground">{new Date(log.created_at).toLocaleString()}</span>
                </div>
                {log.diagnostics && (
                  <div className="flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                    <span>{log.diagnostics.categories || 0} categorías</span>
                    <span>·</span>
                    <span>{log.diagnostics.managedVerticals || 0} verticales</span>
                    <span>·</span>
                    <span>{log.diagnostics.managedSubVerticals || 0} sub-verticales</span>
                    <span>·</span>
                    <span>{log.diagnostics.sharedVerticals || 0} compartidas</span>
                    <span>·</span>
                    <span>defs {log.diagnostics.definitionsIncluded ? 'sí' : 'no'}</span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground leading-relaxed">{log.summary}</p>
              </div>
            ))}
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
