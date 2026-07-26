"use client";

import { Suspense } from "react";
import Link from "next/link";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { isNavItemActive, NAV_ITEMS } from "@/components/layout/nav-items";
import { NavLinkIcon } from "@/components/layout/nav-link-icon";
import { useNavListCount } from "@/components/layout/nav-list-count";
import { useOptimisticNav } from "@/components/layout/use-optimistic-nav";

/**
 * Navegación lateral de escritorio (≥ md). Reutiliza las mismas entradas que la
 * bottom nav (`NAV_ITEMS`) y su lógica de activo. Convive en el árbol con la
 * bottom nav; shadcn oculta este contenedor con `hidden md:block`, así que en
 * móvil no está en el árbol de accesibilidad. Colapsable a modo icono
 * (Ctrl/Cmd+B) con el estado persistido en cookie por `SidebarProvider`.
 */
/**
 * Hoja que suspende hasta que llega el count del servidor, aislada en su propio
 * `<Suspense>` para que el sidebar pinte sin esperar al badge.
 */
function ListCountBadge() {
  const listCount = useNavListCount();
  if (listCount <= 0) return null;
  return (
    // La key remonta el badge al cambiar el count: "pop" sutil que avisa del
    // cambio sin mirar la lista.
    <SidebarMenuBadge
      key={listCount}
      className="animate-in zoom-in-50 duration-200"
    >
      {listCount > 99 ? "99+" : listCount}
    </SidebarMenuBadge>
  );
}

export function AppSidebar() {
  const { pathname, navPath, markPressed } = useOptimisticNav();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        {/* El botón de colapsar vive DENTRO del sidebar (a la derecha del logo);
            en modo icono se apila bajo el logo para caber en el carril. El
            atajo Ctrl/Cmd+B sigue funcionando en toda la app. */}
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col">
          <Link
            href="/inventario"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-sidebar-accent group-data-[collapsible=icon]:px-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- marca estática SVG local */}
            <img
              src="/brand/fillgood-logo.svg"
              alt=""
              width={28}
              height={28}
              className="size-7 shrink-0 rounded-md"
              aria-hidden
            />
            <span className="font-heading text-lg font-semibold tracking-tight text-sidebar-foreground group-data-[collapsible=icon]:hidden">
              Fill Good
            </span>
          </Link>
          <SidebarTrigger
            aria-label="Mostrar u ocultar el menú lateral"
            className="shrink-0"
          />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            {/* Misma etiqueta que la bottom nav; solo una está visible a la vez. */}
            <nav aria-label="Navegación principal">
              <SidebarMenu>
                {NAV_ITEMS.map((item) => {
                  // `aria-current` sigue a la ruta real; el resaltado, a la
                  // optimista (activa al instante al hacer clic).
                  const isCurrent = isNavItemActive(item, pathname);
                  const isHighlighted = isNavItemActive(item, navPath);
                  return (
                    <SidebarMenuItem key={item.href}>
                      {/*
                        En escritorio todos los ítems se ven igual: "Añadir
                        ticket" no recibe tratamiento CTA (ese énfasis es solo el
                        botón central de la bottom nav en móvil).
                      */}
                      <SidebarMenuButton
                        asChild
                        isActive={isHighlighted}
                        tooltip={item.label}
                      >
                        <Link
                          href={item.href}
                          onClick={() => markPressed(item.href)}
                          aria-current={isCurrent ? "page" : undefined}
                        >
                          <NavLinkIcon icon={item.icon} />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                      {/* Contador de pendientes; el sidebar lo oculta en modo
                          icono con su propia clase group-data. */}
                      {item.href === "/lista" ? (
                        <Suspense>
                          <ListCountBadge />
                        </Suspense>
                      ) : null}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
