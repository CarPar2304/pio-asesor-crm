import { NavLink, Outlet } from 'react-router-dom';
import { Building2, Compass, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/', label: 'CRM', icon: Building2 },
  { to: '/enrutador', label: 'Enrutador', icon: Compass },
  { to: '/stats', label: 'Stats', icon: BarChart3 },
];

export default function Layout() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-sm">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <span className="text-[10px] font-extrabold tracking-tight text-primary-foreground">CCC</span>
              </div>
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
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                  )}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
