"use client";

import { useEffect } from "react";
import { useClerk } from "@clerk/nextjs";

import { clearLocalAppData } from "../clear-local-data";

/**
 * Purga lo que la app deja en el dispositivo en cuanto la sesión TERMINA, por
 * la vía que sea. No pinta nada; vive en el layout raíz.
 *
 * La purga (`clearLocalAppData`) solo estaba atada a los botones de la app
 * —«Cerrar sesión» y «Eliminar cuenta» pasan por `signOutToSignIn`—, y en la
 * misma pantalla de Ajustes el menú del `<UserButton>` de Clerk ofrece su
 * propio «Cerrar sesión», que llama a `clerk.signOut()` y no pasa por ahí. En
 * una tablet compartida eso dejaba la caché offline con las pantallas del
 * anterior, sus claves de `localStorage` y, lo peor, su suscripción push viva:
 * el cron le seguía mandando al siguiente las caducidades del hogar de otro, y
 * cuando el siguiente activaba sus avisos, su upsert chocaba con la fila ajena.
 * Justo lo que `/privacidad` §10 promete que no pasa.
 *
 * Escuchar el EVENTO en vez de envolver cada botón cubre de paso lo que ningún
 * botón podía cubrir: la sesión revocada desde otro dispositivo o caducada.
 *
 * Solo actúa en la transición sesión → sin sesión, no al cargar una página ya
 * sin sesión (la landing de un visitante no tiene nada que purgar). Llega
 * tarde para una cosa: borrar la fila push del servidor necesita la sesión que
 * acaba de morir, así que esa llamada falla. No importa: `clearLocalAppData`
 * suelta igualmente el endpoint en el navegador, y la fila que queda apunta a
 * un destino muerto que se borra sola con el primer 410 del cron. Por los
 * botones de la app la purga sigue yendo ANTES del cierre, con la fila incluida;
 * volver a ejecutarla aquí después no rompe nada (todo es idempotente).
 */
export function SessionEndCleanup() {
  const clerk = useClerk();

  useEffect(() => {
    let hadSession = false;
    return clerk.addListener(({ session }) => {
      if (session) {
        hadSession = true;
        return;
      }
      // `undefined` es «Clerk aún no ha cargado», no un cierre de sesión.
      if (session === null && hadSession) {
        hadSession = false;
        void clearLocalAppData();
      }
    });
  }, [clerk]);

  return null;
}
