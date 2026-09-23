import { NextResponse, type NextRequest } from "next/server";

// Recibe los informes de violación de la CSP (directivas report-uri / report-to)
// y los registra en los logs del servidor (visibles en Vercel). Sirve para ver,
// con tráfico REAL de producción —incluidas las rutas autenticadas que no se
// pueden probar en local—, qué recursos bloquearía la política ANTES de pasarla
// a modo enforce, y para seguir vigilándola después.
//
// No requiere sesión: los navegadores envían estos informes sin credenciales.
// Solo registra; no persiste ni actúa sobre ellos.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Violation = {
  directive: string;
  blocked: string;
  documentUri: string;
};

/**
 * Ruido típico de una CSP en Report-Only: extensiones del navegador que inyectan
 * scripts/estilos en la página. No es un problema de la app y taparía las
 * violaciones reales, así que no se registra.
 */
function isBrowserNoise(blocked: string): boolean {
  return (
    blocked === "" ||
    blocked.startsWith("chrome-extension") ||
    blocked.startsWith("moz-extension") ||
    blocked.startsWith("safari-extension") ||
    blocked.startsWith("safari-web-extension") ||
    blocked.startsWith("about") ||
    blocked === "null"
  );
}

/** Normaliza los dos formatos (report-uri kebab-case y report-to camelCase). */
function normalizeReports(payload: unknown): Violation[] {
  const pick = (r: Record<string, unknown>): Violation => ({
    directive: String(
      r["effective-directive"] ?? r["effectiveDirective"] ?? r["violated-directive"] ?? "",
    ),
    blocked: String(r["blocked-uri"] ?? r["blockedURL"] ?? ""),
    documentUri: String(r["document-uri"] ?? r["documentURL"] ?? ""),
  });

  // report-uri: { "csp-report": {...} }
  if (payload && typeof payload === "object" && "csp-report" in payload) {
    const inner = (payload as Record<string, unknown>)["csp-report"];
    if (inner && typeof inner === "object") return [pick(inner as Record<string, unknown>)];
  }
  // report-to: [ { type: "csp-violation", body: {...} }, ... ]
  if (Array.isArray(payload)) {
    return payload
      .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
      .map((e) => (e.body && typeof e.body === "object" ? e.body : e) as Record<string, unknown>)
      .map(pick);
  }
  return [];
}

/**
 * Tope del cuerpo. Un informe real ocupa unos cientos de bytes y un lote de
 * report-to unos pocos KB; sin tope, `request.json()` leía entero lo que
 * mandara cualquiera —el endpoint es público y sin sesión— y lo volcaba a los
 * logs, que se pagan y se llenan.
 */
const MAX_BODY_BYTES = 64 * 1024;
/** Tope de violaciones registradas por petición (un lote no inunda los logs). */
const MAX_LOGGED = 20;

/**
 * Lee el cuerpo cortando al pasar del tope. Se cuenta sobre el flujo y no sobre
 * `Content-Length`, que lo pone quien envía (y puede faltar o mentir).
 * Devuelve null si se pasa.
 */
async function readLimited(request: NextRequest): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return null;
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function POST(request: NextRequest) {
  const body = await readLimited(request);
  if (body === null) return new NextResponse(null, { status: 413 });

  let payload: unknown = null;
  try {
    payload = JSON.parse(body);
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const reales = normalizeReports(payload).filter((v) => !isBrowserNoise(v.blocked));
  for (const v of reales.slice(0, MAX_LOGGED)) {
    // Cada campo, recortado: son URLs que manda el navegador (o cualquiera).
    console.warn(
      "[CSP violation]",
      JSON.stringify({
        directive: v.directive.slice(0, 100),
        blocked: v.blocked.slice(0, 300),
        documentUri: v.documentUri.slice(0, 300),
      }),
    );
  }
  if (reales.length > MAX_LOGGED) {
    console.warn(`[CSP violation] …y ${reales.length - MAX_LOGGED} más en el mismo lote`);
  }

  // 204: al navegador no le importa la respuesta del endpoint de informes.
  return new NextResponse(null, { status: 204 });
}
