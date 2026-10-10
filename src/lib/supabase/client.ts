"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "@clerk/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types";
import { fetchWithJwtRetry } from "./jwt-retry";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;

type SupabaseModule = typeof import("@supabase/supabase-js");

/*
 * supabase-js se carga APARTE, con `import()`, y no en el JS de la página.
 *
 * En el navegador solo se usa para Realtime, pero el paquete entero (auth,
 * storage, postgrest, functions…) pesaba ~61 KB comprimidos, y como la
 * suscripción del badge de la lista vive en el shell, entraba en el JS de
 * entrada de TODAS las pantallas de la app, delante de su hidratación. Aplazarlo
 * no retrasa el tiempo real: la suscripción espera de todos modos a la sesión
 * de Clerk, que llega con su propio script bastante después de que este trozo
 * (precacheado por el service worker) esté listo. Y lo que pase antes de
 * suscribirse lo recupera la relectura de `subscribed` en `useRealtimeList`.
 */
let loaded: SupabaseModule | null = null;
let loading: Promise<SupabaseModule> | null = null;

function loadSupabase(): Promise<SupabaseModule> {
  loading ??= import("@supabase/supabase-js").then(
    (mod) => (loaded = mod),
    (error: unknown) => {
      // Sin red y sin el trozo en caché: que el siguiente montaje lo reintente.
      loading = null;
      throw error;
    },
  );
  return loading;
}

/**
 * Cliente Supabase para el navegador (solo lo necesitamos para Realtime).
 * Usa el token de sesión de Clerk vía `accessToken` para que la RLS aplique
 * también a la suscripción en tiempo real.
 *
 * `null` mientras supabase-js se descarga (ver arriba): quien lo use espera a
 * tenerlo igual que ya esperaba a la sesión.
 */
export function useSupabaseBrowser(): SupabaseClient<Database> | null {
  const { session } = useSession();
  const [mod, setMod] = useState<SupabaseModule | null>(loaded);

  useEffect(() => {
    if (mod) return;
    let cancelled = false;
    loadSupabase().then(
      (m) => {
        if (!cancelled) setMod(m);
      },
      () => {
        // Sin cliente no hay tiempo real, igual que con el socket caído.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [mod]);

  return useMemo(
    () =>
      mod
        ? mod.createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
            accessToken: async () => (await session?.getToken()) ?? null,
            global: { fetch: fetchWithJwtRetry },
          })
        : null,
    [mod, session],
  );
}
