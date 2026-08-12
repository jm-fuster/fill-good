"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ExternalLink, Mic, Unlink } from "lucide-react";
import { toast } from "sonner";

import { safeAction } from "@/lib/action-error";

import { Button } from "@/components/ui/button";
import {
  ResponsiveModal,
  ResponsiveModalClose,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@/components/ui/responsive-modal";
import { relativeDaysLabel } from "@/lib/dates";
import { vibrateTick } from "@/lib/haptics";
import { generateAlexaCodeAction, unlinkAlexaAction } from "../actions";
import type { AlexaLinkView } from "../queries";
import { useRealtimeAlexaLinks } from "../use-realtime-links";

type LiveCode = { code: string; expiresAt: string };

/**
 * Ficha de la skill en la tienda de Alexa (o enlace de invitación de la beta).
 * Mientras la skill siga en modo desarrollo no existe tal enlace: sin la variable
 * el primer paso se explica con palabras y no ofrece un botón que no llevaría a
 * ninguna parte. Ver docs/alexa/README.md.
 *
 * OJO con la beta: una skill en beta NO aparece al buscarla en la app de Alexa
 * (no está en la tienda), así que mientras dure la beta el texto alternativo es
 * mentira y conviene tener la variable puesta.
 */
const SKILL_URL = process.env.NEXT_PUBLIC_ALEXA_SKILL_URL;

/** Hora a la que caduca el código, para quien no puede ver la cuenta atrás. */
function expiryTime(expiresAt: string): string {
  return new Date(expiresAt).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Segundos restantes como «9:05». */
function countdownLabel(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * Seis dígitos partidos en dos mitades: se dictan en voz alta, y «428 391» se
 * lee sin tropezar mucho mejor que «428391». El webhook se queda solo con las
 * cifras del slot, así que el hueco no cambia nada de lo que entiende Alexa.
 */
function groupCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

/**
 * Vinculación con Alexa (contenido de /ajustes/alexa). El altavoz se empareja
 * dictándole un código de seis dígitos que se genera aquí: es de un solo uso y
 * caduca en diez minutos, así que solo se muestra en cliente y nunca se renderiza
 * en servidor.
 *
 * Vive en su propia subpágina de Ajustes y no en una card de /perfil: son tres
 * pasos que ocupan media pantalla y solo se tocan una vez en la vida, así que
 * estorbaban en la pantalla que más se visita. Aquí no hay nada que plegar —
 * entras y ya está todo delante, que es justo para lo que has entrado.
 *
 * El canje llega por Realtime, así que la pantalla se contesta sola: en cuanto el
 * Echo dice «listo», el código desaparece y el altavoz aparece en la lista. Es la
 * diferencia entre una pantalla que parece funcionar y una que lo demuestra.
 */
export function AlexaSetup({
  householdId,
  householdName,
  links,
}: {
  householdId: string;
  householdName: string;
  links: AlexaLinkView[];
}) {
  const [live, setLive] = useState<LiveCode | null>(null);
  // Reloj que solo avanza mientras hay un código vivo. La cuenta atrás se
  // DERIVA de él al renderizar en vez de guardarse aparte: si fuera estado
  // propio arrancaría en cero y el código recién generado se pintaría como
  // caducado durante un frame.
  const [now, setNow] = useState(() => Date.now());
  const [pending, startTransition] = useTransition();
  const [unlinking, setUnlinking] = useState<AlexaLinkView | null>(null);
  const [unlinkPending, startUnlink] = useTransition();

  useRealtimeAlexaLinks(householdId);

  // Cuenta atrás del código: un código muerto en pantalla es peor que ninguno,
  // porque el usuario repite la frase y culpa a la skill de no entenderle.
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);

  // El vínculo nuevo llega por Realtime (router.refresh() trae `links` con una
  // fila más): en ese momento el código ya no sirve para nada y sobra.
  const linkCount = links.length;
  const previousCount = useRef(linkCount);
  useEffect(() => {
    if (linkCount > previousCount.current && live) {
      setLive(null);
      vibrateTick();
      toast.success("Altavoz vinculado");
    }
    previousCount.current = linkCount;
  }, [linkCount, live]);

  function generate() {
    startTransition(async () => {
      const result = await safeAction(
        generateAlexaCodeAction(),
        "No se pudo generar el código.",
      );
      if (result.error || !result.code || !result.expiresAt) {
        toast.error(result.error ?? "No se pudo generar el código.");
        return;
      }
      // El reloj se pone en hora en el mismo render que el código: si la página
      // llevaba un rato abierta, `now` estaría atrasado y la cuenta atrás
      // empezaría con más de diez minutos.
      setNow(Date.now());
      setLive({ code: result.code, expiresAt: result.expiresAt });
    });
  }

  function unlink() {
    const linkId = unlinking?.id;
    if (!linkId) return;
    startUnlink(async () => {
      const result = await safeAction(
        unlinkAlexaAction(linkId),
        "No se pudo desvincular.",
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setUnlinking(null);
      toast.success("Altavoz desvinculado");
    });
  }

  const remaining = live
    ? Math.max(0, Math.ceil((new Date(live.expiresAt).getTime() - now) / 1000))
    : 0;
  const expired = live !== null && remaining === 0;

  return (
    <div className="flex flex-col gap-6">
      {links.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-sm font-medium text-muted-foreground">
            Altavoces vinculados
          </h2>
          <ul className="flex flex-col gap-2">
            {links.map((link) => {
              const since = relativeDaysLabel(link.createdAt.slice(0, 10));
              return (
                <li
                  key={link.id}
                  className="flex items-center justify-between gap-2 rounded-xl bg-card px-3 py-2 ring-1 ring-foreground/10"
                >
                  <div className="min-w-0 text-sm">
                    <p className="truncate font-medium">
                      Altavoz vinculado {since}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {link.lastUsedAt
                        ? `Último uso ${relativeDaysLabel(link.lastUsedAt.slice(0, 10))}`
                        : "Sin usar todavía"}
                      {link.linkedBy ? ` · firma como ${link.linkedBy}` : null}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Desvincular el altavoz vinculado ${since}`}
                    onClick={() => setUnlinking(link)}
                  >
                    <Unlink aria-hidden />
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-sm font-medium text-muted-foreground">
          {links.length > 0 ? "Vincular otro altavoz" : "Cómo vincularlo"}
        </h2>
        <ol className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <li className="flex gap-3">
            <StepNumber>1</StepNumber>
            <div className="flex min-w-0 flex-col gap-2">
              <p className="text-sm font-medium">
                Habilita la skill en tu cuenta de Amazon
              </p>
              <p className="text-sm text-muted-foreground">
                Desde la app de Alexa, con la misma cuenta que tu Echo. Se hace
                una vez y vale para todos los altavoces de esa cuenta.
              </p>
              {SKILL_URL ? (
                <Button variant="outline" className="self-start" asChild>
                  <a href={SKILL_URL} target="_blank" rel="noreferrer noopener">
                    <ExternalLink aria-hidden />
                    Ver la skill «mi despensa»
                  </a>
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Búscala como <strong>mi despensa</strong> en Más → Skills y
                  juegos.
                </p>
              )}
            </div>
          </li>

          <li className="flex gap-3">
            <StepNumber>2</StepNumber>
            <div className="flex min-w-0 flex-col gap-2">
              <p className="text-sm font-medium">Genera un código</p>
              <div aria-live="polite">
                {live ? (
                  <div className="flex flex-col gap-1 rounded-xl border bg-muted/50 p-4">
                    <p
                      className={`text-center font-mono text-3xl tracking-widest ${
                        expired ? "text-muted-foreground line-through" : ""
                      }`}
                    >
                      {groupCode(live.code)}
                    </p>
                    {expired ? (
                      <p className="text-center text-sm text-destructive">
                        Ha caducado. Genera otro.
                      </p>
                    ) : (
                      <>
                        <p
                          className={`text-center text-sm ${
                            remaining <= 60
                              ? "text-warning"
                              : "text-muted-foreground"
                          }`}
                          aria-hidden
                        >
                          Caduca en {countdownLabel(remaining)}
                        </p>
                        {/* La cuenta atrás va oculta a los lectores de pantalla:
                            dentro de un aria-live cantaría cada segundo. La hora
                            es el mismo dato sin el ruido. */}
                        <p className="sr-only">
                          Caduca a las {expiryTime(live.expiresAt)}. Solo vale
                          una vez.
                        </p>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
              <Button
                variant={live ? "outline" : "default"}
                onClick={generate}
                loading={pending}
                className="self-start"
              >
                <Mic aria-hidden />
                {live ? "Generar otro código" : "Generar el código"}
              </Button>
            </div>
          </li>

          <li className="flex gap-3">
            <StepNumber>3</StepNumber>
            <div className="flex min-w-0 flex-col gap-2">
              <p className="text-sm font-medium">Dícelo al altavoz</p>
              <p className="rounded-lg border-l-4 border-primary bg-muted/50 px-3 py-2 text-sm italic">
                «Alexa, dile a mi despensa que vincule con código{" "}
                {live && !expired ? groupCode(live.code) : "…"}»
              </p>
              <p className="text-sm text-muted-foreground">
                Te contestará «listo». Quedará vinculado con{" "}
                <strong>{householdName}</strong> y esta pantalla se actualizará
                sola.
              </p>
            </div>
          </li>
        </ol>
      </section>

      <ResponsiveModal
        open={unlinking !== null}
        onOpenChange={(open) => {
          if (!open) setUnlinking(null);
        }}
      >
        <ResponsiveModalContent>
          <ResponsiveModalHeader>
            <ResponsiveModalTitle className="flex items-center gap-2">
              <Unlink className="size-5" aria-hidden />
              Desvincular el altavoz
            </ResponsiveModalTitle>
            <ResponsiveModalDescription>
              Dejará de poder cambiar el inventario de {householdName}. Puedes
              volver a vincularlo cuando quieras generando otro código.
            </ResponsiveModalDescription>
          </ResponsiveModalHeader>
          <ResponsiveModalFooter className="gap-2">
            <Button
              variant="destructive"
              onClick={unlink}
              loading={unlinkPending}
            >
              <Unlink aria-hidden />
              {unlinkPending ? "Desvinculando…" : "Desvincular"}
            </Button>
            <ResponsiveModalClose asChild>
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </ResponsiveModalClose>
          </ResponsiveModalFooter>
        </ResponsiveModalContent>
      </ResponsiveModal>
    </div>
  );
}

/** Número del paso. `aria-hidden`: el orden ya lo dice la lista. */
function StepNumber({ children }: { children: string }) {
  return (
    <span
      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
      aria-hidden
    >
      {children}
    </span>
  );
}
