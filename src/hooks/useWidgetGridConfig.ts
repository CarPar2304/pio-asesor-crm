import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { GridConfig, DEFAULT_GRID } from '@/types/widgets';

const FEATURE_KEY = 'widget_grid_config';

type GridMap = Record<string, GridConfig>;

let cache: GridMap | null = null;
let cacheRowId: string | null = null;
const listeners = new Set<(m: GridMap) => void>();

async function load(): Promise<{ map: GridMap; id: string | null }> {
  const { data } = await supabase
    .from('feature_settings')
    .select('id, config')
    .eq('feature_key', FEATURE_KEY)
    .maybeSingle();
  const map = (data?.config as any) || {};
  return { map, id: data?.id || null };
}

async function persist(map: GridMap) {
  if (cacheRowId) {
    await supabase.from('feature_settings').update({ config: map as any, updated_at: new Date().toISOString() } as any).eq('id', cacheRowId);
  } else {
    const { data } = await supabase.from('feature_settings').insert({ feature_key: FEATURE_KEY, config: map as any } as any).select('id').single();
    cacheRowId = data?.id || null;
  }
}

export function useWidgetGridConfig(sectionId: string | null | undefined) {
  const [map, setMap] = useState<GridMap>(cache || {});
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    let cancelled = false;
    const sub = (m: GridMap) => { if (!cancelled) setMap({ ...m }); };
    listeners.add(sub);
    if (!cache) {
      load().then(({ map, id }) => {
        if (cancelled) return;
        cache = map;
        cacheRowId = id;
        setMap(map);
        setLoading(false);
        listeners.forEach(l => l(map));
      });
    } else {
      setLoading(false);
    }
    return () => { cancelled = true; listeners.delete(sub); };
  }, []);

  const config = (sectionId && map[sectionId]) || DEFAULT_GRID;

  const setConfig = useCallback(async (next: GridConfig) => {
    if (!sectionId) return;
    const updated: GridMap = { ...(cache || {}), [sectionId]: next };
    cache = updated;
    setMap(updated);
    listeners.forEach(l => l(updated));
    await persist(updated);
  }, [sectionId]);

  return { config, setConfig, loading };
}
