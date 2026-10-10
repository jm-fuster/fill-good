import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SerwistProvider } from "@serwist/next/react";

import { clerkAppearance, clerkLocalization } from "@/components/clerk-config";
import { PageCacheOnVisit } from "@/components/page-cache-on-visit";
import { ThemeProvider } from "@/components/theme-provider";
import { SessionEndCleanup } from "@/features/account/components/session-end-cleanup";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Sin precarga: la monoespaciada solo sale en un puñado de sitios (código de
// invitación, tabla de precios de un producto, tooltip de las gráficas) y
// precargarla metía ~23 KB de fuente en la primera carga de TODAS las páginas,
// compitiendo con el CSS y el JS. Se descarga cuando algo la usa; el fallback
// con métricas ajustadas que genera next/font evita el salto de maquetación.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  title: {
    default: "Fill Good — Compra lo justo, ahorra más",
    template: "%s · Fill Good",
  },
  description:
    "Controla tu despensa, compra solo lo que falta y ahorra: inventario, lista de la compra, escaneo de tickets, precios y menús semanales.",
  applicationName: "Fill Good",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Fill Good",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7faf8" },
    { media: "(prefers-color-scheme: dark)", color: "#151e19" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ClerkProvider
          localization={clerkLocalization}
          appearance={clerkAppearance}
        >
          {/*
            Los dos valores por defecto de Serwist, apagados a propósito:
             - `reloadOnOnline` recargaba la página entera al volver la red, y
               con ella se iba lo que estuviera a medias —una revisión de ticket
               de treinta líneas, una receta sin guardar—. Justo lo que pasa en
               el garaje del súper o al saltar de wifi a 4G. `/offline` ya se
               recarga sola cuando vuelve la red (`offline-retry.tsx`).
             - `cacheOnNavigation` pedía un SSR completo de la página en cada
               `replaceState` del router; lo sustituye `PageCacheOnVisit`.
          */}
          <SerwistProvider
            swUrl="/sw.js"
            disable={process.env.NODE_ENV === "development"}
            reloadOnOnline={false}
            cacheOnNavigation={false}
          >
            <PageCacheOnVisit />
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
            >
              {children}
              <Toaster position="top-center" />
              {/* Purga el dispositivo al terminar la sesión por CUALQUIER vía
                  (también el menú de Clerk o una sesión revocada). */}
              <SessionEndCleanup />
            </ThemeProvider>
          </SerwistProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
