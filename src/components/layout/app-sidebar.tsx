"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { isNavItemActive, NAV_ITEMS } from "@/components/layout/nav-items";

/**
 * Navegación lateral de escritorio (≥ md). Reutiliza las mismas entradas que la
 * bottom nav (`NAV_ITEMS`) y su lógica de activo. Convive en el árbol con la
 * bottom nav; shadcn oculta este contenedor con `hidden md:block`, así que en
 * móvil no está en el árbol de accesibilidad. Colapsable a modo icono
 * (Ctrl/Cmd+B) con el estado persistido en cookie por `SidebarProvider`.
 */
export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link
          href="/inventario"
          className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-sidebar-accent"
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
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            {/* Misma etiqueta que la bottom nav; solo una está visible a la vez. */}
            <nav aria-label="Navegación principal">
              <SidebarMenu>
                {NAV_ITEMS.map((item) => {
                  const isActive = isNavItemActive(item, pathname);
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.href}>
                      {/*
                        En escritorio todos los ítems se ven igual: "Añadir
                        ticket" no recibe tratamiento CTA (ese énfasis es solo el
                        botón central de la bottom nav en móvil).
                      */}
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.label}
                      >
                        <Link
                          href={item.href}
                          aria-current={isActive ? "page" : undefined}
                        >
                          <Icon aria-hidden />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
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
