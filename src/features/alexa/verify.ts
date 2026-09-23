import "server-only";

import { createHash, createVerify, timingSafeEqual, X509Certificate } from "node:crypto";
import { rootCertificates } from "node:tls";

/**
 * Verificación de las peticiones de Alexa (skill con endpoint HTTPS propio, no
 * Lambda). Amazon no firma con un secreto compartido: firma el cuerpo con una
 * clave privada y publica el certificado en S3, así que hay que comprobar CUATRO
 * cosas independientes, y las cuatro son obligatorias:
 *
 *   1. La URL del certificado es realmente de Amazon (si no, el atacante nos
 *      haría descargar SU certificado y firmaría lo que quisiera).
 *   2. La cadena del certificado es válida, está vigente, acaba en una CA de
 *      confianza del sistema, y el certificado de hoja sirve para el dominio
 *      `echo-api.amazon.com`.
 *   3. La firma de la cabecera cuadra con los BYTES EXACTOS del cuerpo.
 *   4. El timestamp de la petición es reciente (evita reenviar una petición
 *      legítima capturada: sin esto, «resta dos yogures» sería reproducible).
 *
 * Se implementa con `node:crypto` en vez de tirar del paquete `alexa-verifier`:
 * Node ≥20 ya trae todo (`X509Certificate` sabe validar SANs y firmas, y
 * `tls.rootCertificates` da las anclas de confianza), y el repo tiene la
 * costumbre de no añadir dependencias para lo que la plataforma resuelve (mismo
 * criterio que con `svix` para webhooks).
 *
 * Todo esto es código de servidor: no entra en el bundle del cliente.
 */

/** Host y prefijo de ruta donde Amazon publica los certificados de las skills. */
const CERT_HOST = "s3.amazonaws.com";
const CERT_PATH_PREFIX = "/echo.api/";
/** Dominio que debe amparar el certificado de hoja. */
const CERT_DOMAIN = "echo-api.amazon.com";
/** Ventana de tolerancia del timestamp que exige Amazon: 150 segundos. */
const MAX_TIMESTAMP_SKEW_MS = 150_000;
/** Tope de entradas de la caché de cadenas (Amazon rota la URL cada pocos días). */
const MAX_CACHED_CHAINS = 8;

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export type VerifyInput = {
  headers: Headers;
  /** Cuerpo TAL CUAL llegó: la firma es sobre estos bytes, no sobre el JSON. */
  rawBody: string;
  /** `request.timestamp` del envelope (ISO 8601). */
  timestamp: string | undefined;
};

/**
 * Comparación en tiempo constante (hash a 32 bytes → sin fuga de longitud ni
 * early-exit por carácter), igual que en el cron de caducidades.
 */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Caché de cadenas ya descargadas y validadas, por URL. */
const chainCache = new Map<string, X509Certificate[]>();

/** Certificados raíz del sistema, indexados por subject (se parsean una vez). */
let rootsBySubject: Map<string, X509Certificate[]> | null = null;

function getRootsBySubject(): Map<string, X509Certificate[]> {
  if (rootsBySubject) return rootsBySubject;
  const map = new Map<string, X509Certificate[]>();
  for (const pem of rootCertificates) {
    try {
      const cert = new X509Certificate(pem);
      const list = map.get(cert.subject);
      if (list) list.push(cert);
      else map.set(cert.subject, [cert]);
    } catch {
      // Un certificado del almacén que no se puede parsear no invalida el resto.
    }
  }
  rootsBySubject = map;
  return map;
}

/**
 * Valida que la URL del certificado es una de Amazon. Se comprueba sobre la URL
 * ya normalizada por `new URL()`, así que un `/echo.api/../malicioso` no cuela:
 * el parser resuelve los `..` antes de que miremos el path.
 */
export function isValidCertChainUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.hostname.toLowerCase() !== CERT_HOST) return false;
  if (url.port !== "" && url.port !== "443") return false;
  return url.pathname.startsWith(CERT_PATH_PREFIX);
}

function parsePemChain(pem: string): X509Certificate[] {
  const blocks =
    pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ??
    [];
  const chain: X509Certificate[] = [];
  for (const block of blocks) {
    try {
      chain.push(new X509Certificate(block));
    } catch {
      return [];
    }
  }
  return chain;
}

/**
 * Fechas de validez. `X509Certificate` las expone como texto en formato OpenSSL
 * («Aug  1 00:00:00 2026 GMT»); `validFromDate`/`validToDate` no existen hasta
 * Node 23, así que se parsea a mano. Si no se pueden leer se falla CERRADO: un
 * certificado cuya vigencia no podemos comprobar no es un certificado válido.
 */
function isCurrentlyValid(cert: X509Certificate, now: number): boolean {
  const from = Date.parse(cert.validFrom.replace(/\s+/g, " "));
  const to = Date.parse(cert.validTo.replace(/\s+/g, " "));
  if (Number.isNaN(from) || Number.isNaN(to)) return false;
  return now >= from && now <= to;
}

