import "server-only";

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "./types";

// Clave pública (segura en cliente). Supabase renombró la anon key a
// "publishable key"; aceptamos ambos nombres según lo que copie el usuario.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Cliente Supabase para el servidor (Server Components y Server Actions).
 *
 * Usa la integración nativa Clerk ↔ Supabase: el token de sesión de Clerk se
 * pasa en cada petición vía `accessToken`, e incluye el claim `role:
 * authenticated` que activa las políticas RLS. No hace falta JWT template.
 *
 * Se crea uno por petición (el token es efímero). No usar la service role key.
 */
export function createServerSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error(
      "Faltan variables de entorno de Supabase: define NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (o _ANON_KEY) en .env.local.",
    );
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    async accessToken() {
      return (await auth()).getToken();
    },
  });
}

/** true si las variables de Supabase están configuradas. */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);
