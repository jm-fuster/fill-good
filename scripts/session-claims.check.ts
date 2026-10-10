/**
 * Comprobaciones de los datos de usuario que viajan en el token de sesión de
 * Clerk (`getSessionUserClaims`, en `src/lib/current-user.ts`) y de la puerta
 * de IA que se fía de ellos (`getAiConsentHint`, en
 * `src/features/ai-consent/queries.ts`). Lo ejecuta `npm run check:sesion`
 * (ver `scripts/check-session-claims.mjs`, que sustituye Clerk por uno falso).
 *
 * Existe por una regla que ningún tipo ve: el token puede ir hasta un minuto
 * por detrás de Clerk, así que la puerta de /escanear solo se fía de él cuando
 * dice que SÍ hay consentimiento; un «no», un dato a null o una versión vieja
 * se comprueban con Clerk. Simplificarla a «lo que diga el token» deja los
 * tipos igual y devuelve el aviso de consentimiento a quien acaba de darlo
 * (o, al revés, quita la llamada a Clerk que sí hacía falta). Y fija lo otro
 * que se rompe sin ruido: que un token SIN los claims configurados se lea como
 * «no hay datos» (y la pantalla pregunte a Clerk, como antes) y no como «no
 * tiene nombre ni foto».
 *
 * Lo que NO se prueba: que Clerk resuelva los shortcodes del panel (eso solo
 * se ve en un token real) ni las pantallas que usan esto.
 */
import { getSessionUserClaims } from "@/lib/current-user";
import { getAiConsentHint } from "@/features/ai-consent/queries";
import { AI_CONSENT_VERSION } from "@/features/ai-consent/version";

/** El Clerk falso que pone `check-session-claims.mjs`. */
type FakeClerk = {
  claims: Record<string, unknown> | null;
  user: unknown;
  currentUserCalls: number;
};
const clerk = (globalThis as unknown as { __fakeClerk: FakeClerk })
  .__fakeClerk;

let fallos = 0;
function check(nombre: string, condicion: boolean, extra?: unknown) {
  if (condicion) {
    console.log(`  ok    ${nombre}`);
  } else {
    fallos += 1;
    console.log(
      `  FALLO ${nombre}`,
      extra === undefined ? "" : JSON.stringify(extra),
    );
  }
}

function escenario(claims: Record<string, unknown> | null, user: unknown) {
  clerk.claims = claims;
  clerk.user = user;
  clerk.currentUserCalls = 0;
}

const conConsentimiento = {
  publicMetadata: { aiConsent: { version: AI_CONSENT_VERSION, at: "x" } },
};
const sinConsentimiento = { publicMetadata: {} };

console.log("\nLectura del token");

escenario({ sub: "user_x" }, conConsentimiento);
check("token sin los claims configurados → null", (await getSessionUserClaims()) === null);

escenario(
  {
    sub: "user_x",
    first_name: "Ana",
    last_name: "Ruiz",
    has_image: true,
    image_url: "https://img.clerk.com/x",
    ai_consent_version: AI_CONSENT_VERSION,
  },
  null,
);
const completo = await getSessionUserClaims();
check("claims completos se leen", completo?.firstName === "Ana" &&
  completo.fullName === "Ana Ruiz" &&
  completo.hasImage === true &&
  completo.imageUrl === "https://img.clerk.com/x", completo);

escenario(
  { sub: "user_x", first_name: "", last_name: "Ruiz", has_image: false },
  null,
);
const soloApellido = await getSessionUserClaims();
check("nombre vacío + apellido → fullName como Clerk", soloApellido?.firstName === null &&
  soloApellido.fullName === "Ruiz" &&
  soloApellido.hasImage === false, soloApellido);

escenario(
  {
    sub: "user_x",
    first_name: null,
    last_name: null,
    has_image: null,
    image_url: null,
    ai_consent_version: null,
  },
  null,
);
const anulado = await getSessionUserClaims();
check("claims a null (shortcode sin resolver) → hasImage null, no false", anulado !== null &&
  anulado.hasImage === null &&
  anulado.fullName === null, anulado);

console.log("\nPuerta de IA de /escanear (getAiConsentHint)");

escenario({ sub: "user_x", first_name: "Ana", ai_consent_version: AI_CONSENT_VERSION }, sinConsentimiento);
check("token dice SÍ → sí, sin llamar a Clerk", (await getAiConsentHint()) === true &&
  clerk.currentUserCalls === 0, { llamadas: clerk.currentUserCalls });

escenario({ sub: "user_x", first_name: "Ana", ai_consent_version: null }, conConsentimiento);
check("token dice no (p. ej. aún sin renovar tras aceptar) → pregunta a Clerk", (await getAiConsentHint()) === true &&
  clerk.currentUserCalls === 1, { llamadas: clerk.currentUserCalls });

escenario({ sub: "user_x", first_name: "Ana", ai_consent_version: AI_CONSENT_VERSION - 1 }, sinConsentimiento);
check("versión vieja en el token → pregunta a Clerk, que dice no", (await getAiConsentHint()) === false &&
  clerk.currentUserCalls === 1, { llamadas: clerk.currentUserCalls });

escenario({ sub: "user_x" }, conConsentimiento);
check("token sin claims → pregunta a Clerk, como antes", (await getAiConsentHint()) === true &&
  clerk.currentUserCalls === 1, { llamadas: clerk.currentUserCalls });

console.log(
  fallos === 0
    ? "\nDatos de usuario del token de sesión: todo correcto.\n"
    : `\nDatos de usuario del token de sesión: ${fallos} fallo(s).\n`,
);
process.exit(fallos === 0 ? 0 : 1);
