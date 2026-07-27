import { LoadingStatus } from "@/components/layout/loading-status";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function RecetasLoading() {
  return (
    <PageContainer>
      <LoadingStatus />
      <PageHeader title="Mis recetas" />
      <Skeleton className="mb-6 h-10 w-full max-w-sm rounded-lg" aria-hidden />
      <div
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        aria-hidden
      >
        {[0, 1, 2, 3, 4, 5].map((card) => (
          <Skeleton key={card} className="h-40 w-full rounded-xl" />
        ))}
      </div>
    </PageContainer>
  );
}
