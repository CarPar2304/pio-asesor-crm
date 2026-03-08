import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Building2, Compass, BarChart3, LogOut } from 'lucide-react';
import { InfiniteGridBackground } from '@/components/ui/the-infinite-grid';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import logoCCC from '@/assets/logo-ccc.png';

const navItems = [
  { to: '/', label: 'CRM', icon: Building2 },
  { to: '/enrutador', label: 'Enrutador', icon: Compass },
  { to: '/stats', label: 'Stats', icon: BarChart3 },
];

export default function Layout() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-sm">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <img src={logoCCC} alt="Cámara de Comercio de Cali" className="h-9 w-auto" />
              <div className="hidden sm:block">
                <p className="text-sm font-semibold leading-none">Pioneros Globales</p>
                <p className="text-[11px] text-muted-foreground">Cámara de Comercio de Cali</p>
              </div>
            </div>
            <nav className="flex items-center gap-1">
              {navItems.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) => cn(
                    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={handleLogout} title="Cerrar sesión">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
