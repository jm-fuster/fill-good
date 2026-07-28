/**
 * Elimina los metadatos (EXIF, XMP…) de un JPEG conservando la imagen intacta.
 *
 * Minimización de datos (art. 5.1.c RGPD): la foto de un ticket hecha con el
 * móvil suele llevar en EXIF la geolocalización GPS exacta del usuario y el
 * modelo del dispositivo. Esos bytes viajarían dentro de la imagen a la IA de
 * Google sin aportar NADA a la lectura de productos y precios. Quitarlos no
 * afecta al OCR y es reversible-safe: ante cualquier duda, se devuelve el
 * original sin tocar.
 *
 * Solo actúa sobre JPEG, que es donde las cámaras incrustan el GPS. Para el
 * resto de formatos (PNG, WebP, PDF) devuelve los bytes sin cambios: rara vez
 * portan GPS y sanearlos exigiría un parser por formato.
 *
 * Nota: las imágenes que pasan por `compressImage` (galería/cámara en cliente)
 * ya salen sin EXIF porque se recodifican en canvas. Este saneado cubre las
 * rutas que NO pasan por ahí —sobre todo el Web Share Target, que envía el
 * archivo original desde el servidor— y actúa como segunda red para el resto.
 */
/** Tipos de archivo admitidos para el ticket, deducidos del CONTENIDO real. */
export type SniffedType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "application/pdf";

/**
 * Deduce el tipo de archivo por sus magic bytes, ignorando el MIME que declara
 * el cliente (que puede mentir en el multipart). Devuelve null si no es ninguno
 * de los admitidos. Endurecimiento: evita que un binario arbitrario etiquetado
 * como image/jpeg llegue a la IA.
 */
export function sniffUploadType(bytes: Uint8Array): SniffedType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // "RIFF"
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50 // "WEBP"
  ) {
    return "image/webp";
  }
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return "application/pdf"; // "%PDF"
  }
  return null;
}

export function stripImageMetadata(
  bytes: Uint8Array,
  mediaType: string,
): Uint8Array {
  if (mediaType !== "image/jpeg") return bytes;
  // Un JPEG empieza por SOI (0xFFD8). Si no, no es lo que esperamos: no tocar.
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;

  // Rangos [inicio, fin) a conservar. Empezamos por el SOI.
  const keep: Array<[number, number]> = [[0, 2]];
  let i = 2;
  let removedAny = false;

  while (i + 1 < bytes.length) {
    if (bytes[i] !== 0xff) break; // fuera de un marcador: paramos y copiamos resto
    const marker = bytes[i + 1]!;

    // SOS (0xDA): a partir de aquí van los datos comprimidos de la imagen.
    if (marker === 0xda) break;

    // Marcadores sin segmento de longitud (TEM y RSTn): ocupan 2 bytes.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      keep.push([i, i + 2]);
      i += 2;
      continue;
    }

    // Marcador con segmento: 2 bytes de longitud big-endian (se incluyen a sí mismos).
    if (i + 3 >= bytes.length) break;
    const len = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    if (len < 2 || i + 2 + len > bytes.length) return bytes; // estructura rara → no tocar

    // APP1..APP15 (0xE1–0xEF): EXIF, XMP y demás metadatos → se descartan.
    // APP0 (0xE0, JFIF) y el resto de segmentos (tablas de cuantización, etc.)
    // se conservan.
    const isMetadataApp = marker >= 0xe1 && marker <= 0xef;
    if (isMetadataApp) removedAny = true;
    else keep.push([i, i + 2 + len]);

    i += 2 + len;
  }

  if (!removedAny) return bytes; // no había metadatos que quitar
  keep.push([i, bytes.length]); // resto del archivo (datos de imagen)

  const total = keep.reduce((n, [s, e]) => n + (e - s), 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const [s, e] of keep) {
    out.set(bytes.subarray(s, e), offset);
    offset += e - s;
  }
  return out;
}
