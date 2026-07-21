"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  deletePushSubscriptionAction,
  getMyPushPrefsAction,
  savePushSubscriptionAction,
  updatePushPrefsAction,
  type PushPrefs,
} from "../actions";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const DEFAULT_PREFS: PushPrefs = { expiry: true, price: true, restock: true };

const PREF_LABELS: { key: keyof PushPrefs; label: string; hint: string }[] = [
  { key: "expiry", label: "Caducidades", hint: "Resumen diario de lo que caduca" },
  { key: "price", label: "Avisos de precio", hint: "Cuando sube algo habitual" },
  { key: "restock", label: "Reposición", hint: "Cuando toca reponer algo" },
];

/** base64url (clave VAPID) → Uint8Array que espera pushManager.subscribe. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function PushCard() {
  const [mounted, setMounted] = useState(false);
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<PushPrefs>(DEFAULT_PREFS);
  const [busy, startBusy] = useTransition();

  useEffect(() => {
    let active = true;
    async function init() {
      const ok =
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;
      if (!active) return;
      setSupported(ok);
      setMounted(true);
      if (!ok) return;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!active || !sub) return;
      const saved = await getMyPushPrefsAction(sub.endpoint);
      if (!active) return;
      setEndpoint(sub.endpoint);
      setEnabled(true);
      if (saved) setPrefs(saved);
    }
    init();
    return () => {
      active = false;
    };
  }, []);

  const hasKey = VAPID_PUBLIC_KEY.length > 0;

  function enable() {
    startBusy(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          toast.error("Permiso de notificaciones denegado.");
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
        const json = sub.toJSON();
        const res = await savePushSubscriptionAction({
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
          prefs: DEFAULT_PREFS,
        });
        if (res.error) {
          toast.error(res.error);
          return;
        }
        setEndpoint(sub.endpoint);
        setPrefs(DEFAULT_PREFS);
        setEnabled(true);
        toast.success("Notificaciones activadas");
      } catch {
        toast.error("No se pudieron activar las notificaciones.");
      }
    });
  }

  function disable() {
    startBusy(async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
        if (endpoint) await deletePushSubscriptionAction(endpoint);
        setEnabled(false);
        setEndpoint(null);
        toast.success("Notificaciones desactivadas");
      } catch {
        toast.error("No se pudieron desactivar.");
      }
    });
  }

  function togglePref(key: keyof PushPrefs, value: boolean) {
    if (!endpoint) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    startBusy(async () => {
      const res = await updatePushPrefsAction(endpoint, next);
      if (res.error) {
        toast.error(res.error);
        setPrefs(prefs);
      }
    });
  }

  // Antes de montar en cliente no renderizamos nada (evita desajuste de hidratación).
  if (!mounted) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="size-4" aria-hidden />
          Notificaciones
        </CardTitle>
        <CardDescription>
          Avisos en el móvil sin abrir la app. Puedes elegir qué recibir.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!supported ? (
          <p className="text-sm text-muted-foreground">
            Este dispositivo o navegador no admite notificaciones push.
          </p>
        ) : !hasKey ? (
          <p className="text-sm text-muted-foreground">
            Las notificaciones aún no están configuradas en el servidor.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="push-enabled" className="flex flex-col gap-0.5">
                <span>Activar en este dispositivo</span>
                <span className="text-sm font-normal text-muted-foreground">
                  {enabled ? "Recibiendo avisos aquí" : "Desactivadas"}
                </span>
              </Label>
              <Switch
                id="push-enabled"
                checked={enabled}
                disabled={busy}
                onCheckedChange={(v) => (v ? enable() : disable())}
              />
            </div>

            {enabled ? (
              <div className="flex flex-col gap-2 border-t pt-3">
                {PREF_LABELS.map((p) => (
                  <div
                    key={p.key}
                    className="flex items-center justify-between gap-3"
                  >
                    <Label
                      htmlFor={`pref-${p.key}`}
                      className="flex flex-col gap-0.5 font-normal"
                    >
                      <span>{p.label}</span>
                      <span className="text-sm text-muted-foreground">
                        {p.hint}
                      </span>
                    </Label>
                    <Switch
                      id={`pref-${p.key}`}
                      checked={prefs[p.key]}
                      disabled={busy}
                      onCheckedChange={(v) => togglePref(p.key, v)}
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
