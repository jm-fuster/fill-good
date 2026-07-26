/**
 * Vibración háptica corta (~10 ms) para confirmar una acción táctil (marcar un
 * ítem, p. ej.). Feature-detect: iOS Safari no implementa `navigator.vibrate`
 * y sale sin romper nada. Respeta `prefers-reduced-motion`.
 */
export function vibrateTick() {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.vibrate !== "function"
  ) {
    return;
  }
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  navigator.vibrate(10);
}
