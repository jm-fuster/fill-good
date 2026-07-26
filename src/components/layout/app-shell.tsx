import { cookies } from "next/headers";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { CommandPalette } from "@/components/layout/command-palette";
import { NavListCountProvider } from "@/components/layout/nav-list-count";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HouseholdSwitcherMenu } from "@/features/household/components/household-switcher";
import {
  getCurrentHousehold,
  getUserHouseholds,
} from "@/features/household/queries";
import { getActiveListBadge } from "@/features/shopping-list/queries";

/**
 * Shell adaptativo (E11). Un único árbol de componentes:
 *  - Móvil (< md): bottom nav fija + FAB + bottom sheets, como siempre.
 *  - Escritorio (≥ md): sidebar lateral colapsable (Ctrl/Cmd+B) con su estado
 *    persistido en cookie; sin bottom nav.
 * Bottom nav y sidebar coexisten y se muestran/ocultan SOLO con CSS
 * (`md:hidden` / `hidden md:block`), así nunca hay dos navegaciones activas ni
 * flash de hidratación.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  // Estado inicial del sidebar leído de la cookie que escribe SidebarProvider.
  // Hogares del usuario para el selector del header (deduplicado por cache()
  // con la llamada del layout: no añade consultas).
  const [cookieStore, households, household] = await Promise.all([
    cookies(),
    getUserHouseholds(),
    getCurrentHousehold(),
  ]);
  // Badge de la navbar SIN await: la promesa cruza al cliente y cada badge la
  // resuelve con use() dentro de Suspense, así el shell pinta sin esperar esta
  // query (un salto menos a Supabase en el primer paint). Si falla, se degrada
  // a "sin badge" en vez de tumbar la página.
  const badge = getActiveListBadge().catch(() => ({
    listId: null,
    pendingCount: 0,
  }));
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen={defaultOpen}>
        <NavListCountProvider badge={badge}>
          {/* Primer elemento focusable: salta la navegación e ir al contenido. */}
          <a
            href="#contenido"
            className="sr-only left-4 top-4 z-50 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg focus:not-sr-only focus:absolute"
          >
            Saltar al contenido
          </a>
          <AppSidebar />
          <SidebarInset className="min-w-0">
            {/* Header sticky solo en escritorio, deliberadamente ligero:
              búsqueda a la izquierda y hogar activo (si hay varios) en el
              extremo derecho. El toggle del sidebar vive en el propio sidebar,
              y tema y cuenta en Ajustes (como en móvil). */}
            <header className="sticky top-0 z-30 hidden h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur-sm md:flex print:hidden">
              <CommandPalette />
              {household ? (
                <div className="ml-auto">
                  <HouseholdSwitcherMenu
                    households={households.map((h) => ({
                      id: h.id,
                      name: h.name,
                      role: h.role,
                    }))}
                    activeId={household.id}
                  />
                </div>
              ) : null}
            </header>
            {/* `SidebarInset` ya es el <main>; este es el objetivo del skip link. */}
            <div
              id="contenido"
              tabIndex={-1}
              className="w-full flex-1 px-4 pt-4 pb-28 outline-none md:px-8 md:pb-8"
            >
              {children}
            </div>
          </SidebarInset>
          <BottomNav />
        </NavListCountProvider>
      </SidebarProvider>
    </TooltipProvider>
  );
}
