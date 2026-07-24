import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { LandingPage } from "@/features/landing/components/landing-page";

/**
 * Punto de bifurcación de la raíz. Un visitante con sesión va directo a la app;
 * uno anónimo ve la landing pública. La página es dinámica (lee `auth()`).
 */
export default async function Home() {
  const { userId } = await auth();
  if (userId) redirect("/inventario");
  return <LandingPage />;
}
