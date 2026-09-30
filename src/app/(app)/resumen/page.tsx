import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { WrappedView } from "@/features/prices/components/wrapped-view";
import { getMonthlyWrapped, lastClosedMonth } from "@/features/prices/wrapped";

export const metadata: Metadata = { title: "Resumen del mes" };

/**
 * Resumen mensual (G4). Ruta propia y no una sección de /precios porque es el
 * destino del aviso del día 1: una URL corta y estable a la que enlazar.
 */
export default async function ResumenPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  // Sin `?mes`, el último mes cerrado: el aviso del día 1 y /perfil ya lo pasan,
  // pero la paleta de comandos enlaza /resumen a secas.
  const wrapped = await getMonthlyWrapped(mes ?? lastClosedMonth());

  return (
    <PageContainer>
      <PageHeader
        title="Resumen del mes"
        description={
          wrapped ? wrapped.monthLabel : "Cómo ha ido el mes en tu hogar."
        }
        backHref="/perfil"
        backLabel="Perfil"
      />
      {wrapped ? <WrappedView data={wrapped} /> : null}
    </PageContainer>
  );
}
