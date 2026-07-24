import { ChevronDown } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { Reveal } from "./reveal";

const FAQS = [
  {
    q: "¿Cuánto cuesta?",
    a: "Nada. Fill Good es gratis.",
  },
  {
    q: "¿Funciona con mi supermercado?",
    a: "Sí. La IA lee el ticket (foto o PDF) de cualquier súper; no depende de integraciones.",
  },
  {
    q: "¿Tengo que instalar algo?",
    a: "No. Funciona en el navegador y, si quieres, la instalas como app en tu móvil.",
  },
  {
    q: "¿Quién ve mis datos?",
    a: "Solo tu hogar. Invitas a los tuyos con un código y nadie más ve vuestra despensa ni vuestros precios.",
  },
  {
    q: "¿Cuántas personas pueden usarla?",
    a: "Toda la casa: misma despensa, misma lista y mismos precios para todos los miembros.",
  },
];

export function LandingFaq() {
  return (
    <section className="w-full border-t border-border py-16 md:py-24">
      <PageContainer variant="narrow" className="px-4 sm:px-6">
        <Reveal>
          <h2 className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">
            Preguntas frecuentes
          </h2>
        </Reveal>

        <Reveal delayMs={80}>
          <div className="mt-8 space-y-3">
            {FAQS.map((faq) => (
              <details
                key={faq.q}
                className="group rounded-lg border border-border bg-card"
              >
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-medium [&::-webkit-details-marker]:hidden">
                  <span>{faq.q}</span>
                  <ChevronDown
                    aria-hidden
                    className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                  />
                </summary>
                <p className="px-4 pb-4 text-pretty text-muted-foreground">
                  {faq.a}
                </p>
              </details>
            ))}
          </div>
        </Reveal>
      </PageContainer>
    </section>
  );
}
