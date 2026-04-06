import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Save, RefreshCw, Loader2, Database, Zap } from 'lucide-react';

interface ChatConfig {
  model: string;
  embeddingModel: string;
  reasoningEffort: string;
  systemPrompt: string;
  lastVectorizedAt?: string;
  totalVectorized?: number;
}

const DEFAULT_CONFIG: ChatConfig = {
  model: 'gpt-4.1-mini',
  embeddingModel: 'text-embedding-3-small',
  reasoningEffort: 'none',
  systemPrompt: '',
};

export default function ChatSettings() {
  const [config, setConfig] = useState<ChatConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [vectorizing, setVectorizing] = useState(false);
  const [vectorProgress, setVectorProgress] = useState<{ processed: number; total: number; errors: number } | null>(null);
  const [embeddingCount, setEmbeddingCount] = useState<number>(0);

  useEffect(() => {
    loadConfig();
    loadEmbeddingCount();
  }, []);

  const loadConfig = async () => {
    const { data } = await supabase
      .from('feature_settings')
      .select('config')
      .eq('feature_key', 'company_chat')
      .single();
    if (data?.config) {
      setConfig({ ...DEFAULT_CONFIG, ...(data.config as any) });
    }
  };

  const loadEmbeddingCount = async () => {
    const { count } = await supabase
      .from('company_embeddings')
      .select('id', { count: 'exact', head: true });
    setEmbeddingCount(count || 0);
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('feature_settings')
      .upsert({ feature_key: 'company_chat', config: config as any, updated_at: new Date().toISOString() }, { onConflict: 'feature_key' });
    setSaving(false);
    if (error) {
      showError('Error', error.message);
    } else {
      showSuccess('Guardado', 'Configuración del chat actualizada');
    }
  };

  const handleVectorize = async () => {
    setVectorizing(true);
    setVectorProgress(null);
    try {
      const { data, error } = await supabase.functions.invoke('vectorize-companies', { body: {} });
      if (error) throw error;
      setVectorProgress({ processed: data.processed, total: data.total, errors: data.errors });

      // Update config with timestamp
      const updatedConfig = { ...config, lastVectorizedAt: new Date().toISOString(), totalVectorized: data.processed };
      setConfig(updatedConfig);
      await supabase
        .from('feature_settings')
        .upsert({ feature_key: 'company_chat', config: updatedConfig as any, updated_at: new Date().toISOString() }, { onConflict: 'feature_key' });

      loadEmbeddingCount();
      showSuccess('Vectorización completa', `${data.processed} empresas procesadas en ${(data.duration_ms / 1000).toFixed(1)}s`);
    } catch (err) {
      showError('Error', err instanceof Error ? err.message : 'Error al vectorizar');
    } finally {
      setVectorizing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Vectorization */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2"><Database className="h-4 w-4" />Base vectorial</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Genera embeddings de todas las empresas para habilitar el chat semántico</p>
          </div>
          <Badge variant="secondary" className="text-xs">
            {embeddingCount} empresas vectorizadas
          </Badge>
        </div>

        {config.lastVectorizedAt && (
          <p className="text-xs text-muted-foreground">
            Última vectorización: {new Date(config.lastVectorizedAt).toLocaleString('es-CO')}
          </p>
        )}

        {vectorProgress && (
          <div className="space-y-1">
            <Progress value={(vectorProgress.processed / vectorProgress.total) * 100} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {vectorProgress.processed}/{vectorProgress.total} procesadas
              {vectorProgress.errors > 0 && ` · ${vectorProgress.errors} errores`}
            </p>
          </div>
        )}

        <Button onClick={handleVectorize} disabled={vectorizing} className="gap-2">
          {vectorizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          {vectorizing ? 'Vectorizando...' : 'Vectorizar empresas'}
        </Button>
      </div>

      {/* Model config */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold">Configuración del modelo</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Modelo de chat</Label>
            <Select value={config.model} onValueChange={(v) => setConfig(prev => ({ ...prev, model: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gpt-4.1-mini">gpt-4.1-mini</SelectItem>
                <SelectItem value="gpt-4.1">gpt-4.1</SelectItem>
                <SelectItem value="gpt-4.1-nano">gpt-4.1-nano</SelectItem>
                <SelectItem value="o4-mini">o4-mini</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Modelo de embeddings</Label>
            <Select value={config.embeddingModel} onValueChange={(v) => setConfig(prev => ({ ...prev, embeddingModel: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="text-embedding-3-small">text-embedding-3-small (1536d)</SelectItem>
                <SelectItem value="text-embedding-3-large">text-embedding-3-large (3072d)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Esfuerzo de razonamiento</Label>
            <Select value={config.reasoningEffort} onValueChange={(v) => setConfig(prev => ({ ...prev, reasoningEffort: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ninguno</SelectItem>
                <SelectItem value="low">Bajo</SelectItem>
                <SelectItem value="medium">Medio</SelectItem>
                <SelectItem value="high">Alto</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* System prompt */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Prompt del sistema (adicional)</h3>
          <p className="text-xs text-muted-foreground">Instrucciones adicionales que se agregan al prompt base del chat</p>
        </div>
        <Textarea
          value={config.systemPrompt}
          onChange={(e) => setConfig(prev => ({ ...prev, systemPrompt: e.target.value }))}
          placeholder="Ej: Siempre responde en español y enfócate en datos de exportación..."
          rows={4}
        />
      </div>

      <Button onClick={handleSave} disabled={saving} className="gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Guardar configuración
      </Button>
    </div>
  );
}
