import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const FEATURE_KEY = 'crm_layout';
const DEFAULT_LABEL = 'Información general';

interface CrmLayoutConfig {
  unsectioned_label?: string;
}

let cache: CrmLayoutConfig | null = null;
let cacheRowId: string | null = null;
const listeners = new Set<(c: CrmLayoutConfig) => void>();

async function load(): Promise<{ config: CrmLayoutConfig; id: string | null }> {
  const { data } = await supabase
    .from('feature_settings')
    .select('id, config')
    .eq('feature_key', FEATURE_KEY)
    .maybeSingle();
  return { config: (data?.config as any) || {}, id: data?.id || null };
}

async function persist(config: CrmLayoutConfig) {
  if (cacheRowId) {
    await supabase.from('feature_settings').update({ config: config as any, updated_at: new Date().toISOString() } as any).eq('id', cacheRowId);
  } else {
    const { data } = await supabase.from('feature_settings').insert({ feature_key: FEATURE_KEY, config: config as any } as any).select('id').single();
    cacheRowId = data?.id || null;
  }
}

export function useCrmLayoutSettings() {
  const [config, setConfigState] = useState<CrmLayoutConfig>(cache || {});
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    let cancelled = false;
    const sub = (c: CrmLayoutConfig) => { if (!cancelled) setConfigState({ ...c }); };
    listeners.add(sub);
    if (!cache) {
      load().then(({ config, id }) => {
        if (cancelled) return;
        cache = config;
        cacheRowId = id;
        setConfigState(config);
        setLoading(false);
        listeners.forEach(l => l(config));
      });
    } else {
      setLoading(false);
    }
    return () => { cancelled = true; listeners.delete(sub); };
  }, []);

  const setUnsectionedLabel = useCallback(async (label: string) => {
    const next: CrmLayoutConfig = { ...(cache || {}), unsectioned_label: label.trim() || DEFAULT_LABEL };
    cache = next;
    setConfigState(next);
    listeners.forEach(l => l(next));
    await persist(next);
  }, []);

  const unsectionedLabel = config.unsectioned_label?.trim() || DEFAULT_LABEL;

  return { unsectionedLabel, setUnsectionedLabel, loading };
}
