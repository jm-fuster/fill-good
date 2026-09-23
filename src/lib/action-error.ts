import { unstable_isUnrecognizedActionError } from "next/navigation";
import { toast } from "sonner";

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
/**
 * Ejecuta una Server Action y convierte un RECHAZO en el mismo `{ error }` que
 * la propia acción habría devuelto.
 *
 * Existe por lo que pasa cuando no está: casi todas las pantallas llaman a sus
 * acciones dentro de un `startTransition`, y ahí una promesa rechazada no es un
 * fallo local, sube hasta la barrera de error de la ruta y **sustituye la
 * pantalla entera** por «No se pudo cargar». O sea que quedarse sin cobertura al
 * pulsar «+» en el inventario no te dejaba sin sumar una unidad: te dejaba sin
 * inventario, con el número optimista ya subido y sin revertir.
 *
 * Con esto, el rechazo llega por donde el código ya mira los fallos previstos
 * (`if (result.error)`), así que cada pantalla sigue decidiendo qué hacer —cerrar
 * el modal o no, revertir lo optimista, avisar— en vez de perderlo todo. El
 * `what` es la frase que verá el usuario; el `digest` y la traza los añade
 * `actionErrorMessage`.
 *
 * No captura `redirect()` ni `notFound()` de Next: los propaga tal cual, porque
 * son control de flujo y no errores (tragarlos convertiría un redirect en un
 * toast de fallo sobre una acción que sí funcionó).
 */
export async function safeAction<T extends { error?: string }>(
  work: Promise<T>,
  what: string,
): Promise<T> {
  try {
    return await work;
  } catch (err) {
    if (isNextControlFlow(err)) throw err;
    /*
      El cast dice «un objeto que solo trae `error` es un resultado válido de
      esta acción», y lo es porque en este repo el resto de campos que devuelve
      una acción son SIEMPRE opcionales (`ok?`, `deducted?`, `deleted?`…): son
      lo que se rellena cuando salió bien. Devolver la unión en su lugar sería
      más estricto sobre el papel y peor en la práctica — obligaría a estrechar
      el tipo en cada uno de los sitios que ya comprueban `if (r.error) return`,
      que es justo el código que este helper existe para no tener que tocar.
    */
    return { error: actionErrorMessage(what, err) } as T;
  }
}

/**
 * `redirect()` y `notFound()` señalizan lanzando un error con un `digest`
 * reconocible; no son fallos y no deben acabar en un toast.
 */
function isNextControlFlow(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND")
  );
}

/** Id fijo del aviso de versión nueva: varias acciones fallidas, un solo aviso. */
const NEW_VERSION_TOAST = "version-nueva";

/**
 * Esta pestaña es de un despliegue anterior y el servidor ya no reconoce sus
 * acciones: se ofrece recargar, y se ofrece, no se hace.
 *
 * Los ids de las Server Actions cambian en cada build, y una PWA abierta desde
 * por la mañana sigue con el JavaScript viejo después de un push a `main` (el
 * service worker nuevo se activa sin recargar: `skipWaiting` + `clientsClaim`).
 * Desde ese momento TODAS las acciones de la pantalla fallan igual, y la app
 * decía «No hubo respuesta del servidor. Vuelve a intentarlo», que era falso y
 * no servía: reintentar da el mismo fallo. En el modo compra, cada marca se
 * revertía con ese aviso hasta que alguien mataba la app.
 *
 * No se recarga sola a propósito: la pantalla que falla puede tener trabajo a
 * medias —pulsar «Confirmar» en una revisión de ticket de treinta líneas justo
 * después de un despliegue—. Recargar es la única salida, pero es quien la usa
 * quien decide cuándo, y el aviso dice por qué. Con un id fijo, diez acciones
 * fallidas dejan un solo aviso, y si se cierra vuelve con el siguiente fallo.
 */
function offerReloadForNewVersion(): void {
  toast("Hay una versión nueva de Fill Good", {
    id: NEW_VERSION_TOAST,
    description:
      "Esta pantalla es de la anterior y ya no puede guardar cambios. Recarga para seguir.",
    duration: Infinity,
    action: { label: "Recargar", onClick: () => window.location.reload() },
  });
}

export function actionErrorMessage(what: string, err?: unknown): string {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return `${what} Parece que te has quedado sin conexión.`;
  }

  if (unstable_isUnrecognizedActionError(err)) {
    offerReloadForNewVersion();
    return `${what} Hay una versión nueva de la app: recarga la página.`;
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
