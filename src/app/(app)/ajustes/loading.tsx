import { LoadingStatus } from "@/components/layout/loading-status";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function AjustesLoading() {
  return (
    <PageContainer variant="default">
      <LoadingStatus />
      <PageHeader title="Ajustes" description="Tu hogar y tus preferencias." />
      <div className="flex flex-col gap-6" aria-hidden>
        <Skeleton className="h-14 w-full rounded-xl" />
        {/* Grupos del índice: alto aproximado de 3, 2, 1 y 2 filas. */}
        {["h-40", "h-28", "h-14", "h-28"].map((height, group) => (
          <div key={group} className="flex flex-col gap-2">
            <Skeleton className="h-5 w-24 rounded-lg" />
            <Skeleton className={`w-full rounded-xl ${height}`} />
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
