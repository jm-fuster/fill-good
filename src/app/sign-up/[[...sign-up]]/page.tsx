import { SignUp } from "@clerk/nextjs";

import { AuthLegalNotice } from "@/components/layout/auth-legal-notice";
import { AuthShell } from "@/components/layout/auth-shell";

export default function SignUpPage() {
  return (
    <AuthShell>
      <div className="flex flex-col items-center gap-4">
        {/* Ocultamos el logo propio del widget de Clerk: la marca ya la pone
            AuthShell arriba (logo + wordmark), como en la landing. */}
        <SignUp appearance={{ elements: { logoBox: "hidden!" } }} />
        <AuthLegalNotice action="crear" />
      </div>
    </AuthShell>
  );
}
