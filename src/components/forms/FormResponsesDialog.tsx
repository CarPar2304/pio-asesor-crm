import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { showSuccess, showError } from '@/lib/toast';

interface Props {
  formId: string;
  onClose: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  applied: 'Aplicada',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  applied: 'bg-blue-100 text-blue-700',
};

export default function FormResponsesDialog({ formId, onClose }: Props) {
  const [responses, setResponses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedResponse, setSelectedResponse] = useState<any | null>(null);
  const [auditLog, setAuditLog] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase.from('external_form_responses').select('*').eq('form_id', formId).order('submitted_at', { ascending: false });
      setResponses(data || []);
      setLoading(false);
    })();
  }, [formId]);

  const loadAudit = async (responseId: string) => {
    const { data } = await supabase.from('external_form_audit_log').select('*').eq('response_id', responseId).order('created_at');
    setAuditLog(data || []);
  };

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('external_form_responses').update({ status, reviewed_at: new Date().toISOString() } as any).eq('id', id);
    if (error) showError('Error', error.message);
    else {
      showSuccess('Actualizado', `Estado cambiado a ${STATUS_LABELS[status]}`);
      setResponses(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    }
  };

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Respuestas del formulario</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Cargando...</div>
        ) : responses.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No hay respuestas aún</div>
        ) : selectedResponse ? (
          <div className="space-y-4">
            <Button variant="ghost" size="sm" onClick={() => { setSelectedResponse(null); setAuditLog([]); }}>
              ← Volver al listado
            </Button>
            <div className="flex items-center gap-2 mb-2">
              <Badge className={STATUS_COLORS[selectedResponse.status]}>{STATUS_LABELS[selectedResponse.status]}</Badge>
              <span className="text-xs text-muted-foreground">{new Date(selectedResponse.submitted_at).toLocaleString()}</span>
            </div>

            <div className="rounded-md border p-3">
              <p className="text-xs font-medium mb-2">Datos enviados</p>
              <div className="space-y-1.5">
                {Object.entries(selectedResponse.response_data || {}).map(([key, val]) => (
                  <div key={key} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{key}</span>
                    <span className="font-medium">{String(val)}</span>
                  </div>
                ))}
              </div>
            </div>

            {auditLog.length > 0 && (
              <div className="rounded-md border p-3">
                <p className="text-xs font-medium mb-2">Cambios aplicados</p>
                <div className="space-y-1.5">
                  {auditLog.map(a => (
                    <div key={a.id} className="text-xs">
                      <span className="font-medium">{a.field_label || a.field_key}:</span>{' '}
                      <span className="text-red-500 line-through">{a.old_value}</span>{' → '}
                      <span className="text-emerald-600">{a.new_value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedResponse.status === 'pending' && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => updateStatus(selectedResponse.id, 'approved')}>Aprobar</Button>
                <Button size="sm" variant="outline" className="text-red-500" onClick={() => updateStatus(selectedResponse.id, 'rejected')}>Rechazar</Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {responses.map(r => (
              <div key={r.id} className="flex items-center justify-between rounded-md border p-3 hover:bg-muted/50 cursor-pointer"
                onClick={() => { setSelectedResponse(r); loadAudit(r.id); }}>
                <div>
                  <span className="text-xs text-muted-foreground">{new Date(r.submitted_at).toLocaleString()}</span>
                  {r.company_id && <span className="text-[10px] text-muted-foreground ml-2">Empresa vinculada</span>}
                </div>
                <Badge className={STATUS_COLORS[r.status]}>{STATUS_LABELS[r.status]}</Badge>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
