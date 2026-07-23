"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@clerk/nextjs";

import { useSupabaseBrowser } from "@/lib/supabase/client";

/**
 * Suscribe a los cambios de la lista y refresca la vista cuando otro miembro
 * del hogar modifica algo. Los tokens de Clerk caducan ~60s, así que se
 * refresca el auth de Realtime periódicamente mientras la suscripción vive.
 */
export function useRealtimeList(listId: string, channelKey = "view") {
  const supabase = useSupabaseBrowser();
  const { session } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!listId || !session) return;
    let cancelled = false;

    // `channelKey` distingue suscripciones que conviven a la vez para la misma
    // lista (p. ej. el badge de la navbar y la propia vista de /lista) para que
    // Supabase no las trate como el mismo canal.
    const channel = supabase.channel(`shopping-list-${channelKey}-${listId}`);

    const start = async () => {
      const token = await session.getToken();
      if (cancelled || !token) return;
      supabase.realtime.setAuth(token);
      channel
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "shopping_list_items",
            filter: `list_id=eq.${listId}`,
          },
          () => router.refresh(),
        )
        .subscribe();
    };

    start();

    // Refresca el token de Realtime antes de que caduque (~60s).
    const interval = setInterval(async () => {
      const token = await session.getToken();
      if (token) supabase.realtime.setAuth(token);
    }, 50_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [listId, channelKey, session, supabase, router]);
}
