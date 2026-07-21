import { LoadingStatus } from "@/components/layout/loading-status";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function PreciosLoading() {
  return (
    <PageContainer variant="default">
      <LoadingStatus />
      <PageHeader
        title="Precios"
        description="Evolución de precios de lo que compras."
      />
      <div className="flex flex-col gap-2" aria-hidden>
        {[0, 1, 2, 3, 4].map((row) => (
          <Skeleton key={row} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    </PageContainer>
  );
}
