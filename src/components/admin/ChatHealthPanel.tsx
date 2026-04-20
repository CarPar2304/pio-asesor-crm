import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Activity, AlertCircle, CheckCircle2, Clock, MessageSquare, Search, TrendingUp } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from 'recharts';

interface LogRow {
  id: string;
  created_at: string;
  conversation_id: string | null;
  user_id: string | null;
  user_message: string;
  intent: string | null;
  path: string | null;
  evidence_level: string | null;
  vacancy_case: string | null;
  latency_ms: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
  tools_called: any;
  router_output: any;
  error: string | null;
}

const PIE_COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', 'hsl(var(--success, 142 70% 45%))', 'hsl(38 92% 50%)', 'hsl(var(--destructive))'];

const PATH_LABEL: Record<string, string> = {
  exact: 'Exacto',
  semantic: 'Semántico',
  hybrid: 'Híbrido',
  clarify: 'Aclaración',
};

const EVIDENCE_LABEL: Record<string, string> = {
  full: 'Completa',
  partial: 'Parcial',
  none: 'Ninguna',
};

const EVIDENCE_COLOR: Record<string, string> = {
  full: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
  partial: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  none: 'bg-rose-500/10 text-rose-600 border-rose-500/30',
};

const PATH_COLOR: Record<string, string> = {
  exact: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
  semantic: 'bg-violet-500/10 text-violet-600 border-violet-500/30',
  hybrid: 'bg-fuchsia-500/10 text-fuchsia-600 border-fuchsia-500/30',
  clarify: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
};

