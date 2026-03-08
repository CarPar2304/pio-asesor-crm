import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

function Shimmer({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-muted before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/40 before:to-transparent",
        className
      )}
      {...props}
    />
  );
}

function SkeletonCard({ index = 0 }: { index?: number }) {
  return (
    <Card
      className="flex flex-col overflow-hidden border border-border/60 bg-card animate-fade-in"
      style={{ animationDelay: `${index * 80}ms`, animationFillMode: 'backwards' }}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start gap-3">
          <Shimmer className="h-12 w-12 rounded-xl shrink-0" />
          <div className="flex-1 space-y-2">
            <Shimmer className="h-4 w-3/4" />
            <Shimmer className="h-3 w-1/2" />
          </div>
          <Shimmer className="h-5 w-16 rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-3 pb-3">
        <div className="flex items-center gap-2">
          <Shimmer className="h-3 w-3 rounded-full" />
          <Shimmer className="h-3 w-24" />
        </div>
        <div className="flex items-center gap-2">
          <Shimmer className="h-3 w-3 rounded-full" />
          <Shimmer className="h-3 w-20" />
        </div>
        <div className="mt-2 space-y-1.5">
          <Shimmer className="h-3 w-16" />
          <Shimmer className="h-5 w-28" />
          <Shimmer className="h-3 w-20" />
        </div>
      </CardContent>
      <CardFooter className="border-t border-border/40 px-3 py-2">
        <div className="flex w-full items-center justify-between">
          <Shimmer className="h-7 w-24 rounded-md" />
          <div className="flex gap-1">
            <Shimmer className="h-7 w-7 rounded-md" />
            <Shimmer className="h-7 w-7 rounded-md" />
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}

function SkeletonTableRow({ index = 0 }: { index?: number }) {
  return (
    <tr
      className="border-b border-border/40 animate-fade-in"
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: 'backwards' }}
    >
      <td className="p-3"><Shimmer className="h-4 w-32" /></td>
      <td className="p-3"><Shimmer className="h-5 w-16 rounded-full" /></td>
      <td className="p-3"><Shimmer className="h-4 w-20" /></td>
      <td className="p-3"><Shimmer className="h-4 w-16" /></td>
      <td className="p-3"><Shimmer className="h-4 w-24" /></td>
      <td className="p-3"><Shimmer className="h-4 w-12" /></td>
      <td className="p-3">
        <div className="flex gap-0.5">
          <Shimmer className="h-7 w-7 rounded-md" />
          <Shimmer className="h-7 w-7 rounded-md" />
        </div>
      </td>
    </tr>
  );
}

export function CompanyGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} index={i} />
      ))}
    </div>
  );
}

export function CompanyTableSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="rounded-lg border border-border/60 overflow-hidden animate-fade-in">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="p-3"><Shimmer className="h-3 w-20" /></th>
            <th className="p-3"><Shimmer className="h-3 w-16" /></th>
            <th className="p-3"><Shimmer className="h-3 w-14" /></th>
            <th className="p-3"><Shimmer className="h-3 w-12" /></th>
            <th className="p-3"><Shimmer className="h-3 w-16" /></th>
            <th className="p-3"><Shimmer className="h-3 w-10" /></th>
            <th className="p-3"><Shimmer className="h-3 w-16" /></th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: count }).map((_, i) => (
            <SkeletonTableRow key={i} index={i} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
