"use client";

import { useState, useTransition } from "react";
import { Mic, Unlink } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { generateAlexaCodeAction, unlinkAlexaAction } from "../actions";
import type { AlexaLinkView } from "../queries";

type LiveCode = { code: string; expiresAt: string };

/** Hora a la que caduca el código, para no prometer «10 minutos» a ciegas. */
function expiryTime(expiresAt: string): string {
  return new Date(expiresAt).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Vinculación con Alexa (card de /perfil). El altavoz se empareja dictándole un
 * código de seis dígitos que se genera aquí: es de un solo uso y caduca en diez
 * minutos, así que solo se muestra en cliente y nunca se renderiza en servidor.
 *
 * El código se enseña en grande y se acompaña de la frase LITERAL que hay que
 * decir: la parte difícil de una skill no es el código, es acordarse de que la
 * orden empieza por «Alexa, dile a la despensa…».
 */
export function AlexaCard({
  householdName,
  links,
}: {
  householdName: string;
  links: AlexaLinkView[];
}) {
  const [live, setLive] = useState<LiveCode | null>(null);
  const [pending, startTransition] = useTransition();
  const [unlinking, setUnlinking] = useState<AlexaLinkView | null>(null);
  const [unlinkPending, startUnlink] = useTransition();

  function generate() {
    startTransition(async () => {
      const result = await generateAlexaCodeAction();
      if (result.error || !result.code || !result.expiresAt) {
        toast.error(result.error ?? "No se pudo generar el código.");
        return;
      }
      setLive({ code: result.code, expiresAt: result.expiresAt });
    });
  }

  function unlink() {
    const linkId = unlinking?.id;
    if (!linkId) return;
    startUnlink(async () => {
      const result = await unlinkAlexaAction(linkId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setUnlinking(null);
      toast.success("Altavoz desvinculado");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mic className="size-4" aria-hidden />
          Alexa
        </CardTitle>
        <CardDescription>
          Resta lo que gastes sin tocar el móvil: «Alexa, dile a la despensa que
          reste dos yogures».
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {links.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {links.map((link) => {
              const since = relativeDaysLabel(link.createdAt.slice(0, 10));
              return (
                <li
                  key={link.id}
                  className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
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
        ) : null}

        <div aria-live="polite">
          {live ? (
            <div className="flex flex-col gap-2 rounded-xl border bg-muted/50 p-4">
              <p className="text-center font-mono text-3xl tracking-widest">
                {live.code}
              </p>
              <p className="text-center text-sm">
                Di: «Alexa, dile a la despensa que vincule con código{" "}
                {live.code}».
              </p>
              <p className="text-center text-xs text-muted-foreground">
                Caduca a las {expiryTime(live.expiresAt)} y solo vale una vez.
                Vinculará el altavoz con {householdName}.
              </p>
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
          {live ? "Generar otro código" : "Vincular un altavoz"}
        </Button>
      </CardContent>

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
    </Card>
  );
}
