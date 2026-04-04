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
import { Save, Sparkles, RefreshCw, Clock, CheckCircle2, XCircle, Search } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface CompanyFitConfig {
  model: string;
  reasoning_effort: string;
  prompt: string;
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

const DEFAULT_CONFIG: CompanyFitConfig = {
  model: 'gpt-5.4',
  reasoning_effort: 'high',
  prompt: '',
  rues_enabled: true,
  rues_api_url: 'https://www.datos.gov.co/resource/c82u-588k.json',
};

export default function CompanyFitSettings() {
  const [config, setConfig] = useState<CompanyFitConfig>(DEFAULT_CONFIG);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const fetchSettings = useCallback(async () => {
    const { data } = await supabase
      .from('feature_settings')
      .select('*')
      .eq('feature_key', 'company_fit')
      .single();
    if (data) {
      setSettingsId(data.id);
      setConfig({ ...DEFAULT_CONFIG, ...(data.config as any) });
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
                <SelectItem value="gpt-4.1">gpt-4.1</SelectItem>
                <SelectItem value="gpt-4.1-mini">gpt-4.1-mini</SelectItem>
                <SelectItem value="gpt-4.1-nano">gpt-4.1-nano</SelectItem>
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

        <div>
          <Label>Prompt personalizado (se agrega al prompt base)</Label>
          <Textarea
            className="mt-1 min-h-[120px] text-xs font-mono"
            value={config.prompt}
            onChange={e => setConfig(c => ({ ...c, prompt: e.target.value }))}
            placeholder="Instrucciones adicionales para el análisis de empresas..."
          />
          <p className="text-xs text-muted-foreground mt-1">Deja vacío para usar solo el prompt base del sistema.</p>
        </div>

        <Separator />

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
    </div>
  );
}
