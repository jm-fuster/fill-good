"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@clerk/nextjs";

import { useSupabaseBrowser } from "@/lib/supabase/client";

/**
 * Refresca /perfil en el instante en que un Echo canjea el código. Quien vincula
 * está mirando la pantalla con el código puesto y hablándole al altavoz desde
 * otra habitación: sin esto no sabe si ha funcionado hasta que recarga a mano, y
 * es justo el momento en el que se abandona la configuración.
 *
 * Solo se escucha el INSERT (el momento «vinculado»). Las revocaciones salen de
 * la propia app, que ya revalida /perfil por su cuenta.
 *
 * Mismo patrón que `useRealtimeList`: los tokens de Clerk caducan ~60 s, así que
 * hay que refrescar el auth de Realtime mientras la suscripción siga viva.
 */
export function useRealtimeAlexaLinks(householdId: string) {
  const supabase = useSupabaseBrowser();
  const { session } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!householdId || !session) return;
    let cancelled = false;

    const channel = supabase.channel(`alexa-links-${householdId}`);

    const start = async () => {
      const token = await session.getToken();
      if (cancelled || !token) return;
      supabase.realtime.setAuth(token);
      channel
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "alexa_links",
            // La RLS ya limita a tus hogares, pero con varios hogares llegarían
            // los de todos: el filtro deja pasar solo el que se está mirando.
            filter: `household_id=eq.${householdId}`,
          },
          () => router.refresh(),
        )
        .subscribe();
    };

    start();

    const interval = setInterval(async () => {
      const token = await session.getToken();
      if (token) supabase.realtime.setAuth(token);
    }, 50_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [householdId, session, supabase, router]);
}
