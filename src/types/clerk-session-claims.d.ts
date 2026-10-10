// Claims propios del token de sesión de Clerk (Dashboard → Sessions →
// Customize session token). Todos opcionales: un token emitido antes de
// configurarlos no los lleva. Ver `getSessionUserClaims` en lib/current-user.ts.
export {};

declare global {
  interface CustomJwtSessionClaims {
    first_name?: string | null;
    last_name?: string | null;
    has_image?: boolean | null;
    image_url?: string | null;
    ai_consent_version?: number | null;
  }
}
