import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fill Good — Compra lo justo, ahorra más",
    short_name: "Fill Good",
    description:
      "Controla tu despensa, compra solo lo que falta y ahorra: inventario, lista de la compra, escaneo de tickets, precios y menús semanales.",
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
    shortcuts: [
      {
        name: "Añadir a la lista",
        short_name: "Lista",
        description: "Abre tu lista de la compra",
        url: "/lista",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Escanear ticket",
        short_name: "Escanear",
        description: "Escanea un ticket de la compra",
        url: "/escanear",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
    // Compartir una foto/PDF de un ticket desde la galería directa al escaneo
    // (M10b). El tipo MetadataRoute.Manifest de Next aún no incluye share_target,
    // de ahí el cast; la forma sigue la spec del Web Share Target.
    ...({
      share_target: {
        action: "/escanear/compartir",
        method: "POST",
        enctype: "multipart/form-data",
        params: {
          files: [
            {
              name: "file",
              accept: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
            },
          ],
        },
      },
    } as object),
  };
}
