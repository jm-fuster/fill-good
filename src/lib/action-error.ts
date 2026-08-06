/**
 * El mensaje para un fallo INESPERADO de una Server Action: el `catch`, no el
 * `{ error }` que devuelve la propia acción.
 *
 * Existe porque la app venía diciendo «Comprueba tu conexión» en los diez sitios
 * donde una acción puede lanzar, y eso **casi nunca es verdad**. Al `catch` solo
 * se llega si la petición no se completó o si el servidor reventó; todos los
 * fallos previstos —sin hogar, sin permiso, cuota agotada, la IA no supo— vuelven
 * como un `{ error }` con su propio texto y no pasan por aquí. O sea que el
 * mensaje estaba culpando al usuario de un fallo del servidor, y quien lo lee
 * sabe perfectamente que su wifi va bien: además de no ayudar, gasta la
 * credibilidad de todos los demás avisos de la app.
 *
 * Lo que se puede afirmar y lo que no:
 *
 *  - `navigator.onLine === false` es concluyente en un sentido: **no hay red**,
 *    y ahí sí toca decirlo.
 *  - `true` NO demuestra lo contrario (solo dice que hay una interfaz de red
 *    levantada: un wifi de hotel sin salida da `true`), así que en ese caso el
 *    texto no afirma de quién es la culpa. Dice qué ha pasado —no hubo
 *    respuesta— y deja de señalar a nadie.
 *
 * El `digest` es lo único que enlaza lo que ve el usuario con el log del
 * servidor en Vercel. Va en el mensaje, no solo en la consola, porque quien
 * reporta el fallo es quien lo está leyendo y nadie abre las herramientas de
 * desarrollo para copiarlo.
 */
export function actionErrorMessage(what: string, err?: unknown): string {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return `${what} Parece que te has quedado sin conexión.`;
  }

  // `digest` no está en el tipo `Error`: lo añade Next al error que llega al
  // cliente cuando una Server Action revienta en producción, y es la ÚNICA
  // forma de encontrar esa petición en el log del servidor.
  const posible = err instanceof Error ? (err as Error & { digest?: unknown }) : null;
  const digest = typeof posible?.digest === "string" ? posible.digest : null;

  // Rastro completo en la consola del cliente, igual que hace `ErrorScreen`: el
  // mensaje de pantalla se queda con lo justo y aquí queda el error de verdad.
  if (err !== undefined) console.error("[Fill Good]", what, digest ?? "", err);

  return digest
    ? `${what} No hubo respuesta del servidor (ref. ${digest}).`
    : `${what} No hubo respuesta del servidor. Vuelve a intentarlo.`;
}
