import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function PageHeader({
  title,
  description,
  action,
  backHref,
  backLabel,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
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
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
    </header>
  );
}
