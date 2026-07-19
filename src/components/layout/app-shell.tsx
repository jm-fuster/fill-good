import { BottomNav } from "@/components/layout/bottom-nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* pb-28 reserva el alto de la bottom nav + botón central flotante */}
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-28">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
