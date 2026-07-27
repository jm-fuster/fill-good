import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function PageHeader({
  title,
  description,
  action,
  avatar,
  backHref,
  backLabel,
}: {
  title: string;
  /**
   * Texto bajo el título, o un control cuando la línea es accionable (en
   * /perfil es el selector de hogar).
   */
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** Retrato a la izquierda del título; hoy solo lo usa /perfil. */
  avatar?: React.ReactNode;
  /** Si se indica, renderiza un enlace «volver» con flecha encima del título. */
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <header className="mb-6">
      {backHref ? (
        <Link
          href={backHref}
          className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden /> {backLabel ?? "Volver"}
        </Link>
      ) : null}
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {avatar}
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance">
              {title}
            </h1>
            {description ? (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
        {action}
      </div>
    </header>
  );
}
