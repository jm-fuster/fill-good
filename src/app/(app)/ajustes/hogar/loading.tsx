import { LoadingStatus } from "@/components/layout/loading-status";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function HogarLoading() {
  return (
    <PageContainer variant="narrow">
      <LoadingStatus />
      <PageHeader
        title="Mi hogar"
        description="Invitaciones, miembros y propiedad del hogar."
        backHref="/ajustes"
        backLabel="Ajustes"
      />
      <div className="flex flex-col gap-4" aria-hidden>
        {[0, 1, 2].map((card) => (
          <Skeleton key={card} className="h-36 w-full rounded-xl" />
        ))}
      </div>
    </PageContainer>
  );
}
