/**
 * `fetch` que reintenta los rechazos transitorios de JWT de PostgREST.
 *
 * PostgREST devuelve `PGRST303` ("JWT not yet valid") cuando el claim `nbf`
 * ("not before") del token va por delante de su reloj. Con la integración
 * Clerk ↔ Supabase el token lo emite Clerk y lo valida Supabase: un desfase de
 * reloj sub-segundo entre ambos hace que `nbf` parezca futuro en las primeras
 * peticiones (arranque en frío) y se "cura" al recargar, cuando el reloj del
 * servidor ya ha pasado ese instante.
 *
 * El token se rechaza en la capa de auth ANTES de tocar datos, así que
 * reintentar tras una breve espera es seguro incluso para escrituras (no hay
 * INSERT/UPDATE a medias). Solo reintentamos ante PGRST303 para no enmascarar
 * otros errores (firma inválida, emisor no confiado, etc.).
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Backoff acumulado ~3,7 s: cubre desfases de reloj mayores en arranque en
// frío antes de rendirse. Solo se dispara ante PGRST303, nunca en el camino
// normal, así que no penaliza las peticiones que van bien.
const RETRY_DELAYS_MS = [200, 500, 1000, 2000];

export async function fetchWithJwtRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(input, init);
    if (res.ok || attempt >= RETRY_DELAYS_MS.length) return res;

    let body = "";
    try {
      body = await res.clone().text();
    } catch {
      return res;
    }

    const notYetValid =
      body.includes("PGRST303") || /jwt not yet valid/i.test(body);
    if (!notYetValid) return res;

    await sleep(RETRY_DELAYS_MS[attempt]);
  }
}
