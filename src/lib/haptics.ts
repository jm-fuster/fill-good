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

/**
 * Vibración de AVISO: tres pulsos largos, para un temporizador de cocina que
 * termina. No es el `tick` de confirmar un toque, y por eso no comparte su
 * duración: el tick contesta a un dedo que ya está en la pantalla, y esto tiene
 * que llamar la atención de alguien que está de espaldas.
 *
 * Y por lo mismo **no respeta `prefers-reduced-motion`**, a diferencia de
 * `vibrateTick`: esa preferencia habla de animaciones que marean, no de
 * renunciar a la única señal que puede dar un móvil bocabajo en la encimera. Si
 * lo que se quiere es silencio, el temporizador tiene su propio silenciador.
 */
export function vibrateAlarm() {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.vibrate !== "function"
  ) {
    return;
  }
  navigator.vibrate([200, 120, 200, 120, 200]);
}
