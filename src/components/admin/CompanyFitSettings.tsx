import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Save, Sparkles, RefreshCw, Clock, CheckCircle2, XCircle, Search, Globe, ChevronDown, ChevronRight, Code2, ExternalLink } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface CompanyFitConfig {
  model: string;
  reasoning_effort: string;
  prompt: string;
  base_prompt: string;
  web_search_enabled: boolean;
  rues_enabled: boolean;
  rues_api_url: string;
}

interface LogEntry {
  id: string;
  company_name: string;
  model: string;
  reasoning_effort: string;
  rues_found: boolean;
  rues_attempts: string[];
  duration_ms: number | null;
  error: string | null;
  response_payload: any;
  request_payload: any;
  rues_data: any;
  created_at: string;
}

const SYSTEM_BASE_PROMPT = `Actúa como analista de CRM para clasificar empresas con base en su sitio web oficial y datos públicos.

DATOS ACTUALES DE LA EMPRESA:
- Nombre comercial: {tradeName}
- Razón social: {legalName}
- NIT: {nit}
- Categoría actual: {category}
- Vertical actual: {vertical}
- Sub-vertical actual: {subVertical}
- Descripción actual: {description}
- Ciudad: {city}
- Sitio web: {website}

{ruesText}

CONTACTOS (determina género por nombre):
{contactsText}

TAXONOMÍA DEL CRM:
{taxonomyText}

TU TAREA:

1. Busca la empresa en internet usando su sitio web ({website}) y nombre comercial ({tradeName}). Analiza el sitio web a fondo. Lee su contenido, servicios, productos, equipo, y cualquier información relevante.

2. CLASIFICACIÓN - Determina si la empresa es. PIENSA PASO A PASO y justifica tu razonamiento:
   a) Startup - Base tecnológica clara + potencial de escalabilidad/replicabilidad. Señales: SaaS, plataforma digital, marketplace tecnológico, app con lógica repetible, software con suscripción, automatización/IA como núcleo. NO importa si no ha levantado capital.
   b) EBT (Empresa de Base Tecnológica) - Base tecnológica real PERO sin producto startup claramente escalable. Modelo depende de proyectos a medida, integración, consultoría técnica, manufactura especializada, outsourcing, dispositivos hardware, IoT sin plataforma SaaS clara. NUNCA uses "SaaS" como vertical para esta categoría. Ejemplos: empresa que desarrolla dispositivos médicos, empresa de consultoría en IA/datos, empresa de hardware IoT, empresa de biotecnología sin plataforma digital escalable.
   c) Disruptiva - No es startup ni EBT, pero tiene propuesta moderna, digital, innovadora. Servicios, marcas, agencias, e-commerce sin tech propia como core. SOLO clasifica como Disruptiva si NO hay evidencia clara de base tecnológica propia.
   
   ORDEN OBLIGATORIO de análisis: ¿Es Startup? → ¿Es EBT? → ¿Es Disruptiva?
   
   REGLA CLAVE: Si la empresa tiene tecnología propia (hardware, software, dispositivos, algoritmos, patentes) pero NO es un producto digital escalable tipo SaaS/marketplace/plataforma, entonces ES EBT, NO Disruptiva.

   IMPORTANTE: Solo puedes usar las categorías que existen en la taxonomía: {categoriesList}. Escoge la más cercana.

3. VERTICAL Y SUB-VERTICAL - Usa las existentes en la taxonomía si alguna aplica. Si ninguna aplica, sugiere una nueva. Si la empresa es EBT, NUNCA uses "SaaS" como vertical.

4. DESCRIPCIÓN - Escribe un párrafo corto, claro y concreto describiendo la empresa. Máximo 3 oraciones.

5. LOGO - Busca la URL del logo de la empresa en su sitio web. Debe ser una URL directa a una imagen (png, jpg, svg, webp).

6. CONTACTOS - Para cada contacto, determina el género (male/female) basándote en el nombre.

7. VALIDACIÓN LEGAL - Con los datos de RUES (si hay), valida/completa:
   - Razón social correcta
   - NIT correcto
   - Nombre comercial (puede diferir de razón social, es el nombre de la marca)

8. ESTADO - Determina si la empresa está activa o inactiva según la información encontrada.

REGLAS:
- Sé concreto y ejecutivo. No inventes.
- Si la evidencia es débil, indica confianza media o baja.
- La vertical debe ser lo más genérica posible.
- La sub-vertical más específica.
- PIENSA CUIDADOSAMENTE antes de clasificar. Analiza la evidencia del sitio web.

Responde ÚNICAMENTE llamando la función analyze_company con los resultados.`;

