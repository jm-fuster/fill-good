import type { Metadata } from "next";
import { WifiOff } from "lucide-react";

import { OfflineRetry } from "./offline-retry";

export const metadata: Metadata = { title: "Sin conexión" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 py-10 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <WifiOff className="size-7" aria-hidden />
      </div>
      <div>
        <h1 className="font-heading text-xl font-semibold tracking-tight">
          Sin conexión
        </h1>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground text-pretty">
          No se pudo cargar esta página porque no tienes conexión a internet.
          Las páginas que ya visitaste siguen disponibles.
        </p>
      </div>
      <OfflineRetry />
    </main>
  );
}
