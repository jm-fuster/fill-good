/**
 * Datos del titular del servicio que se muestran en los textos legales
 * (/privacidad y /terminos).
 *
 * `name` y `email` son OBLIGATORIOS (art. 13.1.a RGPD: identidad del responsable
 * + un medio de contacto). El check de build (scripts/check-legal-config.mjs)
 * bloquea el despliegue a producción si siguen sin rellenar.
 *
 * `taxId` y `address` son OPCIONALES: la LSSI (art. 10) solo los exige a
 * servicios con actividad económica; un servicio gratuito sin publicidad ni
 * monetización tiene margen para omitirlos (confírmalo con tu asesor). Si los
 * dejas en "", NO se muestran en las páginas legales. Si los rellenas, usa una
 * dirección profesional (gestoría, apartado de correos), nunca tu domicilio si
 * no quieres exponerlo.
 */
type LegalOwner = {
  name: string;
  email: string;
  taxId: string;
  address: string;
};

export const LEGAL_OWNER: LegalOwner = {
  /** Nombre y apellidos (persona física) o razón social (empresa). OBLIGATORIO. */
  name: "Jorge Molina Fuster",
  /** Buzón para ejercicio de derechos RGPD y consultas legales. OBLIGATORIO. */
  email: "jorgemolinafuster@gmail.com",
  /** NIF o CIF del titular. OPCIONAL ("" = no se muestra en las páginas legales). */
  taxId: "",
  /** Dirección postal profesional de contacto. OPCIONAL ("" = no se muestra). */
  address: "",
};
