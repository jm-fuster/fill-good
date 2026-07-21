"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  Package,
  ScanLine,
  Settings,
  ShoppingCart,
} from "lucide-react";

import { cn } from "@/lib/utils";

const tabs = [
  { href: "/inventario", label: "Inventario", icon: Package },
  { href: "/lista", label: "Lista", icon: ShoppingCart },
  { href: "/escanear", label: "Escanear", icon: ScanLine, primary: true },
  // El recetario vive bajo Menús: la pestaña se mantiene activa en /recetas*.
  {
    href: "/menus",
    label: "Menús",
    icon: CalendarDays,
    matchPrefixes: ["/recetas"],
  },
  { href: "/ajustes", label: "Ajustes", icon: Settings },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 backdrop-blur-sm pb-safe"
    >
      <ul className="mx-auto grid h-16 max-w-lg grid-cols-5">
        {tabs.map((tab) => {
          const isActive =
            pathname === tab.href ||
            pathname.startsWith(`${tab.href}/`) ||
            ("matchPrefixes" in tab &&
              tab.matchPrefixes.some(
                (prefix) =>
                  pathname === prefix || pathname.startsWith(`${prefix}/`),
              ));
          const Icon = tab.icon;

          if ("primary" in tab && tab.primary) {
            return (
              <li key={tab.href} className="relative flex justify-center">
                <Link
                  href={tab.href}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={tab.label}
                  className="absolute -top-5 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-95"
                >
                  <Icon className="size-6" aria-hidden />
                </Link>
                <span
                  aria-hidden
                  className="self-end pb-1.5 text-[11px] font-medium text-muted-foreground"
                >
                  {tab.label}
                </span>
              </li>
            );
          }

          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex h-full min-h-12 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
