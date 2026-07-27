import { LoadingStatus } from "@/components/layout/loading-status";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function MenusLoading() {
  return (
    <PageContainer>
      <LoadingStatus />
      <PageHeader
        title="Menús"
        description="Planifica la semana con lo que tienes en casa."
      />
      <div className="flex flex-col gap-4" aria-hidden>
        <div className="flex items-center justify-between">
          <Skeleton className="size-9 rounded-lg" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="size-9 rounded-lg" />
        </div>
        <Skeleton className="h-11 w-full rounded-lg" />
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3, 4, 5, 6].map((day) => (
            <Skeleton key={day} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
