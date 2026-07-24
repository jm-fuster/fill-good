import { SignIn } from "@clerk/nextjs";

import { AuthShell } from "@/components/layout/auth-shell";

export default function SignInPage() {
  return (
    <AuthShell>
      {/* Ocultamos el logo propio del widget de Clerk: la marca ya la pone
          AuthShell arriba (logo + wordmark), como en la landing. */}
      <SignIn appearance={{ elements: { logoBox: "hidden!" } }} />
    </AuthShell>
  );
}
