import Link from "next/link";

import { PageContainer } from "@/components/layout/page-container";

const FOOTER_LINK =
  "inline-flex min-h-11 items-center rounded-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50";

export function LandingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="w-full border-t border-border py-10">
      <PageContainer className="px-4 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- marca estática SVG local */}
            <img
              src="/brand/fillgood-logo.svg"
              alt=""
              width={28}
              height={28}
              className="size-7 shrink-0 rounded-md"
              aria-hidden
            />
            <p className="text-sm">
              <span className="font-heading font-semibold">Fill Good</span>
              <span className="text-muted-foreground">
                {" · Compra lo justo, ahorra más."}
              </span>
            </p>
          </div>

          {/*
            Cada enlace mide 44 px de alto aunque se vea como texto: sin eso
            eran unos 20 px, y en el móvil cuatro enlaces tan juntos se tocan
            unos por otros. El alto va en el enlace y no en la fila, para que al
            partirse en dos líneas cada una siga siendo un blanco completo; por
            eso el hueco vertical es cero (el propio alto ya separa).
          */}
          <nav
            aria-label="Enlaces del pie"
            className="-my-3 flex flex-wrap items-center gap-x-5 text-sm"
          >
            <Link
              href="/privacidad"
              className={FOOTER_LINK}
            >
              Privacidad
            </Link>
            <Link
              href="/terminos"
              className={FOOTER_LINK}
            >
              Términos
            </Link>
            <Link
              href="/sign-in"
              className={FOOTER_LINK}
            >
              Iniciar sesión
            </Link>
            <Link
              href="/sign-up"
              className={FOOTER_LINK}
            >
              Crear cuenta gratis
            </Link>
          </nav>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          © {year} Jorge Molina Fuster
        </p>
      </PageContainer>
    </footer>
  );
}
