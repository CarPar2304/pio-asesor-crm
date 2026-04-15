import { supabase } from '@/integrations/supabase/client';

/** Fire-and-forget vectorization trigger. Does not block the UI. */
export function triggerVectorize(mode: 'companies' | 'offers' | 'pipeline' | 'allies', extra?: Record<string, unknown>) {
  supabase.functions.invoke('vectorize-companies', {
    body: { mode, ...extra },
  }).catch((err) => console.error('[vectorize]', mode, err));
}
