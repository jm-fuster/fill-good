import { cookies } from "next/headers";
import { UserButton } from "@clerk/nextjs";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { CommandPalette } from "@/components/layout/command-palette";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

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
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen={defaultOpen}>
        {/* Primer elemento focusable: salta la navegación e ir al contenido. */}
        <a
          href="#contenido"
          className="sr-only left-4 top-4 z-50 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg focus:not-sr-only focus:absolute"
        >
          Saltar al contenido
        </a>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          {/* Header sticky solo en escritorio: toggle del sidebar a la izquierda
              y acciones de cuenta a la derecha (tema + cuenta), que en móvil
              viven en Ajustes. */}
          <header className="sticky top-0 z-30 hidden h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur-sm md:flex print:hidden">
            <SidebarTrigger aria-label="Mostrar u ocultar el menú lateral" />
            <CommandPalette />
            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle />
              <UserButton />
            </div>
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
      </SidebarProvider>
    </TooltipProvider>
  );
}
