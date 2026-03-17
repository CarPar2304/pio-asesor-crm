import { useMemo, useState } from 'react';
import { useCRM } from '@/contexts/CRMContext';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useProfile } from '@/contexts/ProfileContext';
import { useAuth } from '@/hooks/useAuth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { BarChart3, CheckCircle, Clock, Building2, Users, TrendingUp, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';

const PIE_COLORS = ['#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#84cc16', '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#8b5cf6'];

export default function Stats() {
  const { companies } = useCRM();
  const { entries, categories } = usePortfolio();
  const { profile, allProfiles } = useProfile();
  const { session } = useAuth();

  const [selectedUserId, setSelectedUserId] = useState<string>('me');
  const [userRole, setUserRole] = useState<string | null>(null);

  // Check if current user is gerente
  useEffect(() => {
    if (!session) return;
    supabase.from('user_roles').select('role').eq('user_id', session.user.id).then(({ data }) => {
      const roles = (data || []).map((r: any) => r.role);
      if (roles.includes('gerente')) setUserRole('gerente');
      else setUserRole('usuario');
    });
  }, [session]);

  const isGerente = userRole === 'gerente';
  const viewingUserId = selectedUserId === 'all' ? null : selectedUserId === 'me' ? session?.user?.id : selectedUserId;

  const viewingProfile = useMemo(() => {
    if (!viewingUserId) return null;
    return allProfiles.find(p => p.userId === viewingUserId) || profile;
  }, [viewingUserId, allProfiles, profile]);

  // Stats calculations
  const stats = useMemo(() => {
    const todayISO = new Date().toISOString().split('T')[0];

    // Companies with interactions from this user
    const companiesWithInteraction = new Set<string>();
    companies.forEach(c => {
      const hasAction = c.actions.some(a => !viewingUserId || a.createdBy === viewingUserId);
      const hasTask = c.tasks.some(t => !viewingUserId || t.createdBy === viewingUserId || t.assignedTo === viewingUserId);
      const hasMilestone = c.milestones.some(m => !viewingUserId || m.createdBy === viewingUserId);
      const hasPipeline = entries.some(e => e.companyId === c.id && (!viewingUserId || e.addedBy === viewingUserId));
      if (hasAction || hasTask || hasMilestone || hasPipeline) companiesWithInteraction.add(c.id);
    });

    // Tasks
    const allUserTasks = companies.flatMap(c => c.tasks).filter(t => !viewingUserId || t.assignedTo === viewingUserId || t.createdBy === viewingUserId);
    const completedTasks = allUserTasks.filter(t => t.status === 'completed');
    const completedOnTime = completedTasks.filter(t => t.completedDate && t.completedDate <= t.dueDate);
    const pendingTasks = allUserTasks.filter(t => t.status === 'pending');

    // New companies created (we don't have createdBy on companies, so show all if global or count from actions)
    const newCompaniesCount = companies.length;

    // Category distribution (companies with interaction)
    const categoryMap: Record<string, number> = {};
    companies.forEach(c => {
      if (companiesWithInteraction.has(c.id)) {
        const cat = c.category || 'Sin categoría';
        categoryMap[cat] = (categoryMap[cat] || 0) + 1;
      }
    });

    // Product distribution from pipeline
    const productMap: Record<string, Set<string>> = {};
    entries.forEach(e => {
      if (!viewingUserId || e.addedBy === viewingUserId) {
        // We need offer product - get from portfolio context
        productMap[e.offerId] = productMap[e.offerId] || new Set();
        productMap[e.offerId].add(e.companyId);
      }
    });

    return {
      companiesInManagement: companiesWithInteraction.size,
      completedOnTime: completedOnTime.length,
      totalTasks: allUserTasks.length,
      pendingTasks: pendingTasks.length,
      newCompanies: newCompaniesCount,
      categoryMap,
    };
  }, [companies, entries, viewingUserId]);

  // Product distribution
  const { offers, categories } = usePortfolio();
  const productData = useMemo(() => {
    const productCompanies: Record<string, Set<string>> = {};
    entries.forEach(e => {
      if (!viewingUserId || e.addedBy === viewingUserId) {
        const offer = offers.find(o => o.id === e.offerId);
        const product = offer?.product || 'Sin producto';
        if (!productCompanies[product]) productCompanies[product] = new Set();
        productCompanies[product].add(e.companyId);
      }
    });
    return Object.entries(productCompanies).map(([name, set]) => ({ name, value: set.size }));
  }, [entries, offers, viewingUserId]);

  // Category bar data
  const categoryBarData = useMemo(() => {
    return Object.entries(stats.categoryMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [stats.categoryMap]);

  // Offer category donut data (from portfolio offer categories)
  const offerCategoryData = useMemo(() => {
    const catCompanies: Record<string, Set<string>> = {};
    entries.forEach(e => {
      if (!viewingUserId || e.addedBy === viewingUserId) {
        const offer = offers.find(o => o.id === e.offerId);
        if (!offer?.categoryId) return;
        const cat = categories.find(c => c.id === offer.categoryId);
        const catName = cat?.name || 'Sin categoría';
        if (!catCompanies[catName]) catCompanies[catName] = new Set();
        catCompanies[catName].add(e.companyId);
      }
    });
    return Object.entries(catCompanies).map(([name, set]) => ({ name, value: set.size }));
  }, [entries, offers, categories, viewingUserId]);

  const totalInteracted = stats.companiesInManagement || 1;

  return (
    <div className="container py-6 space-y-6 animate-fade-in">
      {/* Profile bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/60 bg-card p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12">
            <AvatarImage src={viewingProfile?.avatarUrl || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary font-bold">
              {viewingProfile?.name ? viewingProfile.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : <BarChart3 className="h-5 w-5" />}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-lg font-bold">
              {selectedUserId === 'all' ? 'Estadísticas globales' : viewingProfile?.name || 'Mis estadísticas'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {selectedUserId === 'all' ? 'Datos consolidados de todos los asesores' : viewingProfile?.position || 'Panel de rendimiento'}
            </p>
          </div>
        </div>

        {isGerente && (
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Seleccionar usuario" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="me">Mis estadísticas</SelectItem>
              <SelectItem value="all">Global (todos)</SelectItem>
              {allProfiles.filter(p => p.userId !== session?.user?.id).map(p => (
                <SelectItem key={p.userId} value={p.userId}>{p.name || p.email || p.userId.slice(0, 8)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard icon={<Building2 className="h-5 w-5" />} label="Empresas en gestión" value={stats.companiesInManagement} color="text-primary" />
        <KPICard icon={<CheckCircle className="h-5 w-5" />} label="Tareas completadas a tiempo" value={`${stats.completedOnTime}/${stats.totalTasks}`} color="text-success" />
        <KPICard icon={<AlertCircle className="h-5 w-5" />} label="Tareas sin completar" value={stats.pendingTasks} color="text-amber-500" />
        <KPICard icon={<TrendingUp className="h-5 w-5" />} label="Total empresas" value={stats.newCompanies} color="text-primary" />
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Bar chart - empresas atendidas por categoría */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Empresas atendidas por categoría</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryBarData.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">Sin datos</div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryBarData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 }} />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Empresas" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Donut chart - por tipo de producto */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Empresas por tipo de producto</CardTitle>
          </CardHeader>
          <CardContent>
            {productData.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">Sin datos de pipeline</div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={productData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} labelLine={false} style={{ fontSize: 11 }}>
                      {productData.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />))}
                    </Pie>
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Donut chart - por categoría de oferta */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Distribución por categoría de oferta</CardTitle>
          </CardHeader>
          <CardContent>
            {offerCategoryData.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">Sin datos</div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={offerCategoryData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} labelLine={false} style={{ fontSize: 11 }}>
                      {offerCategoryData.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />))}
                    </Pie>
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KPICard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number | string; color: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-current/10 ${color}`}>
          {icon}
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
