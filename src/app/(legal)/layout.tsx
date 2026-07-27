import { PageContainer } from "@/components/layout/page-container";
import { LandingFooter } from "@/features/landing/components/landing-footer";
import { LandingNav } from "@/features/landing/components/landing-nav";

/**
 * Shell de las páginas legales públicas (/privacidad, /terminos): misma
 * cabecera y pie que la landing para que se sientan parte del mismo sitio.
 */
export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <LandingNav />
      <main className="flex-1 py-10 md:py-14">
        <PageContainer variant="prose" className="px-4 sm:px-6">
          {children}
        </PageContainer>
      </main>
      <LandingFooter />
    </>
  );
}
