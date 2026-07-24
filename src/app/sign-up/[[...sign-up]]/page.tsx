import { SignUp } from "@clerk/nextjs";

import { AuthShell } from "@/components/layout/auth-shell";

export default function SignUpPage() {
  return (
    <AuthShell>
      {/* Ocultamos el logo propio del widget de Clerk: la marca ya la pone
          AuthShell arriba (logo + wordmark), como en la landing. */}
      <SignUp appearance={{ elements: { logoBox: "hidden!" } }} />
    </AuthShell>
  );
}
