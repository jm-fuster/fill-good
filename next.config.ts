import type { NextConfig } from "next";

// El service worker (Serwist) se construye en un paso aparte compatible con
// Turbopack: ver serwist.config.js y el script "build" de package.json.
const nextConfig: NextConfig = {
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
