import { CalendarDays, ReceiptText, Smartphone } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { PageContainer } from "@/components/layout/page-container";
import { cn } from "@/lib/utils";
import { PantryRow, type PantryStatus } from "./hero-preview";
import { Reveal } from "./reveal";

// datos de ejemplo: caducidades para la celda grande (mismo semáforo que la app).
// Mismas dos reglas que PANTRY_ROWS en `hero-preview.tsx`: iconos de colores
// distintos (naranja, rojo, azul) y ninguno pálido, porque la fila va sobre
// `bg-card` (blanco puro en claro). Estaba "Queso curado", cuyo icono se queda en
// 1,8:1 y desaparece contra la tarjeta.
const EXPIRY_ROWS: { name: string; label: string; status: PantryStatus }[] = [
  { name: "Zanahorias", label: "En stock", status: "ok" },
  { name: "Filetes de ternera", label: "Caduca en 3 días", status: "soon" },
  { name: "Salmón fresco", label: "Caducado", status: "expired" },
];

// datos de ejemplo: mismo producto en tres súpers; el más barato en verde.
const PRICE_CHIPS = [
  { chain: "Mercadona", price: "1,89 €", swatch: "bg-chart-1" },
  { chain: "Carrefour", price: "2,05 €", swatch: "bg-chart-2" },
  { chain: "Lidl", price: "1,79 €", swatch: "bg-chart-3" },
];

const CELL = "rounded-xl border border-border p-6";

export function LandingBento() {
  return (
    <section className="w-full border-t border-border py-16 md:py-24">
      <PageContainer className="px-4 sm:px-6">
        <Reveal>
          <h2 className="font-heading text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            Todo lo de casa, en una sola app
          </h2>
        </Reveal>

        <Reveal delayMs={80}>
          <div className="mt-10 grid gap-4 md:mt-14 md:grid-cols-4">
            {/* Grande: caducidades con preview viva. */}
            <div className={cn(CELL, "bg-card md:col-span-2 md:row-span-2")}>
              <h3 className="font-heading text-lg font-medium">
                Caducidades a la vista
              </h3>
              <p className="mt-1.5 text-pretty text-muted-foreground">
                El semáforo te dice qué va justo de fecha antes de que se tire.
              </p>
              <div aria-hidden className="mt-5 space-y-2">
                {EXPIRY_ROWS.map((row) => (
                  <PantryRow key={row.name} {...row} />
                ))}
              </div>
            </div>

            {/* Ancha con tinte: precios súper a súper (acento cálido chart-3). */}
            <div className={cn(CELL, "bg-secondary md:col-span-2")}>
              <h3 className="font-heading text-lg font-medium">
                Precios súper a súper
              </h3>
              <p className="mt-1.5 text-pretty text-muted-foreground">
                Fill Good recuerda lo que pagaste en cada súper y te enseña dónde
                te sale mejor.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {PRICE_CHIPS.map((chip) => (
                  <span
                    key={chip.chain}
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm"
                  >
                    <span
                      aria-hidden
                      className={cn("size-2 rounded-full", chip.swatch)}
                    />
                    <span className="font-medium">{chip.chain}</span>
                    <span className="font-mono text-muted-foreground">
                      {chip.price}
                    </span>
                  </span>
                ))}
              </div>
            </div>

            {/* Pequeña: lista compartida (fila con checkbox marcado real). */}
            <div className={cn(CELL, "bg-card")}>
              <h3 className="font-heading text-lg font-medium">
                Lista compartida en tiempo real
              </h3>
              <p className="mt-1.5 text-pretty text-muted-foreground">
                Lo que apunta uno lo ve toda la casa, al momento.
              </p>
              <div aria-hidden className="mt-4 flex items-center gap-2.5">
                <Checkbox checked disabled className="disabled:opacity-100" />
                <span className="text-sm text-muted-foreground line-through">
                  Tomates
                </span>
              </div>
            </div>

            {/* Pequeña con tinte: tickets por IA. */}
            <div className={cn(CELL, "bg-accent")}>
              <ReceiptText aria-hidden className="size-6 text-foreground" />
              <h3 className="mt-3 font-heading text-lg font-medium">
                Tickets leídos por IA
              </h3>
              <p className="mt-1.5 text-pretty text-muted-foreground">
                Foto o PDF: los productos, cantidades y precios se apuntan solos.
              </p>
            </div>

            {/* Ancha: del menú a la lista. */}
            <div className={cn(CELL, "bg-card md:col-span-2")}>
              <CalendarDays aria-hidden className="size-6 text-foreground" />
              <h3 className="mt-3 font-heading text-lg font-medium">
                Del menú semanal a la lista
              </h3>
              <p className="mt-1.5 text-pretty text-muted-foreground">
                Planifica la semana y añade sus ingredientes a la lista en un
                toque.
              </p>
            </div>

            {/* Ancha: instalación PWA. */}
            <div className={cn(CELL, "bg-card md:col-span-2")}>
              <Smartphone aria-hidden className="size-6 text-foreground" />
              <h3 className="mt-3 font-heading text-lg font-medium">
                Instálala como app
              </h3>
              <p className="mt-1.5 text-pretty text-muted-foreground">
                En tu móvil, con avisos de caducidad. Sin pasar por ninguna
                tienda de apps.
              </p>
            </div>
          </div>
        </Reveal>
      </PageContainer>
    </section>
  );
}
