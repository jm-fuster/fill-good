import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ScanForm } from "@/features/receipts/components/scan-form";
import { PendingReceipts } from "@/features/receipts/components/pending-receipts";
import { getPendingReceipts } from "@/features/receipts/queries";
import { getAiConsent } from "@/features/ai-consent/queries";
import { AiConsentGate } from "@/features/ai-consent/components/ai-consent-gate";

export const metadata: Metadata = { title: "Añadir ticket" };

export default async function EscanearPage() {
  const [pending, consent] = await Promise.all([
    getPendingReceipts(),
    getAiConsent(),
  ]);

  return (
    <PageContainer>
      <PageHeader
        title="Añadir ticket"
        description="La IA de Google lee los productos y precios; tú los revisas antes de guardar."
      />
      <AiConsentGate consented={consent.consented}>
        <ScanForm />
      </AiConsentGate>
      <PendingReceipts receipts={pending} />
    </PageContainer>
  );
}
