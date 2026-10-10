import { LoadingStatus } from "@/components/layout/loading-status";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function EscanearLoading() {
  return (
    <PageContainer>
      <LoadingStatus />
      <PageHeader
        title="Añadir ticket"
        description="La IA de Google lee los productos y precios; tú los revisas antes de guardar."
      />
      {/* Lo que pinta `ScanForm`: en móvil los dos botones grandes (escanear y
          subir), en escritorio la zona de arrastrar y soltar. */}
      <div className="flex flex-col gap-3" aria-hidden>
        <Skeleton className="h-12 w-full rounded-lg md:hidden" />
        <Skeleton className="h-12 w-full rounded-lg md:hidden" />
        <Skeleton className="hidden min-h-56 w-full rounded-xl md:block" />
      </div>
    </PageContainer>
  );
}
