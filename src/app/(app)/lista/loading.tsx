import { LoadingStatus } from "@/components/layout/loading-status";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function ListaLoading() {
  return (
    <PageContainer>
      <LoadingStatus />
      <PageHeader title="Lista de la compra" />
      <div className="flex flex-col gap-4" aria-hidden>
        <Skeleton className="h-11 w-full rounded-lg" />
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