/** Comprueba la cadena completa: vigencia, dominio, eslabones y ancla de confianza. */
function validateChain(chain: X509Certificate[], now: number): VerifyResult {
  if (chain.length === 0) return { ok: false, reason: "cadena_vacia" };

  for (const cert of chain) {
    if (!isCurrentlyValid(cert, now)) {
      return { ok: false, reason: "certificado_fuera_de_vigencia" };
    }
  }

  const leaf = chain[0];
  if (!leaf.checkHost(CERT_DOMAIN)) {
    return { ok: false, reason: "certificado_no_es_de_echo_api" };
  }

  // Cada certificado debe estar firmado por el siguiente de la cadena, y ese
  // siguiente tiene que ser una CA (basicConstraints CA:TRUE). Sin lo segundo
  // bastaba con que la firma cuadrase: un certificado FINAL de cualquier
  // dominio, colgado de una raíz de confianza, podía firmar uno a nombre de
  // echo-api. Defensa en profundidad: además hace falta la clave de Amazon
  // para firmar la petición.
  for (let i = 0; i < chain.length - 1; i += 1) {
    if (!chain[i + 1].ca) {
      return { ok: false, reason: "emisor_no_es_ca" };
    }
    if (!chain[i].verify(chain[i + 1].publicKey)) {
      return { ok: false, reason: "cadena_inconsistente" };
    }
  }

  // El último eslabón tiene que colgar del almacén de CAs del sistema. Si la
  // cadena ya incluye su propia raíz autofirmada, se exige que ESA raíz esté en
  // el almacén (comparando huella), no basta con que se verifique a sí misma.
  const last = chain[chain.length - 1];
  const roots = getRootsBySubject();
  if (last.issuer === last.subject) {
    const trusted = (roots.get(last.subject) ?? []).some(
      (root) => root.fingerprint256 === last.fingerprint256,
    );
    return trusted ? { ok: true } : { ok: false, reason: "raiz_no_confiable" };
  }
  const trusted = (roots.get(last.issuer) ?? []).some(
    (root) => isCurrentlyValid(root, now) && last.verify(root.publicKey),
  );
  return trusted ? { ok: true } : { ok: false, reason: "sin_ancla_de_confianza" };
}

async function loadChain(url: string): Promise<X509Certificate[]> {
  const cached = chainCache.get(url);
  if (cached) return cached;

  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) return [];
  const chain = parsePemChain(await response.text());
  if (chain.length > 0) {
    // Amazon rota la URL cada pocos días: la caché no puede crecer sin freno.
    if (chainCache.size >= MAX_CACHED_CHAINS) chainCache.clear();
    chainCache.set(url, chain);
  }
  return chain;
}

/**
 * ¿Estamos en el escape de desarrollo local? Salta SOLO la firma y el timestamp
 * (que exigen peticiones reales de Amazon) para poder probar con los fixtures
 * curl de docs/alexa/README.md. La comprobación del applicationId NO se salta
 * nunca, y esto exige `NODE_ENV === "development"`: en Vercel es siempre
 * "production", así que definir la variable allí no tendría ningún efecto.
 */
export function isVerificationSkipped(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.ALEXA_SKIP_VERIFY === "1"
  );
}

export async function verifyAlexaRequest({
  headers,
  rawBody,
  timestamp,
}: VerifyInput): Promise<VerifyResult> {
  if (isVerificationSkipped()) return { ok: true };

  const now = Date.now();

  // 4. Timestamp reciente (anti-replay). Se comprueba primero porque es gratis.
  if (!timestamp) return { ok: false, reason: "sin_timestamp" };
  const sent = Date.parse(timestamp);
  if (Number.isNaN(sent)) return { ok: false, reason: "timestamp_ilegible" };
  if (Math.abs(now - sent) > MAX_TIMESTAMP_SKEW_MS) {
    return { ok: false, reason: "timestamp_caducado" };
  }

  // 1. URL del certificado.
  const certUrl = headers.get("signaturecertchainurl");
  if (!certUrl) return { ok: false, reason: "sin_signaturecertchainurl" };
  if (!isValidCertChainUrl(certUrl)) {
    return { ok: false, reason: "url_de_certificado_no_valida" };
  }

  // 3. Firma: se prefiere SHA-256; `Signature` (SHA-1) es la cabecera antigua
  //    que Amazon sigue enviando en algunos dispositivos.
  const sha256 = headers.get("signature-256");
  const signature = sha256 ?? headers.get("signature");
  if (!signature) return { ok: false, reason: "sin_firma" };
  const algorithm = sha256 ? "RSA-SHA256" : "RSA-SHA1";

  // 2. Cadena de certificados.
  let chain: X509Certificate[];
  try {
    chain = await loadChain(certUrl);
  } catch {
    return { ok: false, reason: "certificado_no_descargable" };
  }
  const chainResult = validateChain(chain, now);
  if (!chainResult.ok) return chainResult;

  let valid = false;
  try {
    valid = createVerify(algorithm)
      .update(Buffer.from(rawBody, "utf8"))
      .verify(chain[0].publicKey, signature, "base64");
  } catch {
    return { ok: false, reason: "firma_ilegible" };
  }
  return valid ? { ok: true } : { ok: false, reason: "firma_incorrecta" };
}
