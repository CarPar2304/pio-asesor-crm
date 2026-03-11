import { useProfile } from '@/contexts/ProfileContext';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Bell, CheckCheck, ClipboardList } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export default function NotificationPanel() {
  const { notifications, unreadCount, markNotificationRead, markAllRead } = useProfile();
  const navigate = useNavigate();

  const handleClick = async (notif: typeof notifications[0]) => {
    if (!notif.isRead) await markNotificationRead(notif.id);
    if (notif.referenceId) {
      navigate('/tareas');
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8 text-muted-foreground">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Notificaciones</p>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={markAllRead}>
              <CheckCheck className="h-3 w-3" /> Marcar todas
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-80">
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Sin notificaciones</div>
          ) : (
            notifications.map(n => (
              <button
                key={n.id}
                className={cn(
                  'flex w-full gap-3 border-b border-border/50 px-4 py-3 text-left transition-colors hover:bg-muted/50',
                  !n.isRead && 'bg-primary/5'
                )}
                onClick={() => handleClick(n)}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <ClipboardList className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm', !n.isRead && 'font-medium')}>{n.title}</p>
                  {n.message && <p className="text-xs text-muted-foreground line-clamp-2">{n.message}</p>}
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: es })}
                  </p>
                </div>
                {!n.isRead && <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />}
              </button>
            ))
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
