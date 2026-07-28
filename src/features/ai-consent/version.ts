/**
 * Consentimiento del usuario para el procesamiento con IA (Google Gemini).
 *
 * La app usa el nivel gratuito de la API de Gemini, donde Google puede usar lo
 * enviado (imagen del ticket, despensa, preferencias) para mejorar sus modelos y
 * no hay contrato de encargo. Para legitimar ese envío recabamos consentimiento
 * explícito antes del primer escaneo/menú (art. 6.1.a RGPD) y lo registramos de
 * forma demostrable (art. 7.1) en el metadata público del usuario en Clerk.
 *
 * Estas constantes son puras (sin dependencias de servidor) para poder
 * importarse tanto desde Server Actions como desde componentes cliente.
 */

/**
 * Versión del consentimiento. Súbela cuando cambie de forma material lo que se
 * envía a la IA o el proveedor/tier: un consentimiento de versión anterior
 * dejará de valer y se volverá a pedir.
 */
export const AI_CONSENT_VERSION = 1;

/** Mensaje devuelto por las Server Actions de IA cuando falta el consentimiento. */
export const AI_CONSENT_REQUIRED_ERROR =
  "Para leer tickets y generar menús necesitamos enviar esos datos a la IA de Google. Acepta el aviso para continuar.";
