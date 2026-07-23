"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { isNavItemActive, NAV_ITEMS } from "@/components/layout/nav-items";

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 backdrop-blur-sm pb-safe md:hidden"
    >
      <ul className="mx-auto grid h-16 max-w-lg grid-cols-5">
        {NAV_ITEMS.map((tab) => {
          const isActive = isNavItemActive(tab, pathname);
          const Icon = tab.icon;

          if (tab.primary) {
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
                  className="max-w-full self-end px-0.5 pb-1.5 text-center text-[11px] leading-tight font-medium text-muted-foreground"
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
