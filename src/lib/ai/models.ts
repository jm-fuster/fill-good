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
 */
const DEFAULT_MODELS = {
  /** Extracción de tickets: visión + salida estructurada. Barato y rápido. */
  receipts: "gemini-flash-lite-latest",
  /** Generación de menús: razonamiento algo mayor, streaming. */
  menus: "gemini-flash-latest",
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
