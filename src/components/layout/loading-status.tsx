/**
 * Anuncio para lectores de pantalla mientras se muestra un skeleton de
 * carga (Next no lo hace por defecto en las transiciones de loading.tsx).
 */
export function LoadingStatus({ label = "Cargando…" }: { label?: string }) {
  return (
    <span role="status" className="sr-only">
      {label}
    </span>
  );
}
