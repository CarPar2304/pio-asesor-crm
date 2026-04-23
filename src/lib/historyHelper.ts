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
  eventDate: string | null;
}

/** Fire-and-forget: insert a history record for a company */
export function logHistory(
  companyId: string,
  eventType: string,
  title: string,
  description: string = '',
  metadata: Record<string, any> = {},
  performedBy?: string | null,
  eventDate?: string | null,
) {
  const payload: any = {
    company_id: companyId,
    event_type: eventType,
    title,
    description,
    metadata,
    performed_by: performedBy || null,
  };
  if (eventDate) {
    // Accept 'YYYY-MM-DD' or full ISO; store as timestamptz
    payload.event_date = eventDate.length === 10 ? `${eventDate}T12:00:00Z` : eventDate;
  }
  supabase.from('company_history').insert(payload).then(({ error }) => {
    if (error) console.error('[history]', error);
  });
}

/** Fetch all history for a company, ordered by event_date (fallback created_at) */
export async function fetchCompanyHistory(companyId: string): Promise<HistoryEvent[]> {
  const { data, error } = await supabase
    .from('company_history')
    .select('*')
    .eq('company_id', companyId);

  if (error) {
    console.error('[history] fetch error', error);
    return [];
  }

  const mapped = (data || []).map((h: any) => ({
    id: h.id,
    companyId: h.company_id,
    eventType: h.event_type,
    title: h.title,
    description: h.description,
    metadata: h.metadata || {},
    performedBy: h.performed_by,
    createdAt: h.created_at,
    eventDate: h.event_date || null,
  }));

  // Sort ascending by effective date (event_date if present, else created_at)
  mapped.sort((a, b) => {
    const da = a.eventDate || a.createdAt;
    const db = b.eventDate || b.createdAt;
    return da.localeCompare(db);
  });

  return mapped;
}
