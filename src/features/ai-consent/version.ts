/**
 * Consentimiento del usuario para el procesamiento con IA (Google Gemini).
 *
 * La app usa la cuota gratuita de la API de Gemini y le envía contenido del
 * hogar (ticket, despensa, recetario, lista, platos, preferencias). Para
 * legitimar ese envío recabamos consentimiento explícito antes de la primera
 * vez (art. 6.1.a RGPD, y 9.2.a por la dieta «sin gluten») y lo registramos de
 * forma demostrable (art. 7.1) en el metadata público del usuario en Clerk.
 *
 * Estas constantes son puras (sin dependencias de servidor) para poder
 * importarse tanto desde Server Actions como desde componentes cliente.
 */

/**
 * Versión del consentimiento. Súbela cuando cambie de forma material lo que se
 * envía a la IA o el proveedor/tier: un consentimiento de versión anterior
 * dejará de valer y se volverá a pedir.
 *
 * v2 (agosto 2026): el generador de menús pasó a enviar también la LISTA DE LA
 * COMPRA y los PLATOS DE LAS DOS SEMANAS ANTERIORES, dos categorías que el aviso
 * de la v1 no nombraba ("tu despensa y las preferencias que indiques"). Como en
 * el free tier Google puede entrenar con lo enviado y revisarlo una persona, la
 * ampliación es material y el consentimiento anterior no la cubre.
 */
export const AI_CONSENT_VERSION = 3;
/*
  v3 (septiembre 2026): el aviso de la v2 solo nombraba tickets y menús, y desde
  agosto la IA también escribe recetas; tampoco decía cómo retirarlo (art. 7.3),
  ni que viaja el contenido compartido del hogar, ni el presupuesto y los costes
  que el menú envía, ni la dieta «sin gluten», que puede revelar un dato de
  salud. Y describía el free tier como si Google entrenase con lo enviado,
  cuando sus términos aplican a quien la usa desde el EEE las condiciones de
  datos del nivel de pago.
*/

/**
 * Mensaje devuelto por las Server Actions de IA cuando falta el consentimiento.
 * Nombra Ajustes porque tres de las seis rutas («Otra idea», generar un hueco y
 * escribir los pasos) viven dentro del panel del plato, donde abrir el aviso
 * encadenaría dos modales: ahí solo sale este texto.
 */
export const AI_CONSENT_REQUIRED_ERROR =
  "Para usar la IA (tickets, menús y recetas) necesitamos tu permiso. Acéptalo al generar un menú o en Ajustes › Procesamiento con IA.";
