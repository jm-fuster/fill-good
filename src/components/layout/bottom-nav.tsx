"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";
import { isNavItemActive, NAV_ITEMS } from "@/components/layout/nav-items";
import { NavCountBadge } from "@/components/layout/nav-count-badge";
import { NavLinkIcon } from "@/components/layout/nav-link-icon";
import { useNavListCount } from "@/components/layout/nav-list-count";
import { useOptimisticNav } from "@/components/layout/use-optimistic-nav";

export function BottomNav() {
  const { pathname, navPath, markPressed } = useOptimisticNav();
  const listCount = useNavListCount();

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 backdrop-blur-sm pb-safe md:hidden"
    >
      <ul className="mx-auto grid h-16 max-w-lg grid-cols-5">
        {NAV_ITEMS.map((tab) => {
          // `aria-current` sigue a la ruta real; el resaltado, a la optimista.
          const isCurrent = isNavItemActive(tab, pathname);
          const isHighlighted = isNavItemActive(tab, navPath);

          if (tab.primary) {
            return (
              <li key={tab.href} className="relative flex justify-center">
                <Link
                  href={tab.href}
                  onClick={() => markPressed(tab.href)}
                  aria-current={isCurrent ? "page" : undefined}
                  aria-label={tab.label}
                  className="absolute -top-5 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-95"
                >
                  <NavLinkIcon icon={tab.icon} className="size-6" />
                </Link>
                <span
                  aria-hidden
                  className="max-w-full self-end px-0.5 pb-1.5 text-center text-[11px] leading-tight font-medium text-muted-foreground"
                >
                  {tab.label}
                </span>
              </li>
            );
          }

          const badge = tab.href === "/lista" ? listCount : 0;

          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                onClick={() => markPressed(tab.href)}
                aria-current={isCurrent ? "page" : undefined}
                className={cn(
                  "group flex h-full min-h-12 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                  isHighlighted
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground active:text-foreground",
                )}
              >
                <span className="relative transition-transform duration-100 group-active:scale-90">
                  <NavLinkIcon icon={tab.icon} className="size-5" />
                  <NavCountBadge count={badge} variant="floating" />
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
