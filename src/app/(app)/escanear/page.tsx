import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ScanForm } from "@/features/receipts/components/scan-form";
import { PendingReceipts } from "@/features/receipts/components/pending-receipts";
import { getPendingReceipts } from "@/features/receipts/queries";
import { getAiConsentHint } from "@/features/ai-consent/queries";
import { AiConsentGate } from "@/features/ai-consent/components/ai-consent-gate";

export const metadata: Metadata = { title: "Añadir ticket" };

export default async function EscanearPage() {
  // El consentimiento sale del token de sesión, no de una llamada a Clerk: era
  // lo más lento de esta pantalla (ver `getAiConsentHint`).
  const [pending, consented] = await Promise.all([
    getPendingReceipts(),
    getAiConsentHint(),
  ]);

  return (
    <PageContainer>
      <PageHeader
        title="Añadir ticket"
        description="La IA de Google lee los productos y precios; tú los revisas antes de guardar."
      />
      <AiConsentGate consented={consented}>
        <ScanForm />
      </AiConsentGate>
      <PendingReceipts receipts={pending} />
    </PageContainer>
  );
}
