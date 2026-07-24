"use client";

import { useEffect, useState } from "react";
import { Download, Share, SquarePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** Evento no estándar `beforeinstallprompt` (solo Chromium). */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Card de instalación de la PWA (Ajustes). En navegadores Chromium captura
 * `beforeinstallprompt` y ofrece un botón que lanza el prompt nativo. En iOS
 * (sin ese evento) muestra las instrucciones de «Añadir a pantalla de inicio».
 * No renderiza nada si ya está instalada (standalone) o si no hay forma de
 * instalar en este navegador.
 */
export function InstallCard() {
  const [mounted, setMounted] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    let active = true;
    // Detección de entorno (browser-only) en una función async, para no llamar a
    // setState de forma síncrona en el cuerpo del efecto (mismo patrón que PushCard).
    async function detect() {
      if (!active) return;
      setMounted(true);
      setIsStandalone(
        window.matchMedia("(display-mode: standalone)").matches ||
          // iOS Safari expone navigator.standalone en vez de display-mode.
          (window.navigator as { standalone?: boolean }).standalone === true,
      );
      const ua = window.navigator.userAgent;
      setIsIOS(
        /ipad|iphone|ipod/i.test(ua) && !("onbeforeinstallprompt" in window),
      );
    }
    detect();

    function onBeforeInstall(e: Event) {
      // Evita el mini-infobar del navegador; guardamos el evento para el botón.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
      setDeferred(null);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      active = false;
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    // Un solo uso del evento; tras appinstalled la card desaparece.
    setDeferred(null);
  }

  // Antes de montar en cliente no renderizamos (evita desajuste de hidratación).
  if (!mounted || isStandalone || installed) return null;
  // Ni prompt disponible (Chromium) ni iOS: no hay forma de instalar aquí.
  if (!deferred && !isIOS) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="size-4" aria-hidden />
          Instala Fill Good
        </CardTitle>
        <CardDescription>
          Acceso directo, pantalla completa y notificaciones más fiables.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isIOS ? (
          <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            En Safari: toca
            <Share className="inline size-4" aria-hidden />
            <span className="font-medium text-foreground">Compartir</span> y
            luego
            <SquarePlus className="inline size-4" aria-hidden />
            <span className="font-medium text-foreground">
              Añadir a pantalla de inicio
            </span>
            .
          </p>
        ) : (
          <Button onClick={install}>
            <Download aria-hidden />
            Instalar app
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
