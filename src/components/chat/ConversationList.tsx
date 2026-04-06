import { MessageCircle, Plus, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Conversation } from '@/hooks/useChatPersistence';

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

export default function ConversationList({ conversations, activeId, loading, onSelect, onNew, onDelete }: Props) {
  return (
    <div className="flex flex-col h-full border-r border-border">
      <div className="p-3 border-b border-border">
        <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={onNew}>
          <Plus className="h-3.5 w-3.5" />
          Nueva conversación
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-center px-3 gap-2">
            <MessageCircle className="h-5 w-5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Sin conversaciones</p>
          </div>
        ) : (
          conversations.map(c => (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={cn(
                'w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-muted/50 transition-colors group flex items-start gap-2',
                activeId === c.id && 'bg-muted'
              )}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{c.title}</p>
                <p className="text-[10px] text-muted-foreground">
                  {formatDistanceToNow(new Date(c.updatedAt), { addSuffix: true, locale: es })}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
                onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
