"use client";

import { useState, type ReactNode } from "react";

import { AiConsentCard } from "./ai-consent-card";

/**
 * Muestra sus `children` solo si el usuario ha consentido el procesamiento con
 * IA; si no, presenta el aviso de primera capa. Al aceptar, revela los children
 * sin recargar (el consentimiento ya quedó registrado en el servidor).
 *
 * Uso: envolver la superficie que dispara IA (p. ej. el formulario de escaneo).
 * `consented` llega del servidor vía `getAiConsent()`.
 */
export function AiConsentGate({
  consented,
  children,
}: {
  consented: boolean;
  children: ReactNode;
}) {
  const [granted, setGranted] = useState(consented);

  if (granted) return <>{children}</>;

  return <AiConsentCard onAccepted={() => setGranted(true)} />;
}
