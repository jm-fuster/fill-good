import { google } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

/**
 * Registry de modelos IA por tarea.
 *
 * Toda llamada a IA de la app pasa por getModel(tarea) — nunca se instancia
 * un modelo directamente en una feature. Así, migrar de proveedor (p. ej. del
 * free tier de Gemini a Claude) es: instalar el paquete del provider, añadir
 * su rama aquí y cambiar las env vars. Prompts, schemas zod y features no
 * cambian.
 *
 * Env vars: AI_MODEL_RECEIPTS, AI_MODEL_MENUS (id del modelo) y
 * GOOGLE_GENERATIVE_AI_API_KEY (la lee el provider de Google automáticamente).
 *
 * Los ids van FIJOS, no por alias `*-latest`: con el alias Google mueve el
 * modelo por debajo y la calidad de la extracción o del menú cambia sin que
 * nadie toque el repo. Aquí subir de versión es un commit.
 */
const DEFAULT_MODELS = {
  /** Extracción de tickets: visión + salida estructurada. Barato y rápido. */
  receipts: "gemini-3.5-flash-lite",
  /**
   * Generación de menús: flash, no flash-lite. Lo que se le pide aquí no es
   * extraer lo que ya está escrito, sino inventar una semana coherente sin
   * repetir y respetando el recetario; y es justo lo que NO tiene red debajo
   * (las reglas de frecuencia, los huecos cerrados y la suma del presupuesto
   * sí son deterministas: `rules.ts`, `week-budget.ts`). Una llamada por
   * semana generada — el ahorro de bajarla a lite era ruido.
   */
  menus: "gemini-3.5-flash",
} as const;

export type AiTask = keyof typeof DEFAULT_MODELS;

const ENV_KEYS: Record<AiTask, string> = {
  receipts: "AI_MODEL_RECEIPTS",
  menus: "AI_MODEL_MENUS",
};

export function getModel(task: AiTask): LanguageModel {
  const modelId = process.env[ENV_KEYS[task]] ?? DEFAULT_MODELS[task];
  return google(modelId);
}
