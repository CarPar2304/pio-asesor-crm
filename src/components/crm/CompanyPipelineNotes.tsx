import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/contexts/ProfileContext';
import { StickyNote, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

interface PipelineNoteWithOffer {
  id: string;
  content: string;
  created_by: string | null;
  created_at: string;
  offer_id: string;
  offer_name?: string;
}

interface Props {
  companyId: string;
}

export default function CompanyPipelineNotes({ companyId }: Props) {
  const { allProfiles } = useProfile();
  const navigate = useNavigate();
  const [notes, setNotes] = useState<PipelineNoteWithOffer[]>([]);
  const [loading, setLoading] = useState(true);

  const profileMap = new Map(allProfiles.map(p => [p.userId, p.name || 'Sin nombre']));

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('pipeline_notes')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (data && data.length > 0) {
        // Fetch offer names
        const offerIds = [...new Set(data.map(n => n.offer_id))];
        const { data: offers } = await supabase
          .from('portfolio_offers')
          .select('id, name')
          .in('id', offerIds);
        const offerMap = new Map((offers || []).map(o => [o.id, o.name]));

        setNotes(data.map(n => ({
          ...n,
          offer_name: offerMap.get(n.offer_id) || 'Pipeline',
        })));
      } else {
        setNotes([]);
      }
      setLoading(false);
    };
    fetch();
  }, [companyId]);

  if (loading) return null;
  if (notes.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
        <StickyNote className="h-4 w-4" /> Notas de Pipeline
      </h2>
      <div className="space-y-2">
        {notes.map(note => (
          <div key={note.id} className="rounded-lg border border-border/50 p-3">
            <p className="text-sm whitespace-pre-wrap break-words">{note.content}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-[10px] text-muted-foreground">
                {profileMap.get(note.created_by || '') || 'Desconocido'} · {format(new Date(note.created_at), "d MMM yyyy, HH:mm", { locale: es })}
              </span>
              <button
                onClick={() => navigate('/portafolio')}
                className="inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
              >
                <ExternalLink className="h-2.5 w-2.5" />
                {note.offer_name}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
