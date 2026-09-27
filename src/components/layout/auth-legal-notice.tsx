import Link from "next/link";

/**
 * Información en el momento del alta (art. 13 RGPD: informar al recoger los
 * datos). Va en /sign-up y TAMBIÉN en /sign-in: quien entra por primera vez con
 * Google desde el inicio de sesión crea la cuenta ahí, sin pasar por el alta.
 *
 * 18 años y no los 14 de la LOPDGDD: los términos de la API de Gemini prohíben
 * usarla en servicios «likely to be accessed by individuals under the age of
 * 18». La política no se «acepta» —se informa—, por eso solo se aceptan los
 * términos.
 */
export function AuthLegalNotice({ action }: { action: "entrar" | "crear" }) {
  const linkClass = "underline underline-offset-2 hover:text-foreground";
  return (
    <p className="max-w-sm text-center text-xs text-pretty text-muted-foreground">
      {action === "crear"
        ? "Al crear una cuenta"
        : "Si es la primera vez que entras, al crear tu cuenta"}{" "}
      confirmas que tienes al menos 18 años y aceptas los{" "}
      <Link href="/terminos" target="_blank" rel="noreferrer" className={linkClass}>
        términos
      </Link>
      . Cómo tratamos tus datos, en la{" "}
      <Link href="/privacidad" target="_blank" rel="noreferrer" className={linkClass}>
        política de privacidad
      </Link>
      .
    </p>
  );
}
