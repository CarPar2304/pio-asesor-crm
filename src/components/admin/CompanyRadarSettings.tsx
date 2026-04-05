import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Save, Radar, ChevronDown, ChevronRight, Code2, ExternalLink } from 'lucide-react';

interface CompanyRadarConfig {
  model: string;
  reasoning_effort: string;
  base_prompt: string;
}

const DEFAULT_CONFIG: CompanyRadarConfig = {
  model: 'gpt-4.1-mini',
  reasoning_effort: 'medium',
  base_prompt: '',
};

const EDGE_FUNCTIONS = [
  {
    name: 'company-radar',
    description: 'Interpreta solicitudes en lenguaje natural y las traduce a filtros del CRM usando la taxonomía completa.',
    path: 'supabase/functions/company-radar/index.ts',
  },
];

export default function CompanyRadarSettings() {
  const [config, setConfig] = useState<CompanyRadarConfig>(DEFAULT_CONFIG);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [edgeFunctionsOpen, setEdgeFunctionsOpen] = useState<Record<string, boolean>>({});

  const fetchSettings = useCallback(async () => {
    const { data } = await supabase
      .from('feature_settings')
      .select('*')
      .eq('feature_key', 'company_radar')
      .single();
    if (data) {
      setSettingsId(data.id);
      const dbConfig = data.config as any;
      setConfig({ ...DEFAULT_CONFIG, ...dbConfig });
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    let error: any = null;
    if (settingsId) {
      ({ error } = await supabase
        .from('feature_settings')
        .update({ config: config as any, updated_at: new Date().toISOString() } as any)
        .eq('id', settingsId));
    } else {
      ({ error } = await supabase
        .from('feature_settings')
        .insert({ feature_key: 'company_radar', config: config as any } as any));
    }
    setSaving(false);
    if (error) {
      showError('Error', 'No tienes permisos de admin para guardar configuración');
    } else {
      showSuccess('Guardado', 'Configuración de Company Radar actualizada');
      fetchSettings();
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Radar className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Configuración de Company Radar</h2>
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

        <Separator />

        {/* Custom prompt additions */}
        <Collapsible open={promptOpen} onOpenChange={setPromptOpen}>
          <CollapsibleTrigger className="flex items-center gap-2 w-full text-left">
            {promptOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span className="text-sm font-semibold">Instrucciones adicionales del prompt</span>
            <Badge variant="outline" className="text-[10px] ml-auto">opcional</Badge>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-3">
            <p className="text-xs text-muted-foreground">
              Estas instrucciones se agregan al final del prompt del sistema. Úsalas para dar contexto adicional sobre cómo interpretar las solicitudes de búsqueda.
            </p>
            <Textarea
              value={config.base_prompt}
              onChange={e => setConfig(c => ({ ...c, base_prompt: e.target.value }))}
              rows={6}
              placeholder="Ej: Cuando el usuario busque 'empresas verdes', incluir también verticales de CleanTech y AgriTech..."
              className="font-mono text-xs"
            />
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        {/* Edge Functions */}
        <div>
          <p className="text-sm font-semibold mb-3">Edge Functions</p>
          {EDGE_FUNCTIONS.map(fn => (
            <Collapsible key={fn.name} open={edgeFunctionsOpen[fn.name]} onOpenChange={v => setEdgeFunctionsOpen(p => ({ ...p, [fn.name]: v }))}>
              <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-2">
                {edgeFunctionsOpen[fn.name] ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                <Code2 className="h-3 w-3 text-primary" />
                <span className="text-xs font-medium">{fn.name}</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="ml-8 mb-2">
                <p className="text-xs text-muted-foreground mb-1">{fn.description}</p>
                <a
                  href={`https://supabase.com/dashboard/project/xcrlxgfwzxuvqztmvrvv/functions/${fn.name}/logs`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary flex items-center gap-1 hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> Ver logs
                </a>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} size="sm" className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? 'Guardando...' : 'Guardar configuración'}
          </Button>
        </div>
      </div>
    </div>
  );
}
