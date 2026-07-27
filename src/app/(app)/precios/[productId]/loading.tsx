import { LoadingStatus } from "@/components/layout/loading-status";
import { PageContainer } from "@/components/layout/page-container";
import { Skeleton } from "@/components/ui/skeleton";

export default function PrecioDetalleLoading() {
  return (
    <PageContainer>
      <LoadingStatus />
      <div aria-hidden>
        <Skeleton className="mb-2 h-5 w-24" />
        <Skeleton className="h-7 w-48" />
        <Skeleton className="mt-2 mb-6 h-4 w-56" />
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="aspect-[4/3] w-full rounded-xl" />
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
