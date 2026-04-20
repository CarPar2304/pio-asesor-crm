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
import { Save, RefreshCw, Loader2, Database, Zap, Package, GitBranch, Users, ListChecks } from 'lucide-react';

interface ChatConfig {
  model: string;
  embeddingModel: string;
  reasoningEffort: string;
  systemPrompt: string;
  lastVectorizedAt?: string;
  totalVectorized?: number;
  lastOfferVectorizedAt?: string;
  lastPipelineVectorizedAt?: string;
  lastAllyVectorizedAt?: string;
}

const DEFAULT_CONFIG: ChatConfig = {
  model: 'gpt-5-mini',
  embeddingModel: 'text-embedding-3-small',
  reasoningEffort: 'low',
  systemPrompt: '',
};

export default function ChatSettings() {
  const [config, setConfig] = useState<ChatConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [vectorizing, setVectorizing] = useState(false);
  const [vectorizingOffers, setVectorizingOffers] = useState(false);
  const [vectorizingPipeline, setVectorizingPipeline] = useState(false);
  const [vectorizingAllies, setVectorizingAllies] = useState(false);
  const [vectorProgress, setVectorProgress] = useState<{ processed: number; total: number; errors: number } | null>(null);
  const [embeddingCount, setEmbeddingCount] = useState<number>(0);
  const [offerEmbeddingCount, setOfferEmbeddingCount] = useState<number>(0);
  const [pipelineEmbeddingCount, setPipelineEmbeddingCount] = useState<number>(0);
  const [allyEmbeddingCount, setAllyEmbeddingCount] = useState<number>(0);

  useEffect(() => {
    loadConfig();
    loadEmbeddingCounts();
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

  const loadEmbeddingCounts = async () => {
    const [c1, c2, c3, c4] = await Promise.all([
      supabase.from('company_embeddings').select('id', { count: 'exact', head: true }),
      supabase.from('offer_embeddings').select('id', { count: 'exact', head: true }),
      supabase.from('pipeline_embeddings').select('id', { count: 'exact', head: true }),
      supabase.from('ally_embeddings').select('id', { count: 'exact', head: true }),
    ]);
    setEmbeddingCount(c1.count || 0);
    setOfferEmbeddingCount(c2.count || 0);
    setPipelineEmbeddingCount(c3.count || 0);
    setAllyEmbeddingCount(c4.count || 0);
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
      const { data, error } = await supabase.functions.invoke('vectorize-companies', { body: { mode: 'companies' } });
      if (error) throw error;
      setVectorProgress({ processed: data.processed, total: data.total, errors: data.errors });

      const updatedConfig = { ...config, lastVectorizedAt: new Date().toISOString(), totalVectorized: data.processed };
      setConfig(updatedConfig);
      await supabase
        .from('feature_settings')
        .upsert({ feature_key: 'company_chat', config: updatedConfig as any, updated_at: new Date().toISOString() }, { onConflict: 'feature_key' });

      loadEmbeddingCounts();
      showSuccess('Vectorización completa', `${data.processed} empresas procesadas en ${(data.duration_ms / 1000).toFixed(1)}s`);
    } catch (err) {
      showError('Error', err instanceof Error ? err.message : 'Error al vectorizar');
    } finally {
      setVectorizing(false);
    }
  };

  const handleVectorizeMode = async (mode: 'offers' | 'pipeline' | 'allies', setLoading: (v: boolean) => void, configKey: string, label: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('vectorize-companies', { body: { mode } });
      if (error) throw error;

      const updatedConfig = { ...config, [configKey]: new Date().toISOString() };
      setConfig(updatedConfig);
      await supabase
        .from('feature_settings')
        .upsert({ feature_key: 'company_chat', config: updatedConfig as any, updated_at: new Date().toISOString() }, { onConflict: 'feature_key' });

      loadEmbeddingCounts();
      showSuccess('Vectorización completa', `${data.processed} ${label} procesados en ${(data.duration_ms / 1000).toFixed(1)}s`);
    } catch (err) {
      showError('Error', err instanceof Error ? err.message : 'Error al vectorizar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Vectorization - Companies */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2"><Database className="h-4 w-4" />Base vectorial - Empresas</h3>
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

      {/* Vectorization - Offers, Pipeline, Allies */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Package className="h-4 w-4" />Base vectorial - Portafolio</h3>
        <p className="text-xs text-muted-foreground">Vectoriza ofertas, pipeline y aliados para que el chat pueda consultar información del portafolio</p>

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border/50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium flex items-center gap-1.5"><Package className="h-3.5 w-3.5" /> Oferta</span>
              <Badge variant="outline" className="text-[10px]">{offerEmbeddingCount}</Badge>
            </div>
            {config.lastOfferVectorizedAt && (
              <p className="text-[10px] text-muted-foreground">{new Date(config.lastOfferVectorizedAt).toLocaleString('es-CO')}</p>
            )}
            <Button size="sm" variant="outline" className="w-full gap-1.5" disabled={vectorizingOffers}
              onClick={() => handleVectorizeMode('offers', setVectorizingOffers, 'lastOfferVectorizedAt', 'ofertas')}>
              {vectorizingOffers ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              Vectorizar Oferta
            </Button>
          </div>

          <div className="rounded-lg border border-border/50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium flex items-center gap-1.5"><GitBranch className="h-3.5 w-3.5" /> Pipeline</span>
              <Badge variant="outline" className="text-[10px]">{pipelineEmbeddingCount}</Badge>
            </div>
            {config.lastPipelineVectorizedAt && (
              <p className="text-[10px] text-muted-foreground">{new Date(config.lastPipelineVectorizedAt).toLocaleString('es-CO')}</p>
            )}
            <Button size="sm" variant="outline" className="w-full gap-1.5" disabled={vectorizingPipeline}
              onClick={() => handleVectorizeMode('pipeline', setVectorizingPipeline, 'lastPipelineVectorizedAt', 'pipelines')}>
              {vectorizingPipeline ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              Vectorizar Pipeline
            </Button>
          </div>

          <div className="rounded-lg border border-border/50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Aliados</span>
              <Badge variant="outline" className="text-[10px]">{allyEmbeddingCount}</Badge>
            </div>
            {config.lastAllyVectorizedAt && (
              <p className="text-[10px] text-muted-foreground">{new Date(config.lastAllyVectorizedAt).toLocaleString('es-CO')}</p>
            )}
            <Button size="sm" variant="outline" className="w-full gap-1.5" disabled={vectorizingAllies}
              onClick={() => handleVectorizeMode('allies', setVectorizingAllies, 'lastAllyVectorizedAt', 'aliados')}>
              {vectorizingAllies ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              Vectorizar Aliados
            </Button>
          </div>

          <div className="rounded-lg border border-border/50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium flex items-center gap-1.5"><ListChecks className="h-3.5 w-3.5" /> Tareas</span>
              <Badge variant="outline" className="text-[10px]">{embeddingCount}</Badge>
            </div>
            <p className="text-[10px] text-muted-foreground">Re-vectoriza empresas con tareas actualizadas</p>
            <Button size="sm" variant="outline" className="w-full gap-1.5" disabled={vectorizing}
              onClick={handleVectorize}>
              {vectorizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              Vectorizar Tareas
            </Button>
          </div>
        </div>
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
                <SelectItem value="gpt-5-nano">gpt-5-nano</SelectItem>
                <SelectItem value="gpt-5-mini">gpt-5-mini</SelectItem>
                <SelectItem value="gpt-5">gpt-5</SelectItem>
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
