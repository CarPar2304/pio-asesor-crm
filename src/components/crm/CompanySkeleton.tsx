import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

function SkeletonCard() {
  return (
    <Card className="flex flex-col overflow-hidden border border-border/60 bg-card">
      <CardHeader className="pb-2">
        <div className="flex items-start gap-3">
          <Skeleton className="h-12 w-12 rounded-xl shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-3 pb-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-3 rounded-full" />
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-3 rounded-full" />
          <Skeleton className="h-3 w-20" />
        </div>
        <div className="mt-2 space-y-1.5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      </CardContent>
      <CardFooter className="border-t border-border/40 px-3 py-2">
        <div className="flex w-full items-center justify-between">
          <Skeleton className="h-7 w-24 rounded-md" />
          <div className="flex gap-1">
            <Skeleton className="h-7 w-7 rounded-md" />
            <Skeleton className="h-7 w-7 rounded-md" />
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}

function SkeletonTableRow() {
  return (
    <tr className="border-b border-border/40">
      <td className="p-3"><Skeleton className="h-4 w-32" /></td>
      <td className="p-3"><Skeleton className="h-5 w-16 rounded-full" /></td>
      <td className="p-3"><Skeleton className="h-4 w-20" /></td>
      <td className="p-3"><Skeleton className="h-4 w-16" /></td>
      <td className="p-3"><Skeleton className="h-4 w-24" /></td>
      <td className="p-3"><Skeleton className="h-4 w-12" /></td>
      <td className="p-3">
        <div className="flex gap-0.5">
          <Skeleton className="h-7 w-7 rounded-md" />
          <Skeleton className="h-7 w-7 rounded-md" />
        </div>
      </td>
    </tr>
  );
}

export function CompanyGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function CompanyTableSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="rounded-lg border border-border/60 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="p-3"><Skeleton className="h-3 w-20" /></th>
            <th className="p-3"><Skeleton className="h-3 w-16" /></th>
            <th className="p-3"><Skeleton className="h-3 w-14" /></th>
            <th className="p-3"><Skeleton className="h-3 w-12" /></th>
            <th className="p-3"><Skeleton className="h-3 w-16" /></th>
            <th className="p-3"><Skeleton className="h-3 w-10" /></th>
            <th className="p-3"><Skeleton className="h-3 w-16" /></th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: count }).map((_, i) => (
            <SkeletonTableRow key={i} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
