import { type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * Marco de las páginas de autenticación (`/sign-in`, `/sign-up`). Da presencia
 * de marca (logo + wordmark) sobre el widget de Clerk y un enlace "Volver" a la
 * landing pública. El widget en sí ya hereda el tema shadcn del ClerkProvider.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col px-4 py-6">
      <div className="mx-auto w-full max-w-6xl">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-lg py-1.5 pr-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Volver
        </Link>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-8 py-8">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- marca estática SVG local */}
          <img
            src="/brand/fillgood-logo.svg"
            alt=""
            width={36}
            height={36}
            className="size-9 shrink-0 rounded-md"
            aria-hidden
          />
          <span className="font-heading text-xl font-semibold tracking-tight">
            Fill Good
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}
