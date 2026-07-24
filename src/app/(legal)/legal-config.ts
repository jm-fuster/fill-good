/**
 * Datos del titular del servicio que se muestran en los textos legales
 * (/privacidad y /terminos).
 *
 * TODO: rellenar antes de publicar — los textos renderizan estos valores tal
 * cual, así que los corchetes se verán en la web hasta que se completen.
 */
export const LEGAL_OWNER = {
  /** Nombre y apellidos (persona física) o razón social (empresa). */
  name: "[Nombre y apellidos o razón social del titular]",
  /** NIF o CIF del titular. */
  taxId: "[NIF/CIF]",
  /** Dirección postal completa de contacto. */
  address: "[Dirección postal completa]",
  /** Buzón para ejercicio de derechos RGPD y consultas legales. */
  email: "[email de contacto]",
} as const;
