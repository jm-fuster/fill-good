import { auth } from "@clerk/nextjs/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AiErrorKind } from "@/lib/ai/errors";
import { createAdminClient } from "@/lib/supabase/admin";

import type { Database } from "@/lib/supabase/types";

export type AiRateKind = "receipt" | "menu" | "recipe";

/**
 * Mensaje por tipo de uso. Va en un mapa y no en un ternario porque un tipo
 * nuevo sin su texto es un error de compilación, mientras que el ternario le
 * daba callado el mensaje del otro («has generado menús…» al pedir una receta).
 */
const RATE_LIMITED_MESSAGE: Record<AiRateKind, string> = {
  receipt:
    "Has escaneado muchos tickets en la última hora. Prueba de nuevo dentro de unos minutos.",
  menu: "Has generado menús muchas veces en la última hora. Prueba de nuevo dentro de unos minutos.",
  recipe:
    "Has pedido muchas recetas en la última hora. Prueba de nuevo dentro de unos minutos.",
};

/**
 * El mismo aviso cuando quien se ha pasado es el HOGAR, no tú.
 *
 * Va aparte y habla en plural porque el otro texto sería falso: a quien llega
 * aquí puede que sea su primer escaneo del día, y decirle «has escaneado
 * muchos» es exactamente el error que ya se corrigió cuando la cuota no se
 * devolvía —acusar al usuario de algo que no ha hecho—. Nombrar al hogar además
 * explica el único remedio que existe, que es esperar entre todos.
 */
const HOUSEHOLD_LIMITED_MESSAGE: Record<AiRateKind, string> = {
  receipt:
    "En tu hogar se han escaneado muchos tickets en la última hora. Probad de nuevo dentro de unos minutos.",
  menu: "En tu hogar se han generado muchos menús en la última hora. Probad de nuevo dentro de unos minutos.",
  recipe:
    "En tu hogar se han pedido muchas recetas en la última hora. Probad de nuevo dentro de unos minutos.",
};

/**
 * Registra un uso de IA y aplica los DOS límites por ventana (RPC
 * `record_ai_usage`): el del usuario y el del hogar. Protegen la cuota gratuita
 * de Gemini, que es una sola para todo el despliegue.
 *
 * Por qué hacen falta los dos: el individual defiende de una cuenta desbocada,
 * pero cuatro convivientes usando la app a la vez agotaban la cuota compartida
 * sin que ninguno se acercara a su tope, y entonces el escaneo y los menús
 * dejaban de funcionar para todos los hogares. No hacía falta abusar; bastaba
 * con ser varios.
 *
 * Devuelve un mensaje de error si se superó alguno (la acción debe abortar), o
 * `null` si se puede continuar. Fail-open ante cualquier otro error (p. ej. si
 * la migración aún no está aplicada): un fallo del contador no debe impedir
 * usar la app.
 *
 * Ojo con el reparto de los límites: el `case` de la RPC nombra solo 'receipt'
 * (20/h) y 'menu' (15/h), así que **'recipe' se apoya en su rama `else`**, que
 * son 10/h. Es a propósito —10 recetas por hora sobran para escribir cómo se
 * cocina un plato, y añadir una rama que dijera lo mismo obligaba a reemplazar
 * la función—, pero significa que tocar ese `else` cambia el límite de las
 * recetas sin que se lea la palabra «recipe» en ningún sitio. El del hogar es
 * el doble del individual, sea cual sea.
 */
