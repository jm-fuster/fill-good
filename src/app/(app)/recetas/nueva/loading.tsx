import { LoadingStatus } from "@/components/layout/loading-status";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function NuevaRecetaLoading() {
  return (
    <PageContainer variant="default">
      <LoadingStatus />
      <PageHeader
        title="Nueva receta"
        description="Añade los datos del plato y sus ingredientes."
        backHref="/recetas"
        backLabel="Mis recetas"
      />
      <div className="flex flex-col gap-6" aria-hidden>
        {[0, 1, 2].map((block) => (
          <div key={block} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-11 w-full rounded-lg" />
          </div>
        ))}
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    </PageContainer>
  );
}
