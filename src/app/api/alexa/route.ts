import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchAlexaRequest } from "@/features/alexa/handlers";
import { alexaEnvelopeSchema, getApplicationId } from "@/features/alexa/schemas";
import { safeEqual, verifyAlexaRequest } from "@/features/alexa/verify";

/**
 * Webhook de la skill de Alexa «mi despensa»: permite restar stock del
 * inventario hablándole a un Echo de la cocina. Guía de configuración de la
 * skill (developer console, modelo de interacción y pruebas) en
 * `docs/alexa/README.md`.
 *
 * Lo llama Amazon desde AWS, sin sesión de Clerk: la ruta está declarada pública
 * en `src/proxy.ts` y se autentica por su cuenta con la firma de la petición
 * (`verify.ts`) y el id de la skill. TAREA DEL USUARIO: definir `ALEXA_SKILL_ID`
 * en `.env.local` y en el dashboard de Vercel — sin ella responde 401 a todo.
 *
 * Al no haber JWT de Clerk no se puede usar `createServerSupabaseClient`: se usa
 * el cliente service-role, que SALTA LA RLS. De ahí que el hogar salga siempre
 * de la fila de `alexa_links`, nunca del cuerpo de la petición.
 */

// El certificado se valida con X509Certificate de node:crypto, que no existe en
// el runtime edge.
export const runtime = "nodejs";
// No cachear: cada petición trae su propia firma y toca datos en vivo.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // 1. Sin el id de la skill no hay nada que cotejar: cerrado por defecto.
  const skillId = process.env.ALEXA_SKILL_ID;
  if (!skillId) {
    console.error("Webhook de Alexa: falta ALEXA_SKILL_ID.");
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  // 2. El cuerpo se lee como TEXTO: la firma es sobre estos bytes exactos, y
  //    volver a serializar el JSON parseado daría otra cadena.
  const rawBody = await request.text();
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Cuerpo no válido" }, { status: 400 });
  }
  const parsed = alexaEnvelopeSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: "Petición no reconocida" }, { status: 400 });
  }
  const envelope = parsed.data;

  // 3. ¿Es NUESTRA skill? Se comprueba antes de la firma porque es gratis y
  //    evita salir a descargar el certificado por tráfico ajeno.
  const applicationId = getApplicationId(envelope);
  if (!applicationId || !safeEqual(applicationId, skillId)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  // 4. Firma de Amazon y frescura del timestamp.
  const verdict = await verifyAlexaRequest({
    headers: request.headers,
    rawBody,
    timestamp: envelope.request.timestamp,
  });
  if (!verdict.ok) {
    console.warn(`Webhook de Alexa: petición rechazada (${verdict.reason}).`);
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error("Webhook de Alexa: configuración de Supabase incompleta.", error);
    return Response.json(
      { error: "Configuración de servidor incompleta" },
      { status: 500 },
    );
  }

  return Response.json(await dispatchAlexaRequest(envelope, admin));
}
