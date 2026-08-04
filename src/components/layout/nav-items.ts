import {
  CalendarDays,
  CircleUser,
  Package,
  ScanLine,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react";

/**
 * Entradas de la navegación principal, compartidas entre la bottom nav (móvil)
 * y el sidebar (escritorio) para que ambas se mantengan sincronizadas.
 * El recetario vive bajo Menús: esa pestaña se mantiene activa en /recetas*.
 * Ajustes, el resumen del mes y el análisis de precios cuelgan de Perfil, y
 * mantienen su pestaña activa.
 *
 * Una ruta de la app que no case con NINGUNA entrada deja la barra entera
 * apagada, y entonces no hay nada en pantalla que diga dónde estás: cada
 * destino que no sea nav de primer nivel tiene que aparecer en los
 * `matchPrefixes` de su área.
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
  {
    href: "/perfil",
    label: "Perfil",
    icon: CircleUser,
    matchPrefixes: ["/ajustes", "/resumen", "/precios"],
  },
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
