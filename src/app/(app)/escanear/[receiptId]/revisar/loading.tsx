import { LoadingStatus } from "@/components/layout/loading-status";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function RevisarLoading() {
  return (
    <PageContainer variant="default">
      <LoadingStatus />
      <PageHeader
        title="Revisar ticket"
        description="Ajusta lo que haga falta y confirma. Lo marcado pasará al inventario."
      />
      <div className="flex flex-col gap-4 pb-4" aria-hidden>
        <Skeleton className="h-40 w-full rounded-xl" />
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