const DEFAULT_CONFIG: CompanyFitConfig = {
  model: 'gpt-5.4',
  reasoning_effort: 'high',
  prompt: '',
  base_prompt: SYSTEM_BASE_PROMPT,
  web_search_enabled: true,
  rues_enabled: true,
  rues_api_url: 'https://www.datos.gov.co/resource/c82u-588k.json',
};

const EDGE_FUNCTIONS = [
  {
    name: 'company-fit',
    description: 'Analiza empresas con IA usando OpenAI + RUES para clasificación y enriquecimiento de datos.',
    path: 'supabase/functions/company-fit/index.ts',
  },
];

export default function CompanyFitSettings() {
  const [config, setConfig] = useState<CompanyFitConfig>(DEFAULT_CONFIG);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [basePromptOpen, setBasePromptOpen] = useState(false);
  const [edgeFunctionsOpen, setEdgeFunctionsOpen] = useState<Record<string, boolean>>({});

  const fetchSettings = useCallback(async () => {
    const { data } = await supabase
      .from('feature_settings')
      .select('*')
      .eq('feature_key', 'company_fit')
      .single();
    if (data) {
      setSettingsId(data.id);
      const dbConfig = data.config as any;
      setConfig({
        ...DEFAULT_CONFIG,
        ...dbConfig,
        base_prompt: dbConfig.base_prompt || SYSTEM_BASE_PROMPT,
        web_search_enabled: dbConfig.web_search_enabled !== false,
      });
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true);
    const { data } = await supabase
      .from('company_fit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    setLogs((data || []) as any);
    setLoadingLogs(false);
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchLogs();
  }, [fetchSettings, fetchLogs]);

  const handleSave = async () => {
    if (!settingsId) return;
    setSaving(true);
    const { error } = await supabase
      .from('feature_settings')
      .update({ config: config as any, updated_at: new Date().toISOString() } as any)
      .eq('id', settingsId);
    setSaving(false);
    if (error) {
      showError('Error', 'No tienes permisos de admin para guardar configuración');
    } else {
      showSuccess('Guardado', 'Configuración de Company Fit actualizada');
    }
  };

  return (
    <div className="space-y-6">
      {/* Settings */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Configuración de Company Fit</h2>
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
              <p className="text-xs text-muted-foreground">Permite al modelo buscar información en internet sobre la empresa</p>
            </div>
          </div>
          <Switch checked={config.web_search_enabled} onCheckedChange={v => setConfig(c => ({ ...c, web_search_enabled: v }))} />
        </div>

        <Separator />

        {/* Base Prompt */}
        <Collapsible open={basePromptOpen} onOpenChange={setBasePromptOpen}>
          <CollapsibleTrigger className="flex items-center gap-2 w-full text-left">
            {basePromptOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span className="text-sm font-semibold">Prompt base del sistema</span>
            <Badge variant="outline" className="text-[10px] ml-auto">editable</Badge>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <Textarea
              className="min-h-[300px] text-xs font-mono leading-relaxed"
              value={config.base_prompt}
              onChange={e => setConfig(c => ({ ...c, base_prompt: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Variables disponibles: {'{tradeName}'}, {'{legalName}'}, {'{nit}'}, {'{category}'}, {'{vertical}'}, {'{subVertical}'}, {'{description}'}, {'{city}'}, {'{website}'}, {'{ruesText}'}, {'{contactsText}'}, {'{taxonomyText}'}, {'{categoriesList}'}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 text-xs"
              onClick={() => setConfig(c => ({ ...c, base_prompt: SYSTEM_BASE_PROMPT }))}
            >
              Restaurar prompt por defecto
            </Button>
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        {/* Custom prompt */}
        <div>
          <Label>Prompt personalizado (se agrega al prompt base)</Label>
          <Textarea
            className="mt-1 min-h-[80px] text-xs font-mono"
            value={config.prompt}
            onChange={e => setConfig(c => ({ ...c, prompt: e.target.value }))}
            placeholder="Instrucciones adicionales para el análisis de empresas..."
          />
          <p className="text-xs text-muted-foreground mt-1">Deja vacío para usar solo el prompt base.</p>
        </div>

        <Separator />

        {/* RUES */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Configuración RUES</h3>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Consulta RUES habilitada</p>
              <p className="text-xs text-muted-foreground">Consultar datos.gov.co para validar identidad legal</p>
            </div>
            <Switch checked={config.rues_enabled} onCheckedChange={v => setConfig(c => ({ ...c, rues_enabled: v }))} />
          </div>

          <div>
            <Label>URL API RUES</Label>
            <Input
              className="mt-1 text-xs font-mono"
              value={config.rues_api_url}
              onChange={e => setConfig(c => ({ ...c, rues_api_url: e.target.value }))}
            />
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" /> {saving ? 'Guardando...' : 'Guardar configuración'}
        </Button>
      </div>

      {/* Logs */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Logs de Company Fit</h2>
            <Badge variant="outline" className="text-[10px]">{logs.length}</Badge>
          </div>
          <Button variant="ghost" size="sm" onClick={fetchLogs} disabled={loadingLogs} className="gap-1">
            <RefreshCw className={`h-3.5 w-3.5 ${loadingLogs ? 'animate-spin' : ''}`} /> Actualizar
          </Button>
        </div>

        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No hay logs aún</p>
        ) : (
          <ScrollArea className="max-h-[500px]">
            <div className="space-y-2">
              {logs.map(log => (
                <div
                  key={log.id}
                  className="rounded-lg border border-border p-3 text-sm cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {log.error ? (
                        <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
                      )}
                      <span className="font-medium truncate">{log.company_name || 'Sin nombre'}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant="outline" className="text-[10px]">{log.model}</Badge>
                      {log.rues_found ? (
                        <Badge variant="secondary" className="text-[10px] text-success">RUES ✓</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] text-muted-foreground">RUES ✗</Badge>
                      )}
                      {log.duration_ms && (
                        <span className="text-xs text-muted-foreground">{(log.duration_ms / 1000).toFixed(1)}s</span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: es })}
                      </span>
                    </div>
                  </div>

                  {expandedLog === log.id && (
                    <div className="mt-3 space-y-3">
                      {log.error && (
                        <div className="rounded bg-destructive/10 p-2 text-xs text-destructive">{log.error}</div>
                      )}

                      <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">Reasoning</p>
                          <p className="text-xs">{log.reasoning_effort}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">RUES intentos</p>
                          <p className="text-xs">{(log.rues_attempts || []).join(', ') || '—'}</p>
                        </div>
                      </div>

                      {log.response_payload && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">Resultado IA</p>
                          <pre className="text-[10px] font-mono bg-muted/50 p-2 rounded max-h-60 overflow-auto whitespace-pre-wrap">
                            {JSON.stringify(log.response_payload, null, 2)}
                          </pre>
                        </div>
                      )}

                      {log.rues_data && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">Datos RUES</p>
                          <pre className="text-[10px] font-mono bg-muted/50 p-2 rounded max-h-40 overflow-auto whitespace-pre-wrap">
                            {JSON.stringify(log.rues_data, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
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
            <div key={fn.name} className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold font-mono">{fn.name}</p>
                    <Badge variant="secondary" className="text-[10px]">deployed</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{fn.description}</p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-xs"
                    asChild
                  >
                    <a
                      href={`https://supabase.com/dashboard/project/xcrlxgfwzxuvqztmvrvv/functions/company-fit/logs`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-3 w-3" /> Logs
                    </a>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-xs"
                    asChild
                  >
                    <a
                      href={`https://supabase.com/dashboard/project/xcrlxgfwzxuvqztmvrvv/functions`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-3 w-3" /> Dashboard
                    </a>
                  </Button>
                </div>
              </div>
              <p className="text-[10px] font-mono text-muted-foreground">{fn.path}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
