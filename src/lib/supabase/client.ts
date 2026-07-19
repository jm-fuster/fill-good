"use client";

import { useMemo } from "react";
import { useSession } from "@clerk/nextjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;

/**
 * Cliente Supabase para el navegador (solo lo necesitamos para Realtime).
 * Usa el token de sesión de Clerk vía `accessToken` para que la RLS aplique
 * también a la suscripción en tiempo real.
 */
export function useSupabaseBrowser(): SupabaseClient<Database> {
  const { session } = useSession();
  return useMemo(
    () =>
      createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
        accessToken: async () => (await session?.getToken()) ?? null,
      }),
    [session],
  );
}
