import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { showSuccess, showError } from '@/lib/toast';
import {
  ArrowLeft, Building2, Calendar, CheckCircle2, XCircle, Clock, Sparkles,
  Search, FileText, ArrowRight, Image as ImageIcon, ExternalLink, ChevronRight,
  Inbox, User
} from 'lucide-react';

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

const STATUS_TONES: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20',
  rejected: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/20',
  applied: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20',
};

const STATUS_ICONS: Record<string, any> = {
  pending: Clock,
  approved: CheckCircle2,
  rejected: XCircle,
  applied: Sparkles,
};

// Friendly labels for known CRM columns
const CRM_LABELS: Record<string, string> = {
  'companies_logo': 'Logo',
  'companies_legal_name': 'Razón social',
  'companies_trade_name': 'Nombre comercial',
  'companies_description': 'Descripción',
  'companies_website': 'Sitio web',
  'companies_city': 'Ciudad',
  'companies_economic_activity': 'Actividad económica',
  'companies_vertical': 'Vertical',
  'companies_category': 'Categoría',
  'companies_nit': 'NIT',
  'companies_exports_usd': 'Exportaciones (USD)',
  'companies_sales_by_year': 'Ventas por año',
  'companies_sales_currency': 'Moneda de ventas',
};

function prettyKey(key: string, fieldLabels: Record<string, string>): string {
  if (fieldLabels[key]) return fieldLabels[key];
  if (CRM_LABELS[key]) return CRM_LABELS[key];
  if (key.startsWith('custom_')) return 'Campo personalizado';
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function isImageUrl(val: any): boolean {
  if (typeof val !== 'string') return false;
  return /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(val);
}

function isUrl(val: any): boolean {
  if (typeof val !== 'string') return false;
  return /^https?:\/\//i.test(val);
}

function formatValue(val: any): { display: string; long: boolean } {
  if (val === null || val === undefined || val === '') return { display: '—', long: false };
  if (typeof val === 'boolean') return { display: val ? 'Sí' : 'No', long: false };
  if (typeof val === 'number') return { display: val.toLocaleString('es-CO'), long: false };
  if (typeof val === 'object') {
    try {
      const str = JSON.stringify(val, null, 2);
      return { display: str, long: str.length > 80 };
    } catch { return { display: String(val), long: false }; }
  }
  const str = String(val);
  return { display: str, long: str.length > 80 };
}

export default function FormResponsesDialog({ formId, onClose }: Props) {
  const [responses, setResponses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedResponse, setSelectedResponse] = useState<any | null>(null);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [companies, setCompanies] = useState<Record<string, { name: string; nit: string }>>({});
  const [fieldLabels, setFieldLabels] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: resps }, { data: fields }] = await Promise.all([
        supabase.from('external_form_responses').select('*').eq('form_id', formId).order('submitted_at', { ascending: false }),
        supabase.from('external_form_fields').select('field_key, label').eq('form_id', formId),
      ]);
      setResponses(resps || []);
      const labels: Record<string, string> = {};
      (fields || []).forEach((f: any) => { labels[f.field_key] = f.label; });
      setFieldLabels(labels);

      const ids = [...new Set((resps || []).map((r: any) => r.company_id).filter(Boolean))];
      if (ids.length > 0) {
        const { data: comps } = await supabase.from('companies').select('id, trade_name, nit').in('id', ids);
        const map: Record<string, { name: string; nit: string }> = {};
        (comps || []).forEach((c: any) => { map[c.id] = { name: c.trade_name, nit: c.nit }; });
        setCompanies(map);
      }
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
      setSelectedResponse((prev: any) => prev ? { ...prev, status } : prev);
    }
  };

  const filtered = useMemo(() => {
    return responses.filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (search) {
        const term = search.toLowerCase();
        const comp = r.company_id ? companies[r.company_id] : null;
        const inComp = comp && (comp.name.toLowerCase().includes(term) || comp.nit?.toLowerCase().includes(term));
        const inData = JSON.stringify(r.response_data || {}).toLowerCase().includes(term);
        if (!inComp && !inData) return false;
      }
      return true;
    });
  }, [responses, statusFilter, search, companies]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: responses.length, pending: 0, approved: 0, rejected: 0, applied: 0 };
    responses.forEach(r => { c[r.status] = (c[r.status] || 0) + 1; });
    return c;
  }, [responses]);

  const renderListView = () => (
    <div className="flex flex-col gap-3 min-h-0">
      {/* Stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {(['all', 'pending', 'approved', 'applied', 'rejected'] as const).map(key => {
          const Icon = key === 'all' ? Inbox : STATUS_ICONS[key];
          const isActive = statusFilter === key;
          const label = key === 'all' ? 'Todas' : STATUS_LABELS[key];
          const tone = key === 'all' ? 'bg-muted/50 text-foreground border-border' : STATUS_TONES[key];
          return (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`rounded-lg border px-3 py-2 text-left transition-all ${tone} ${isActive ? 'ring-2 ring-primary/40 shadow-sm' : 'opacity-70 hover:opacity-100'}`}
            >
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-medium">
                <Icon className="h-3 w-3" />
                <span>{label}</span>
              </div>
              <div className="text-lg font-semibold tabular-nums mt-0.5">{counts[key] || 0}</div>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por empresa, NIT o contenido..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-8 h-9"
        />
      </div>

      {/* List */}
      <ScrollArea className="flex-1 -mx-1 px-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Inbox className="h-10 w-10 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">Sin respuestas para mostrar</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(r => {
              const comp = r.company_id ? companies[r.company_id] : null;
              const Icon = STATUS_ICONS[r.status] || Clock;
              const fieldCount = Object.keys(r.response_data || {}).length;
              return (
                <button
                  key={r.id}
                  onClick={() => { setSelectedResponse(r); loadAudit(r.id); }}
                  className="w-full text-left rounded-lg border bg-card hover:bg-muted/40 hover:border-primary/30 transition-all p-3 group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className={`shrink-0 h-9 w-9 rounded-md flex items-center justify-center ${STATUS_TONES[r.status]} border`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {comp ? (
                            <>
                              <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="font-medium text-sm truncate">{comp.name}</span>
                              {comp.nit && <span className="text-[10px] text-muted-foreground">NIT {comp.nit}</span>}
                            </>
                          ) : (
                            <>
                              <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="font-medium text-sm">Respuesta anónima</span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1">
                          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(r.submitted_at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                          <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{fieldCount} campos</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className={`text-[10px] ${STATUS_TONES[r.status]}`}>{STATUS_LABELS[r.status]}</Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );

  const renderDetailView = () => {
    const r = selectedResponse;
    const Icon = STATUS_ICONS[r.status] || Clock;
    const comp = r.company_id ? companies[r.company_id] : null;
    const entries = Object.entries(r.response_data || {});

    return (
      <div className="flex flex-col gap-3 min-h-0">
        {/* Header bar */}
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" className="h-8" onClick={() => { setSelectedResponse(null); setAuditLog([]); }}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Volver
          </Button>
          <Badge variant="outline" className={`${STATUS_TONES[r.status]} gap-1`}>
            <Icon className="h-3 w-3" />
            {STATUS_LABELS[r.status]}
          </Badge>
        </div>

        {/* Meta card */}
        <div className="rounded-lg border bg-gradient-to-br from-muted/30 to-transparent p-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              {comp ? <Building2 className="h-5 w-5" /> : <User className="h-5 w-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-sm truncate">{comp?.name || 'Respuesta anónima'}</h3>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                {comp?.nit && <span>NIT {comp.nit}</span>}
                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(r.submitted_at).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' })}</span>
              </div>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1 -mx-1 px-1">
          <div className="space-y-3">
            {/* Audit / changes — show first when present */}
            {auditLog.length > 0 && (
              <div className="rounded-lg border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50/30 dark:bg-emerald-500/5 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-emerald-200 dark:border-emerald-500/20 bg-emerald-100/50 dark:bg-emerald-500/10">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-300" />
                    <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">Cambios aplicados</span>
                  </div>
                  <Badge variant="secondary" className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">{auditLog.length}</Badge>
                </div>
                <div className="divide-y divide-emerald-200/60 dark:divide-emerald-500/10">
                  {auditLog.map(a => (
                    <div key={a.id} className="px-3 py-2">
                      <div className="text-[11px] font-medium text-foreground mb-1">{a.field_label || prettyKey(a.field_key, fieldLabels)}</div>
                      <div className="flex items-center gap-2 text-xs flex-wrap">
                        <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300 line-through max-w-[40%] truncate">
                          {a.old_value || '—'}
                        </span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 font-medium max-w-[50%] truncate">
                          {a.new_value || '—'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Submitted data */}
            <div className="rounded-lg border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold">Datos enviados</span>
                </div>
                <Badge variant="secondary" className="text-[10px]">{entries.length}</Badge>
              </div>
              <div className="divide-y">
                {entries.length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs text-muted-foreground">Sin datos</div>
                ) : entries.map(([key, val]) => {
                  const { display, long } = formatValue(val);
                  const label = prettyKey(key, fieldLabels);
                  const showImage = isImageUrl(val);
                  const showLink = !showImage && isUrl(val);

                  return (
                    <div key={key} className={`px-3 py-2 ${long ? '' : 'flex items-start justify-between gap-3'}`}>
                      <div className={long ? 'mb-1.5' : 'min-w-0 flex-1'}>
                        <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</div>
                        {long && (
                          <div className="text-xs text-foreground/90 mt-1 whitespace-pre-wrap break-words leading-relaxed">{display}</div>
                        )}
                      </div>
                      {!long && (
                        <div className="text-xs font-medium text-right max-w-[60%] break-words">
                          {showImage ? (
                            <a href={display} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:underline">
                              <img src={display} alt={label} className="h-8 w-8 rounded object-cover border" />
                              <ImageIcon className="h-3 w-3 text-muted-foreground" />
                            </a>
                          ) : showLink ? (
                            <a href={display} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                              <span className="truncate max-w-[200px]">{display}</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span>{display}</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Actions */}
        {r.status === 'pending' && (
          <>
            <Separator />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={() => updateStatus(r.id, 'rejected')}>
                <XCircle className="h-3.5 w-3.5 mr-1" /> Rechazar
              </Button>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => updateStatus(r.id, 'approved')}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Aprobar
              </Button>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-primary" />
            Respuestas del formulario
            {!loading && <span className="text-xs font-normal text-muted-foreground">· {responses.length} en total</span>}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden px-5 py-4 flex flex-col min-h-0">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}
            </div>
          ) : selectedResponse ? renderDetailView() : renderListView()}
        </div>
      </DialogContent>
    </Dialog>
  );
}
