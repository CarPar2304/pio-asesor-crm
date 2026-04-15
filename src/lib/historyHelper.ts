import { supabase } from '@/integrations/supabase/client';

export interface HistoryEvent {
  id: string;
  companyId: string;
  eventType: string;
  title: string;
  description: string;
  metadata: Record<string, any>;
  performedBy: string | null;
  createdAt: string;
}

/** Fire-and-forget: insert a history record for a company */
export function logHistory(
  companyId: string,
  eventType: string,
  title: string,
  description: string = '',
  metadata: Record<string, any> = {},
  performedBy?: string | null,
) {
  supabase.from('company_history').insert({
    company_id: companyId,
    event_type: eventType,
    title,
    description,
    metadata,
    performed_by: performedBy || null,
  } as any).then(({ error }) => {
    if (error) console.error('[history]', error);
  });
}

/** Fetch all history for a company */
export async function fetchCompanyHistory(companyId: string): Promise<HistoryEvent[]> {
  const { data, error } = await supabase
    .from('company_history')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[history] fetch error', error);
    return [];
  }

  return (data || []).map((h: any) => ({
    id: h.id,
    companyId: h.company_id,
    eventType: h.event_type,
    title: h.title,
    description: h.description,
    metadata: h.metadata || {},
    performedBy: h.performed_by,
    createdAt: h.created_at,
  }));
}
