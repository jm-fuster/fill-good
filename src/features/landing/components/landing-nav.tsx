import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";

/**
 * Cabecera fija de la landing. Una sola línea siempre; sin menú hamburguesa
 * (no hay más navegación que entrar / registrarse). En móvil solo se muestra
 * "Iniciar sesión"; el CTA primario vive en el hero, a un pulgar de distancia.
 */
export function LandingNav() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/85 backdrop-blur">
      <PageContainer className="flex h-16 items-center justify-between px-4 sm:px-6">
        {/*
          La marca es la vuelta al inicio. Esta cabecera la comparten las
          legales, y ahí era la única salida sin el botón del navegador: a
          /privacidad se llega también desde Ajustes › Acerca de. `/` ya decide
          el destino (la app con sesión, la landing sin ella).
        */}
        <Link
          href="/"
          className="-ml-1 flex min-h-11 items-center gap-2 rounded-lg px-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- marca estática SVG local */}
          <img
            src="/brand/fillgood-logo.svg"
            alt=""
            width={32}
            height={32}
            className="size-8 shrink-0 rounded-md"
            aria-hidden
          />
          <span className="font-heading text-lg font-semibold tracking-tight">
            Fill Good
          </span>
        </Link>

        <nav aria-label="Accesos de cuenta" className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link href="/sign-in">Iniciar sesión</Link>
          </Button>
          <Button asChild className="hidden sm:inline-flex">
            <Link href="/sign-up">Crear cuenta gratis</Link>
          </Button>
        </nav>
      </PageContainer>
    </header>
  );
}
