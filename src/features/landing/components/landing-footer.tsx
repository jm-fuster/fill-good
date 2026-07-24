import Link from "next/link";

import { PageContainer } from "@/components/layout/page-container";

export function LandingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="w-full border-t border-border py-10">
      <PageContainer variant="wide" className="px-4 sm:px-6">
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

          <nav
            aria-label="Enlaces del pie"
            className="flex items-center gap-5 text-sm"
          >
            <Link
              href="/sign-in"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/sign-up"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Crear cuenta gratis
            </Link>
          </nav>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          © {year} Fill Good
        </p>
      </PageContainer>
    </footer>
  );
}
