import Link from "next/link";
import { SignUp } from "@clerk/nextjs";

import { AuthShell } from "@/components/layout/auth-shell";

export default function SignUpPage() {
  return (
    <AuthShell>
      <div className="flex flex-col items-center gap-4">
        {/* Ocultamos el logo propio del widget de Clerk: la marca ya la pone
            AuthShell arriba (logo + wordmark), como en la landing. */}
        <SignUp appearance={{ elements: { logoBox: "hidden!" } }} />

        {/* Consentimiento e info en el momento del alta (art. 8 RGPD / art. 7
            LOPDGDD: 14 años en España; art. 13: informar al recoger los datos). */}
        <p className="max-w-sm text-center text-xs text-pretty text-muted-foreground">
          Al crear una cuenta confirmas que tienes al menos 14 años y aceptas los{" "}
          <Link
            href="/terminos"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            términos
          </Link>{" "}
          y la{" "}
          <Link
            href="/privacidad"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            política de privacidad
          </Link>
          .
        </p>
      </div>
    </AuthShell>
  );
}
