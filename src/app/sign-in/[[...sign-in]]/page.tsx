import { SignIn } from "@clerk/nextjs";

import { AuthLegalNotice } from "@/components/layout/auth-legal-notice";
import { AuthShell } from "@/components/layout/auth-shell";

export default function SignInPage() {
  return (
    <AuthShell>
      <div className="flex flex-col items-center gap-4">
        {/* Ocultamos el logo propio del widget de Clerk: la marca ya la pone
            AuthShell arriba (logo + wordmark), como en la landing. */}
        <SignIn appearance={{ elements: { logoBox: "hidden!" } }} />
        <AuthLegalNotice action="entrar" />
      </div>
    </AuthShell>
  );
}
