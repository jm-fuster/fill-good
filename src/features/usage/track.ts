import type { ClientUsageEvent } from "@/lib/usage";

import { recordUsageAction } from "./actions";

/**
 * Avisa al servidor de un paso que solo ve el navegador. Sin `await` y sin
 * `safeAction` a propósito: no hay nada que enseñar si falla —ni un toast ni un
 * estado que revertir—, porque para quien ha pulsado medir no existe.
 */
export function trackFromClient(event: ClientUsageEvent): void {
  void recordUsageAction(event).catch(() => {});
}
