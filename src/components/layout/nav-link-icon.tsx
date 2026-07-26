"use client";

import { useLinkStatus } from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Icono de una entrada de navegación con indicador de navegación en curso: si
 * la ruta tarda en responder (sin prefetch, arranque en frío…), el icono pulsa
 * suavemente. El delay de la animación (en `--animate-nav-pending`) hace que
 * en navegaciones rápidas no se vea nada. Debe renderizarse DENTRO de un
 * `<Link>` — requisito de `useLinkStatus`.
 */
export function NavLinkIcon({
  icon: Icon,
  className,
}: {
  icon: LucideIcon;
  className?: string;
}) {
  const { pending } = useLinkStatus();

  return (
    <Icon
      aria-hidden
      data-pending={pending || undefined}
      className={cn("data-[pending]:animate-nav-pending", className)}
    />
  );
}
