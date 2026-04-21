import { forwardRef, useMemo } from 'react';
import { MessageCircle, Loader2, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Msg } from '@/hooks/useChatPersistence';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

interface Props {
  messages: Msg[];
  isLoading: boolean;
}

function extractTables(markdown: string) {
  const lines = markdown.split('\n');
  const tables: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    const isTableLine = line.includes('|');
    if (isTableLine) {
      current.push(line);
    } else if (current.length) {
      if (current.length >= 2) tables.push(current.join('\n'));
      current = [];
    }
  }

  if (current.length >= 2) tables.push(current.join('\n'));
  return tables;
}

function AssistantMessage({ content }: { content: string }) {
  const tables = useMemo(() => extractTables(content), [content]);

  const copyTables = async () => {
    if (!tables.length) return;
    await navigator.clipboard.writeText(tables.join('\n\n'));
  };

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_table]:text-xs [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1 [&_table]:border [&_th]:border [&_td]:border [&_table]:border-border">
      {tables.length > 0 && (
        <div className="mb-2 flex justify-end">
          <Button type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={copyTables}>
            <Copy className="h-3.5 w-3.5" />
            Copiar tabla
          </Button>
        </div>
      )}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h4 className="text-sm font-bold mt-3 mb-1">{children}</h4>,
          h2: ({ children }) => <h4 className="text-sm font-bold mt-3 mb-1">{children}</h4>,
          h3: ({ children }) => <h4 className="text-sm font-semibold mt-2 mb-1">{children}</h4>,
          h4: ({ children }) => <h5 className="text-xs font-semibold mt-2 mb-1">{children}</h5>,
          p: ({ children }) => <p className="mb-1.5 leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-4 mb-1.5 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-4 mb-1.5 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          a: ({ href, children }) => {
            const isInternal = href?.startsWith('/empresa/');
            if (isInternal && href) {
              return <Link to={href} className="font-medium text-primary underline underline-offset-2">{children}</Link>;
            }
            return <a href={href} target="_blank" rel="noreferrer" className="font-medium text-primary underline underline-offset-2">{children}</a>;
          },
          table: ({ children }) => (
            <div className="overflow-x-auto my-2">
              <table className="w-full text-xs border-collapse border border-border rounded">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr className="border-b border-border">{children}</tr>,
          th: ({ children }) => <th className="px-2 py-1.5 text-left font-semibold border border-border">{children}</th>,
          td: ({ children }) => <td className="px-2 py-1.5 border border-border">{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

const ChatMessageList = forwardRef<HTMLDivElement, Props>(({ messages, isLoading }, ref) => (
  <div ref={ref} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
    {messages.length === 0 && (
      <div className="flex flex-col items-center justify-center h-full text-center gap-2 py-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <MessageCircle className="h-6 w-6 text-primary" />
        </div>
        <p className="text-sm font-medium">¡Hola! Soy tu asistente</p>
        <p className="text-xs text-muted-foreground max-w-[260px]">
          Pregúntame sobre las empresas del CRM. Puedo buscar, comparar y analizar información.
        </p>
      </div>
    )}
    {messages.map((msg, i) => (
      <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
        <div
          className={cn(
            'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm',
            msg.role === 'user'
              ? 'bg-primary text-primary-foreground rounded-br-md'
              : 'bg-muted rounded-bl-md'
          )}
        >
          {msg.role === 'assistant' ? (
            <AssistantMessage content={msg.content} />
          ) : (
            <p className="whitespace-pre-wrap">{msg.content}</p>
          )}
        </div>
      </div>
    ))}
    {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
      <div className="flex justify-start">
        <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      </div>
    )}
  </div>
));

ChatMessageList.displayName = 'ChatMessageList';
export default ChatMessageList;