export default function ChatHealthPanel() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<'24h' | '7d' | '30d'>('7d');
  const [pathFilter, setPathFilter] = useState<string>('all');
  const [selected, setSelected] = useState<LogRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const since = new Date();
    if (range === '24h') since.setDate(since.getDate() - 1);
    else if (range === '7d') since.setDate(since.getDate() - 7);
    else since.setDate(since.getDate() - 30);

    supabase
      .from('chat_retrieval_logs')
      .select('*')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error(error);
        setLogs((data as LogRow[]) || []);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [range]);

  const filtered = useMemo(
    () => (pathFilter === 'all' ? logs : logs.filter(l => l.path === pathFilter)),
    [logs, pathFilter],
  );

  const stats = useMemo(() => {
    const total = filtered.length;
    const errors = filtered.filter(l => l.error).length;
    const avgLatency = total ? Math.round(filtered.reduce((s, l) => s + (l.latency_ms || 0), 0) / total) : 0;
    const totalTokens = filtered.reduce((s, l) => s + (l.tokens_in || 0) + (l.tokens_out || 0), 0);

    const pathDist: Record<string, number> = {};
    const intentDist: Record<string, number> = {};
    const evidenceDist: Record<string, number> = {};
    const vacancyDist: Record<string, number> = {};

    filtered.forEach(l => {
      if (l.path) pathDist[l.path] = (pathDist[l.path] || 0) + 1;
      if (l.intent) intentDist[l.intent] = (intentDist[l.intent] || 0) + 1;
      if (l.evidence_level) evidenceDist[l.evidence_level] = (evidenceDist[l.evidence_level] || 0) + 1;
      if (l.vacancy_case) vacancyDist[l.vacancy_case] = (vacancyDist[l.vacancy_case] || 0) + 1;
    });

    return { total, errors, avgLatency, totalTokens, pathDist, intentDist, evidenceDist, vacancyDist };
  }, [filtered]);

  const intentBars = useMemo(
    () => Object.entries(stats.intentDist).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    [stats.intentDist],
  );

  const pathPie = useMemo(
    () => Object.entries(stats.pathDist).map(([name, value]) => ({ name: PATH_LABEL[name] || name, value })),
    [stats.pathDist],
  );

  const evidenceBars = useMemo(
    () => Object.entries(stats.evidenceDist).map(([name, count]) => ({ name: EVIDENCE_LABEL[name] || name, count })),
    [stats.evidenceDist],
  );

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Salud del Chat (RAG + Tools)
          </h2>
          <p className="text-xs text-muted-foreground">Trazabilidad de intenciones, evidencia y latencia</p>
        </div>
        <div className="flex gap-2">
          <Select value={range} onValueChange={(v: any) => setRange(v)}>
            <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Últimas 24h</SelectItem>
              <SelectItem value="7d">Últimos 7 días</SelectItem>
              <SelectItem value="30d">Últimos 30 días</SelectItem>
            </SelectContent>
          </Select>
          <Select value={pathFilter} onValueChange={setPathFilter}>
            <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los caminos</SelectItem>
              <SelectItem value="exact">Exacto</SelectItem>
              <SelectItem value="semantic">Semántico</SelectItem>
              <SelectItem value="hybrid">Híbrido</SelectItem>
              <SelectItem value="clarify">Aclaración</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI icon={<MessageSquare className="h-4 w-4" />} label="Consultas" value={stats.total} color="text-primary" />
        <KPI icon={<Clock className="h-4 w-4" />} label="Latencia media" value={`${stats.avgLatency} ms`} color="text-blue-500" />
        <KPI icon={<TrendingUp className="h-4 w-4" />} label="Tokens totales" value={stats.totalTokens.toLocaleString()} color="text-emerald-500" />
        <KPI icon={<AlertCircle className="h-4 w-4" />} label="Errores" value={stats.errors} color={stats.errors > 0 ? 'text-rose-500' : 'text-muted-foreground'} />
      </div>

      {/* Charts */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold">Distribución por camino</CardTitle></CardHeader>
          <CardContent className="h-48">
            {pathPie.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={pathPie} cx="50%" cy="50%" innerRadius={35} outerRadius={65} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 10 }}>
                    {pathPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold">Top intenciones</CardTitle></CardHeader>
          <CardContent className="h-48">
            {intentBars.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer>
                <BarChart data={intentBars} layout="vertical" margin={{ left: 8, right: 8, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold">Nivel de evidencia</CardTitle></CardHeader>
          <CardContent className="h-48">
            {evidenceBars.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer>
                <BarChart data={evidenceBars} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }} />
                  <Bar dataKey="count" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Vacancy cases */}
      {Object.keys(stats.vacancyDist).length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold">Casos de vacío / ambigüedad</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2 pt-0">
            {Object.entries(stats.vacancyDist).map(([k, v]) => (
              <Badge key={k} variant="outline" className="text-xs">
                {k === 'A' && 'A · No existe'}
                {k === 'B' && 'B · Sin coincidencia confiable'}
                {k === 'C' && 'C · Existe sin datos'}
                {k === 'D' && 'D · Ambigüedad'}
                <span className="ml-1.5 font-bold">{v}</span>
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recent logs */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold">Consultas recientes</CardTitle></CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[400px]">
            {loading ? (
              <div className="p-6 text-center text-xs text-muted-foreground">Cargando…</div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">Sin registros en este rango</div>
            ) : (
              <div className="divide-y divide-border/60">
                {filtered.slice(0, 100).map(l => (
                  <button
                    key={l.id}
                    onClick={() => setSelected(l === selected ? null : l)}
                    className="w-full text-left p-3 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{l.user_message || '(sin mensaje)'}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {l.path && <Badge variant="outline" className={`text-[10px] ${PATH_COLOR[l.path] || ''}`}>{PATH_LABEL[l.path] || l.path}</Badge>}
                          {l.intent && <Badge variant="outline" className="text-[10px]">{l.intent}</Badge>}
                          {l.evidence_level && <Badge variant="outline" className={`text-[10px] ${EVIDENCE_COLOR[l.evidence_level] || ''}`}>{EVIDENCE_LABEL[l.evidence_level]}</Badge>}
                          {l.vacancy_case && <Badge variant="outline" className="text-[10px]">vac. {l.vacancy_case}</Badge>}
                          {l.error && <Badge variant="outline" className="text-[10px] bg-rose-500/10 text-rose-600 border-rose-500/30">error</Badge>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-muted-foreground">{new Date(l.created_at).toLocaleString('es-CO', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}</p>
                        <p className="text-[10px] text-muted-foreground">{l.latency_ms ?? '—'} ms</p>
                      </div>
                    </div>
                    {selected?.id === l.id && (
                      <div className="mt-3 rounded-md border border-border/60 bg-muted/30 p-2 space-y-2">
                        <DetailRow label="Tools" value={Array.isArray(l.tools_called) ? l.tools_called.map((t: any) => t.tool || t.name || JSON.stringify(t)).join(', ') || '—' : '—'} />
                        <DetailRow label="Tokens" value={`${l.tokens_in ?? 0} in / ${l.tokens_out ?? 0} out`} />
                        {l.error && <DetailRow label="Error" value={l.error} danger />}
                        <details className="text-[10px]">
                          <summary className="cursor-pointer text-muted-foreground">Router output</summary>
                          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all bg-background/60 p-2 rounded text-[10px]">{JSON.stringify(l.router_output, null, 2)}</pre>
                        </details>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

function KPI({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-current/10 ${color}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground truncate">{label}</p>
          <p className="text-base font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailRow({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex gap-2 text-[11px]">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className={danger ? 'text-rose-600 break-all' : 'break-all'}>{value}</span>
    </div>
  );
}

function Empty() {
  return <div className="h-full flex items-center justify-center text-xs text-muted-foreground"><Search className="h-3 w-3 mr-1" /> Sin datos</div>;
}
