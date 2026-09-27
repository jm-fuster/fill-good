import { ChevronRight, Refrigerator, ScanLine, ShoppingCart } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { Reveal } from "./reveal";

const STEPS = [
  {
    icon: ScanLine,
    title: "Escanea el ticket",
    body: "Haz una foto al salir del súper. La IA la convierte en productos con sus precios.",
  },
  {
    icon: Refrigerator,
    title: "Tu despensa al día con cada ticket",
    body: "El inventario refleja lo que hay en casa y avisa de lo que caduca.",
  },
  {
    icon: ShoppingCart,
    title: "Compra solo lo que falta",
    body: "La lista compartida te sugiere lo que se agota, sin duplicados.",
  },
];

export function LandingHowItWorks() {
  return (
    <section className="w-full border-t border-border py-16 md:py-24">
      <PageContainer className="px-4 sm:px-6">
        <Reveal>
          <h2 className="max-w-[20ch] font-heading text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            Del ticket a la despensa, en un minuto
          </h2>
        </Reveal>

        <Reveal delayMs={80}>
          <ol className="mt-10 grid gap-8 md:mt-14 md:grid-cols-3 md:gap-6">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <li
                key={title}
                className="relative flex gap-4 md:flex-col md:gap-4"
              >
                {i > 0 ? (
                  <ChevronRight
                    aria-hidden
                    className="absolute top-3 -left-5 hidden size-5 text-muted-foreground/40 md:block"
                  />
                ) : null}
                <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                  <Icon aria-hidden className="size-6" />
                </span>
                <div className="min-w-0">
                  <h3 className="font-heading text-lg font-medium">{title}</h3>
                  <p className="mt-1.5 text-pretty text-muted-foreground">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Reveal>
      </PageContainer>
    </section>
  );
}
