import { LandingNav } from "./landing-nav";
import { LandingHero } from "./landing-hero";
import { LandingHowItWorks } from "./landing-how-it-works";
import { LandingBento } from "./landing-bento";
import { PriceSpotlight } from "./price-spotlight";
import { LandingFaq } from "./landing-faq";
import { LandingCta } from "./landing-cta";
import { LandingFooter } from "./landing-footer";

/**
 * Landing pública de Fill Good (`/` sin sesión). Composición de secciones; toda
 * presentación (Server Components), sin queries ni actions. El único cliente es
 * `reveal.tsx`. Landmarks: header (nav) + main + footer.
 */
export function LandingPage() {
  return (
    <>
      <LandingNav />
      <main className="flex-1">
        <LandingHero />
        <LandingHowItWorks />
        <LandingBento />
        <PriceSpotlight />
        <LandingFaq />
        <LandingCta />
      </main>
      <LandingFooter />
    </>
  );
}
