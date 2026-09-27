"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { ScrollText } from "lucide-react";
import { toast } from "sonner";

import { safeAction } from "@/lib/action-error";

import { Button } from "@/components/ui/button";
import { setUsageOptOutAction } from "@/features/usage/actions";
import { ackLegalNoticeAction } from "../actions";
import { LEGAL_NOTICE_SINCE, LEGAL_NOTICE_VERSION } from "../version";

/**
 * Aviso de cambios legales, una vez por versión. Se decide en el NAVEGADOR con
 * el usuario que clerk-js ya tiene cargado: hacerlo en el servidor costaría una
 * llamada de red a Clerk en cada render del shell, también en cada acción que
 * revalida la ruta.
 *
 * La oposición a la medición tiene aquí su propio botón y su propia frase, no
 * un punto más de la lista: el art. 21.4 pide presentarla de forma explícita y
 * separada del resto de la información.
 */
export function LegalNoticeCard() {
  const { user, isLoaded } = useUser();
  const [hidden, setHidden] = useState(false);
  const [pending, start] = useTransition();

  if (!isLoaded || !user || hidden) return null;
  const seen = (user.publicMetadata?.legalNotice as { version?: unknown } | undefined)
    ?.version;
  if (typeof seen === "number" && seen >= LEGAL_NOTICE_VERSION) return null;
  if (user.createdAt && user.createdAt > new Date(LEGAL_NOTICE_SINCE)) return null;

  function close(optOut: boolean) {
    start(async () => {
      if (optOut) {
        const r = await safeAction(
          setUsageOptOutAction(true),
          "No se pudo guardar tu preferencia.",
        );
        if (r.error) {
          toast.error(r.error);
          return;
        }
        toast.success("Ya no medimos tu uso, y hemos borrado lo anotado");
      }
      const r = await safeAction(ackLegalNoticeAction(), "No se pudo guardar.");
      if (r.error) {
        toast.error(r.error);
        return;
      }
      setHidden(true);
      void user?.reload();
    });
  }

  return (
    <section
      aria-labelledby="aviso-legal-titulo"
      className="mb-4 flex flex-col gap-3 rounded-xl border bg-card p-4"
    >
      <div className="flex items-center gap-2">
        <ScrollText className="size-5 text-primary" aria-hidden />
        <h2 id="aviso-legal-titulo" className="text-base font-semibold">
          Hemos actualizado la privacidad y los términos
        </h2>
      </div>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>La IA también escribe recetas: te pediremos permiso otra vez antes de usarla.</li>
        <li>La edad mínima para usar Fill Good pasa a 18 años.</li>
      </ul>
      <p className="text-sm text-muted-foreground">
        <strong className="text-foreground">Medición de uso.</strong> Desde el
        22 de septiembre anotamos qué días abres la app y si usas el repaso de
        despensa, para saber qué sirve. Puedes oponerte ahora o cuando quieras
        en Ajustes: dejamos de anotarlo y borramos lo anotado.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => close(false)} loading={pending}>
          Entendido
        </Button>
        <Button variant="outline" onClick={() => close(true)} disabled={pending}>
          No medir mi uso
        </Button>
        <Button asChild variant="ghost">
          <Link href="/privacidad">Ver la política</Link>
        </Button>
      </div>
    </section>
  );
}
