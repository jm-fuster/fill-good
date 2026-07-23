import {
  CalendarDays,
  Package,
  ScanLine,
  Settings,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react";

/**
 * Entradas de la navegación principal, compartidas entre la bottom nav (móvil)
 * y el sidebar (escritorio) para que ambas se mantengan sincronizadas.
 * El recetario vive bajo Menús: esa pestaña se mantiene activa en /recetas*.
 */
export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * "Añadir ticket": en móvil se muestra como botón central destacado de la
   * bottom nav. En escritorio es un ítem normal más del sidebar (sin CTA).
   */
  primary?: boolean;
  /** Prefijos extra que también marcan la entrada como activa. */
  matchPrefixes?: readonly string[];
};

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/inventario", label: "Inventario", icon: Package },
  { href: "/lista", label: "Lista", icon: ShoppingCart },
  { href: "/escanear", label: "Añadir ticket", icon: ScanLine, primary: true },
  {
    href: "/menus",
    label: "Menús",
    icon: CalendarDays,
    matchPrefixes: ["/recetas"],
  },
  { href: "/ajustes", label: "Ajustes", icon: Settings },
];

/** ¿La ruta actual corresponde a esta entrada (incluidos sus prefijos)? */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
    return true;
  }
  return (item.matchPrefixes ?? []).some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
