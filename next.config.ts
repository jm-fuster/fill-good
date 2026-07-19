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
  },
};

export default nextConfig;
