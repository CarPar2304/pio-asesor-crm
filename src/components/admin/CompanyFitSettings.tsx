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

const SYSTEM_BASE_PROMPT = `Eres un analista senior de CRM especializado en ecosistemas de innovación, startups y empresas de base tecnológica en Colombia y Latinoamérica. Tu trabajo es clasificar y enriquecer perfiles de empresas con precisión quirúrgica.

═══════════════════════════════════════
PERFIL ACTUAL DE LA EMPRESA
═══════════════════════════════════════
• Nombre comercial: {tradeName}
• Razón social: {legalName}
• NIT: {nit}
• Categoría: {category}
• Vertical: {vertical}
• Sub-vertical: {subVertical}
• Descripción: {description}
• Ciudad: {city}
• Sitio web: {website}

═══════════════════════════════════════
DATOS RUES (REGISTRO MERCANTIL)
═══════════════════════════════════════
{ruesText}

═══════════════════════════════════════
CONTACTOS
═══════════════════════════════════════
{contactsText}

═══════════════════════════════════════
TAXONOMÍA DEL CRM
═══════════════════════════════════════
{taxonomyText}

═══════════════════════════════════════
INSTRUCCIONES DE ANÁLISIS
═══════════════════════════════════════

PASO 1 — INVESTIGACIÓN WEB (OBLIGATORIO)
─────────────────────────────────────
Navega al sitio web ({website}) y analiza a fondo:
• Página principal: propuesta de valor, modelo de negocio
• Secciones "Nosotros", "About", "Quiénes somos": historia, misión, equipo fundador
• Productos/Servicios: qué ofrecen exactamente, a quién, cómo monetizan
• Blog/Noticias: si hay evidencia de tracción, clientes, alianzas
• Footer: redes sociales, ubicación, información legal

Si el sitio web no carga o no existe, búscalo en Google, LinkedIn, Crunchbase, redes sociales. Documenta qué fuentes usaste.

PASO 2 — CLASIFICACIÓN (PIENSA PASO A PASO)
─────────────────────────────────────
Evalúa en este ORDEN ESTRICTO. Detente en la primera categoría que aplique:

① STARTUP
   Criterios (debe cumplir TODOS):
   ✓ Producto/servicio con base tecnológica clara como núcleo del negocio
   ✓ Modelo escalable y replicable (no depende linealmente de más personas/proyectos)
   ✓ Potencial de crecimiento exponencial
   
   Señales típicas: SaaS, plataforma digital, marketplace tecnológico, app con lógica repetible, API como producto, software con suscripción, automatización/IA como producto (no como servicio consultor).
   
   ⚠️ NO importa si no ha levantado capital de riesgo.
   ⚠️ NO confundir una agencia digital o consultora tech con una startup.

② EBT (Empresa de Base Tecnológica)
   Criterios:
   ✓ Tiene tecnología propia REAL (hardware, software, dispositivos, algoritmos, patentes, I+D)
   ✓ PERO su modelo NO es claramente escalable tipo startup
   
   Señales típicas: desarrollo de software a medida, integración de sistemas, consultoría técnica especializada, manufactura de dispositivos, hardware IoT sin plataforma SaaS, biotecnología, dispositivos médicos, outsourcing tecnológico, laboratorios de I+D.
   
   🚫 NUNCA uses "SaaS" como vertical para EBT.
   🚫 Si tiene tech propia pero no es escalable → ES EBT, NO Disruptiva.

③ DISRUPTIVA
   Criterios (solo si NO es Startup ni EBT):
   ✓ Propuesta moderna, digital o innovadora
   ✓ No tiene tecnología propia como núcleo del negocio
   
   Ejemplos: agencias digitales, e-commerce sin tech propia, marcas D2C, servicios innovadores, fintech sin producto tech propio.

CATEGORÍAS PERMITIDAS: {categoriesList}
→ Usa SOLO las categorías que existen en la taxonomía. Escoge la más cercana.

PASO 3 — VERTICAL Y SUB-VERTICAL
─────────────────────────────────────
• Revisa la taxonomía existente. Si alguna vertical/sub-vertical aplica, ÚSALA.
• Solo sugiere una NUEVA si ninguna existente se ajusta razonablemente.
• La vertical debe ser GENÉRICA (ej: "HealthTech", "EdTech", "FinTech").
• La sub-vertical debe ser ESPECÍFICA (ej: "Telemedicina", "LMS corporativo", "Pagos digitales").
• Si la empresa es EBT, NUNCA uses "SaaS" como vertical.

PASO 4 — DESCRIPCIÓN
─────────────────────────────────────
Escribe exactamente 2-3 oraciones:
• Oración 1: Qué es la empresa y qué hace (producto/servicio principal).
• Oración 2: A quién sirve y cómo (mercado objetivo, modelo).
• Oración 3 (opcional): Diferenciador clave o dato relevante.

Estilo: ejecutivo, concreto, sin adjetivos vacíos. No uses "innovador", "líder", "disruptivo" sin evidencia.

PASO 5 — LOGO
─────────────────────────────────────
Busca la URL del logo de la empresa. Prioridad:
1. Meta tag og:image del sitio web
2. Favicon de alta resolución (apple-touch-icon, favicon-32x32)
3. Imagen con "logo" en src, class o alt dentro del HTML
4. Logo en redes sociales (LinkedIn, Twitter)

REQUISITOS de la URL del logo:
• Debe ser una URL ABSOLUTA y PÚBLICA (https://...)
• Debe apuntar directamente a un archivo de imagen (.png, .jpg, .svg, .webp)
• NO data URIs, NO rutas relativas, NO URLs de CDN que requieran auth
• Si no encuentras un logo válido, retorna null

PASO 6 — GÉNERO DE CONTACTOS
─────────────────────────────────────
Para cada contacto, infiere el género (male/female) basándote en:
• El nombre propio (primer nombre)
• Contexto cultural latinoamericano
• Si hay ambigüedad, busca el nombre en el equipo del sitio web

PASO 7 — ESTADO DE LA EMPRESA
─────────────────────────────────────
Determina si la empresa está activa o inactiva:
• Activa: sitio web funcional, actividad reciente en redes, datos RUES vigentes
• Inactiva: sitio web caído, sin actividad reciente, matrícula cancelada en RUES
• Desconocido: evidencia insuficiente

═══════════════════════════════════════
NIVEL DE CONFIANZA
═══════════════════════════════════════
• HIGH: Sitio web analizado a fondo + evidencia clara para la clasificación
• MEDIUM: Información parcial o clasificación con cierta ambigüedad
• LOW: Poca información disponible o sitio web no accesible

═══════════════════════════════════════
RAZONAMIENTO (OBLIGATORIO)
═══════════════════════════════════════
En el campo "reasoning", explica en máximo 5 líneas:
1. Qué evidencia encontraste en el sitio web
2. POR QUÉ elegiste esta categoría sobre las otras dos
3. Si hubo ambigüedad, qué criterio desempató

═══════════════════════════════════════
REGLAS FINALES
═══════════════════════════════════════
• Sé concreto y ejecutivo. No inventes datos.
• Si la evidencia es débil, refleja confianza media o baja.
• Nunca asumas que una empresa es Startup solo porque tiene sitio web moderno.
• La presencia de tecnología propia (hardware, algoritmos, I+D) → EBT, no Disruptiva.
• Responde ÚNICAMENTE llamando la función analyze_company.`;

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
