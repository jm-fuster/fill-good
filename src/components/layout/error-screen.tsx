"use client";

import { useEffect } from "react";
import { RotateCw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

// Ventana durante la cual NO se vuelve a auto-reintentar tras un intento, para
// evitar bucles de recarga si el fallo es persistente (Supabase caído, etc.).
const RETRY_KEY = "fillgood:error-auto-retry";
const RETRY_WINDOW_MS = 10_000;

/**
 * Pantalla de error compartida por las barreras de error de la app.
 *
 * Muchos fallos aquí son transitorios: arranque en frío del servidor o del
 * proyecto Supabase, y sobre todo el handshake de sesión de Clerk al abrir el
 * PWA en frío. Para no mostrar la pantalla de error del navegador ni obligar a
 * recargar a mano, intenta recuperarse sola UNA vez llamando a `retry()`. Si
 * vuelve a fallar dentro de una ventana corta, deja de reintentar y ofrece el
 * botón manual.
 *
 * `retry` y no `reset`, y la diferencia es todo el sentido de esta pantalla. En
 * Next 16, `reset()` solo limpia el estado de la barrera y repinta lo que ya
 * había —el mismo payload con el error dentro—; el que vuelve a PEDIR la página
 * al servidor es `retry()` (`router.refresh()` + `reset`, ver la doc de
 * `error.js`). Con `reset`, tanto el reintento automático como el botón
 * repintaban el fallo: justo en los fallos transitorios de servidor para los
 * que existe esto, y en la barrera raíz, que no tiene navegación, el usuario se
 * quedaba atrapado hasta matar la PWA.
 */
export function ErrorScreen({
  retry,
  error,
  fullScreen = false,
}: {
  retry: () => void;
  error?: Error & { digest?: string };
  fullScreen?: boolean;
}) {
  useEffect(() => {
    if (error) {
      // Rastro en la consola del cliente; el `digest` enlaza con el log del
      // servidor (Vercel) para depurar el fallo real.
      console.error("[Fill Good] error de render:", error.digest ?? "", error);
    }

    let lastRetry = 0;
    try {
      lastRetry = Number(sessionStorage.getItem(RETRY_KEY) ?? 0);
    } catch {
      // sessionStorage puede no estar disponible (modo privado); seguimos.
    }
    const now = Date.now();
    if (now - lastRetry > RETRY_WINDOW_MS) {
      try {
        sessionStorage.setItem(RETRY_KEY, String(now));
      } catch {
        // ignore
      }
      retry();
    }
    // Solo al montar: un único auto-reintento por cada aparición del error.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={
        fullScreen
          ? "flex min-h-dvh flex-col items-center justify-center gap-4 px-6 py-10 text-center"
          : "flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed px-6 py-16 text-center"
      }
    >
      <div className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <TriangleAlert className="size-7" aria-hidden />
      </div>
      <div>
        <h1 className="font-heading text-xl font-semibold tracking-tight">
          No se pudo cargar
        </h1>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground text-pretty">
          Ha habido un problema al cargar esta página. Suele ser temporal:
          vuelve a intentarlo.
        </p>
      </div>
      <Button onClick={retry}>
        <RotateCw aria-hidden />
        Reintentar
      </Button>
    </div>
  );
}
