import type { NextConfig } from "next";

// ── Cabeceras de seguridad (auditoría 2026-07) ──────────────────────────────
// Origen de Supabase (REST https + Realtime wss) derivado del env para acotar
// connect-src sin hardcodear el proyecto. Si falta el env, no se añade nada.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : "";
const supabaseWss = supabaseOrigin.replace(/^https:/, "wss:");

// Origen del Frontend API de Clerk. Va DERIVADO de la publishable key (que lo
// lleva codificado en base64: `pk_live_<base64("clerk.tudominio.com$")>`) y no
// hardcodeado. Estaba puesto a mano y apuntaba al dominio de OTRO proyecto
// (clerk.pickpal.…), de modo que el día que la CSP pasara a enforcing habría
// bloqueado todas las llamadas a Clerk, incluido el cierre de sesión. Derivarlo
// hace que test y producción salgan correctos sin tocar nada.
const clerkFapiOrigin = (() => {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!pk) return "";
  try {
    const host = Buffer.from(pk.replace(/^pk_(test|live)_/, ""), "base64")
      .toString("utf8")
      .replace(/\$$/, "");
    return /^[a-z0-9.-]+$/i.test(host) ? `https://${host}` : "";
  } catch {
    return "";
  }
})();

// CSP en modo Report-Only a propósito: una CSP mal calibrada rompe el login de
// Clerk o el Realtime de Supabase, y aquí no se puede verificar el flujo de auth.
// Despliega, revisa la consola del navegador (violaciones report-only) y, cuando
// esté limpia en TU entorno (ajustando el dominio de Clerk en producción — usa el
// FAPI propio, p. ej. https://clerk.tudominio.com — en vez de *.clerk.accounts.dev),
// PROMOCIÓNALA a enforcing cambiando la clave a "Content-Security-Policy".
// 'unsafe-inline'/'unsafe-eval' son necesarios hoy (next-themes, Clerk, React dev);
// para endurecer del todo habría que migrar a nonces (proxy.ts + render dinámico).
const csp = [
  `default-src 'self'`,
  `base-uri 'self'`,
  `object-src 'none'`,
  `frame-ancestors 'none'`,
  `form-action 'self'`,
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${clerkFapiOrigin} https://*.clerk.accounts.dev https://challenges.cloudflare.com`.trim(),
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' blob: data: https://img.clerk.com`,
  `font-src 'self'`,
  `worker-src 'self' blob:`,
  `connect-src 'self' ${clerkFapiOrigin} https://*.clerk.accounts.dev https://clerk-telemetry.com ${supabaseOrigin} ${supabaseWss}`.trim(),
  `frame-src 'self' https://challenges.cloudflare.com`,
  `upgrade-insecure-requests`,
]
  .join("; ")
  .replace(/\s{2,}/g, " ");

const securityHeaders = [
  // HSTS: solo HTTPS durante 2 años, incluidos subdominios (apto para preload).
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // No adivinar el Content-Type (evita que un fichero se interprete como script).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Anti-clickjacking (refuerza frame-ancestors, con soporte en navegadores viejos).
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // No filtrar la ruta completa al navegar a otro origen.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Desactivar APIs del navegador que la app no usa.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  // Report-Only: NO bloquea; solo reporta. Ver comentario arriba para enforcing.
  { key: "Content-Security-Policy-Report-Only", value: csp },
];

// El service worker (Serwist) se construye en un paso aparte compatible con
// Turbopack: ver serwist.config.js y el script "build" de package.json.
const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  experimental: {
    // Tickets: imágenes comprimidas + PDFs pueden pasar de 1 MB (límite por
    // defecto de los Server Actions).
    serverActions: {
      bodySizeLimit: "10mb",
    },
    // Router Cache (cliente): mantiene el segmento de página cacheado 30 s. En
    // Next 16 el default de `dynamic` es 0 (nada de caché), así que cada toque en
    // la bottom nav re-renderiza la página en el servidor. Con 30 s, volver a una
    // pestaña visitada hace < 30 s es instantáneo (sirve el payload del cliente).
    // Las mutaciones propias siguen refrescando vía revalidatePath en las Server
    // Actions, y /lista tiene Realtime. Trade-off asumido: un cambio hecho por
    // OTRO miembro del hogar puede tardar hasta 30 s en verse al alternar pestañas.
    staleTimes: { dynamic: 30 },
  },
};

export default nextConfig;
