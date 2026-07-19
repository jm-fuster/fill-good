import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Food — Tu hogar organizado",
    short_name: "Food",
    description:
      "Inventario, lista de la compra, escaneo de tickets y menús semanales para tu hogar.",
    lang: "es",
    start_url: "/",
    display: "standalone",
    background_color: "#f7faf8",
    theme_color: "#127a4e",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
