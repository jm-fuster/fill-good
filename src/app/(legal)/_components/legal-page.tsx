/**
 * Envoltorio tipográfico de los textos legales (/privacidad, /terminos).
 * No hay plugin de tipografía: el estilo de p/ul/a se aplica desde el article
 * con variantes arbitrarias para que las páginas queden en prosa plana.
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  /** Fecha de última actualización, ya formateada (p. ej. «24 de julio de 2026»). */
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <article className="space-y-8 text-sm leading-relaxed text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-foreground [&_strong]:font-medium [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
      <header className="space-y-2">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          {title}
        </h1>
        <p className="text-xs">Última actualización: {updated}</p>
      </header>
      {children}
    </article>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}
