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

export async function POST(request: NextRequest) {
  let payload: unknown = null;
  try {
    payload = await request.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  for (const v of normalizeReports(payload)) {
    if (isBrowserNoise(v.blocked)) continue;
    console.warn("[CSP violation]", JSON.stringify(v));
  }

  // 204: al navegador no le importa la respuesta del endpoint de informes.
  return new NextResponse(null, { status: 204 });
}
