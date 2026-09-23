"use client";

import { useEffect } from "react";

/**
 * Último recurso: solo se muestra si el RootLayout mismo falla (p. ej. el
 * proveedor de Clerk). Sustituye por completo al RootLayout, así que debe
 * renderizar su propio <html>/<body>.
 *
 * Excepción deliberada a la regla de "solo tokens semánticos": aquí Tailwind y
 * los tokens de globals.css NO están garantizados (el layout que los inyecta es
 * justo el que ha fallado), por eso se usan estilos en línea autocontenidos.
 * Los valores coinciden con el tema de la marca (ver manifest.ts / globals.css).
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  // `retry`, no `reset`: el segundo solo repinta el fallo (ver ErrorScreen).
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[Fill Good] error global:", error.digest ?? "", error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "2.5rem 1.5rem",
          textAlign: "center",
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#f7faf8",
          color: "#151e19",
        }}
      >
        <style>{`@media (prefers-color-scheme: dark){body{background:#151e19 !important;color:#f7faf8 !important}}`}</style>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>
          No se pudo cargar
        </h1>
        <p
          style={{
            maxWidth: "20rem",
            fontSize: "0.875rem",
            opacity: 0.7,
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          Ha habido un problema al cargar la aplicación. Suele ser temporal:
          vuelve a intentarlo.
        </p>
        <button
          type="button"
          onClick={retry}
          style={{
            height: "2.75rem",
            padding: "0 1.25rem",
            borderRadius: "0.5rem",
            border: "none",
            background: "#127a4e",
            color: "#ffffff",
            fontSize: "0.875rem",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Reintentar
        </button>
      </body>
    </html>
  );
}