export async function enforceAiRateLimit(
  supabase: SupabaseClient<Database>,
  kind: AiRateKind,
  householdId: string,
): Promise<string | null> {
  const { error } = await supabase.rpc("record_ai_usage", {
    p_kind: kind,
    p_household_id: householdId,
  });
  if (!error) return null;

  /*
    El del HOGAR se comprueba primero, y no es un capricho de orden: como se
    reconoce por subcadena, 'rate_limited_household' contiene 'rate_limited', o
    sea que al revés el cubo del hogar no se distinguiría nunca y a quien acaba
    de llegar se le diría «has escaneado muchos tickets» siendo el primero que
    hace hoy.
  */
  if (error.message?.includes("rate_limited_household")) {
    return HOUSEHOLD_LIMITED_MESSAGE[kind];
  }

  /*
    Se reconoce por SUBCADENA a propósito, y no por igualdad ni por el SQLSTATE.
    Se intentó endurecerlo (`code === "P0001"` + mensaje exacto) y es peor
    cambio del que parece: los dos fallos posibles no cuestan lo mismo. Un falso
    positivo —otro error de Postgres que algún día arrastre este texto— bloquea
    una acción una vez y el usuario reintenta; un falso negativo deja de aplicar
    el límite ENTERO y en silencio, que es justo el agujero por el que una sola
    cuenta puede agotar la cuota compartida de Gemini para todos los hogares.
    Ante la duda sobre la forma exacta en que PostgREST envuelve el mensaje, se
    prefiere pasarse de sensible.
  */
  if (error.message?.includes("rate_limited")) {
    return RATE_LIMITED_MESSAGE[kind];
  }

  /*
    `not_authenticated` NO es fail-open: si la RPC no reconoce la sesión, seguir
    adelante sería llamar a Gemini sin contador de ningún tipo. Del resto (la
    migración todavía sin aplicar, un fallo transitorio) sí se sale abierto a
    propósito: un contador roto no puede dejar la app inservible.
  */
  if (error.message?.includes("not_authenticated")) {
    return "No se pudo verificar tu sesión. Vuelve a entrar e inténtalo de nuevo.";
  }

  console.error(`record_ai_usage (${kind}):`, error);
  return null; // fail-open: un fallo del contador no bloquea el uso
}

/**
 * Devuelve la unidad de cuota que `enforceAiRateLimit` acaba de apuntar, para
 * cuando la llamada a la IA no llega a dar nada aprovechable.
 *
 * El apunte va por delante porque apuntar DESPUÉS dejaría pasar a todas las
 * llamadas que salgan mientras la primera espera al modelo (el cerrojo de la
 * RPC solo ordena a quienes apuntan; ver `..._cuota_ia_con_cerrojo`). Pero
 * cobrarlo pase lo que pase convertía los fallos del SERVICIO en castigos al
 * usuario: con el free tier saturado, veinte reintentos obedientes agotaban el
 * cupo y la app pasaba a acusarle de escanear demasiados tickets sin haber
 * leído ninguno.
 *
 * Solo se devuelve cuando Google NO llegó a trabajar (`refundsQuota`): un
 * 429 o una configuración rota los rechaza antes de generar nada. Un timeout o
 * una respuesta que no cuadra con el schema ya han gastado la cuota gratuita
 * —el modelo generó, aunque no nos sirva—, y devolverla ahí es lo que hacía el
 * límite gratis de saltar: un PDF enorme que siempre agota el tiempo se podía
 * repetir sin fin, veinte a la vez, y la cuota de TODOS los hogares se iba en
 * eso. El precio lo paga quien sufre un timeout de verdad, con una unidad de
 * veinte por hora; es el lado barato del error.
 *
 * Silenciosa por definición: esto corre dentro del `catch` de un fallo que ya
 * se le va a contar al usuario, así que si la devolución tampoco sale, lo único
 * que pasa es que el contador se queda como estaba —y añadir un segundo mensaje
 * de error encima del primero no le sirve a nadie—.
 */
/*
 * Va con la clave de SERVICIO, y es la única Server Action que la usa: la RPC
 * ya no la puede ejecutar ninguna sesión (migración
 * `20260923130000_codigos_alexa_y_cuota_ia.sql`). Cuando cualquiera podía
 * llamarla por PostgREST, llamarla tras cada generación que SÍ salía devolvía
 * la cuota sin fin. El usuario sale de la sesión de Clerk, nunca de la entrada.
 */
export async function refundAiUsage(
  kind: AiRateKind,
  householdId: string,
  failure: AiErrorKind,
): Promise<void> {
  if (!refundsQuota(failure)) return;
  try {
    const { userId } = await auth();
    if (!userId) return;
    const { error } = await createAdminClient().rpc("refund_ai_usage", {
      p_user_id: userId,
      p_kind: kind,
      p_household_id: householdId,
    });
    if (error) console.error(`refund_ai_usage (${kind}):`, error);
  } catch (err) {
    console.error(`refund_ai_usage (${kind}):`, err);
  }
}

/**
 * ¿Este fallo deja la cuota de Gemini como estaba? Solo cuando el proveedor
 * rechazó la petición sin generar: saturado (429) o mal configurado. Va en un
 * `switch` exhaustivo para que un tipo de fallo nuevo en `classifyAiError`
 * obligue a decidir aquí si se devuelve, en vez de caer callado en uno de los
 * dos lados.
 */
function refundsQuota(failure: AiErrorKind): boolean {
  switch (failure) {
    case "rate_limit":
    case "config":
      return true;
    case "timeout":
    case "other":
      return false;
  }
}
