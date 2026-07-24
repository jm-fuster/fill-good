import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";
import { cn } from "@/lib/utils";
import { HeroPreview } from "./hero-preview";

/**
 * Entrada en cascada, solo CSS y solo bajo `motion-safe` (§8). `fill-mode-both`
 * mantiene el estado inicial durante el retardo; con movimiento reducido no se
 * aplica ninguna de estas clases, así que el contenido nace visible y en sitio.
 */
const ENTER =
  "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-4 motion-safe:duration-700 motion-safe:fill-mode-both motion-safe:ease-out";

export function LandingHero() {
  return (
    <section className="w-full">
      <PageContainer
        variant="wide"
        className="px-4 pt-8 pb-16 sm:px-6 md:pt-16 md:pb-24 lg:pt-24"
      >
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-7">
            <h1
              className={cn(
                ENTER,
                "font-heading text-4xl font-semibold tracking-tight text-balance md:text-5xl lg:text-6xl",
              )}
            >
              Compra lo justo, ahorra más
            </h1>
            <p
              className={cn(
                ENTER,
                "motion-safe:delay-75",
                "mt-5 max-w-[46ch] text-lg text-pretty text-muted-foreground",
              )}
            >
              La despensa, la lista de la compra y los precios de tu súper,
              compartidos con toda tu casa.
            </p>
            <div
              className={cn(
                ENTER,
                "motion-safe:delay-150",
                "mt-8 flex flex-col gap-3 sm:flex-row",
              )}
            >
              <Button
                asChild
                size="lg"
                className="w-full active:scale-[0.98] sm:w-auto"
              >
                <Link href="/sign-up">Crear cuenta gratis</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="w-full active:scale-[0.98] sm:w-auto"
              >
                <Link href="/sign-in">Iniciar sesión</Link>
              </Button>
            </div>
          </div>

          <div className={cn(ENTER, "motion-safe:delay-300", "lg:col-span-5")}>
            <HeroPreview />
          </div>
        </div>
      </PageContainer>
    </section>
  );
}
