import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";
import { Reveal } from "./reveal";

/**
 * Cierre de la página: la única banda de color saturado (`bg-primary`). El CTA
 * repite el label exacto de la nav y el hero (una intención, un label) y usa
 * `variant="secondary"`, que contrasta sobre el primario en claro y oscuro.
 */
export function LandingCta() {
  return (
    <section className="w-full bg-primary py-16 text-primary-foreground md:py-24">
      <PageContainer variant="wide" className="px-4 sm:px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-heading text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            Empieza hoy con tu casa
          </h2>
          <p className="mt-4 text-lg text-pretty text-primary-foreground/90">
            Crea tu hogar, invita a los tuyos y comprad con cabeza.
          </p>
          <div className="mt-8 flex justify-center">
            <Button
              asChild
              size="lg"
              variant="secondary"
              className="w-full active:scale-[0.98] sm:w-auto"
            >
              <Link href="/sign-up">Crear cuenta gratis</Link>
            </Button>
          </div>
        </Reveal>
      </PageContainer>
    </section>
  );
}
