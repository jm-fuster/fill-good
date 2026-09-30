"use client";

import { useRef, useState, useTransition } from "react";
import { useUser } from "@clerk/nextjs";
import { Camera, LoaderCircle, Pencil, Trash } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ResponsiveModal,
  ResponsiveModalClose,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@/components/ui/responsive-modal";
import { compressImage } from "@/lib/image";
import { safeAction } from "@/lib/action-error";

import { updateDisplayNameAction } from "../actions";

/**
 * Lado máximo de la foto de perfil. Un avatar no se pinta nunca por encima de
 * ~112px, así que 512 da margen para pantallas densas y deja la subida en unos
 * pocos KB: desde el móvil, mandar los 4 MB del carrete sería tirar datos del
 * usuario a la basura para acabar mostrando un círculo de 56px.
 */
const AVATAR_MAX_SIDE = 512;

/** Iniciales para el hueco sin foto: "Ana Pérez" → "AP". */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = (parts[0][0] ?? "") + (parts.length > 1 ? parts[1][0] : "");
  return letters.toUpperCase();
}

/**
 * Identidad de /perfil: el avatar es el disparador de su propia edición (foto y
 * nombre), sin pasar por Ajustes ni por el <UserProfile/> de Clerk, que rompería
 * el sistema de diseño a media pantalla.
 *
 * Reparto de dónde vive cada dato, a propósito:
 * - **Foto** → Clerk. Es de la cuenta y la misma en todos tus hogares; que la
 *   aloje Clerk nos ahorra bucket, RLS y una columna que mantener.
 * - **Nombre** → `household_members.display_name` del hogar ACTIVO, porque es el
 *   nombre con el que te ven tus convivientes. Es también el único que la app
 *   usa para firmar movimientos, así que editarlo aquí arregla el nombre en todo
 *   el hogar, no solo el título de esta pantalla.
 */
export function ProfileEditor({
  displayName,
  currentName,
  initialImageUrl,
  householdName,
}: {
  /** Nombre que se muestra ahora (puede venir de Clerk o ser un genérico). */
  displayName: string;
  /** display_name real en el hogar activo; null = nunca lo puso. */
  currentName: string | null;
  /** Foto de Clerk, o null si no ha subido ninguna (entonces, iniciales). */
  initialImageUrl: string | null;
  /** Hogar activo; null = no pertenece a ninguno, no hay nombre que editar. */
  householdName: string | null;
}) {
  const { user } = useUser();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [savingName, startSaveName] = useTransition();

  // Clerk mantiene `user` al día en el cliente, así que tras subir la foto el
  // avatar se actualiza sin recargar. El valor del servidor es solo el arranque
  // (evita el hueco de iniciales durante la hidratación).
  const imageUrl = user?.hasImage ? user.imageUrl : (initialImageUrl ?? null);
  const busy = uploading || removing;

  async function changePhoto(file: File) {
    setError(null);
    setUploading(true);
    try {
      const blob = await compressImage(file, AVATAR_MAX_SIDE);
      await user?.setProfileImage({
        file: new File([blob], "avatar.jpg", { type: "image/jpeg" }),
      });
      toast.success("Foto actualizada");
    } catch {
      setError("No se pudo subir la foto. Prueba con otra imagen.");
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto() {
    setError(null);
    setRemoving(true);
    try {
      await user?.setProfileImage({ file: null });
      toast.success("Foto quitada");
    } catch {
      setError("No se pudo quitar la foto. Inténtalo de nuevo.");
    } finally {
      setRemoving(false);
    }
  }

  function saveName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startSaveName(async () => {
      const result = await safeAction(
        updateDisplayNameAction(formData),
        "No se pudo guardar el nombre.",
      );
      if (result?.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setOpen(false);
      toast.success("Nombre actualizado");
    });
  }

  const initials = initialsOf(currentName ?? displayName);

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Editar tu foto y tu nombre"
        className="relative inline-flex shrink-0 rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Avatar className="size-14">
          {imageUrl ? <AvatarImage src={imageUrl} alt="" /> : null}
          <AvatarFallback className="text-base font-medium">
            {initials}
          </AvatarFallback>
        </Avatar>
        {/* Insignia propia en vez de <AvatarBadge>: sus tamaños los fija el
            data-size del Avatar con más especificidad que una clase suelta, y
            aquí hace falta un lápiz legible sobre un avatar de 56px. */}
        <span
          aria-hidden
          className="absolute -right-0.5 -bottom-0.5 inline-flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background"
        >
          <Pencil className="size-3" />
        </span>
      </button>

      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>Tu perfil</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            {householdName
              ? `La foto es de tu cuenta. El nombre es el que ven en ${householdName}.`
              : "La foto es de tu cuenta y te acompaña en todos tus hogares."}
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        <div className="flex items-center gap-4 px-4">
          <button
            type="button"
            disabled={busy}
            aria-label={imageUrl ? "Cambiar foto" : "Añadir foto"}
            onClick={() => fileRef.current?.click()}
            className="relative inline-flex shrink-0 rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-70"
          >
            <Avatar className="size-20">
              {imageUrl ? <AvatarImage src={imageUrl} alt="" /> : null}
              <AvatarFallback className="text-xl font-medium">
                {initials}
              </AvatarFallback>
            </Avatar>
            {/* Mismo lenguaje visual que el avatar de /perfil: la insignia
                señala que la foto entera es el disparador, así que no hace
                falta un botón de texto aparte para "cambiar foto". */}
            <span
              aria-hidden
              className="absolute -right-0.5 -bottom-0.5 inline-flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background"
            >
              {uploading ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <Camera className="size-3.5" />
              )}
            </span>
          </button>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                // Se limpia el input para que elegir la MISMA foto otra vez
                // (tras un error) vuelva a disparar onChange.
                event.target.value = "";
                if (file) void changePhoto(file);
              }}
            />
            <p className="text-xs text-muted-foreground text-pretty">
              Toca la foto para {imageUrl ? "cambiarla" : "añadirla"}.
            </p>
            {imageUrl ? (
              <Button
                type="button"
                variant="ghost"
                loading={removing}
                disabled={busy}
                onClick={() => void removePhoto()}
                className="justify-start text-muted-foreground"
              >
                <Trash aria-hidden />
                Quitar foto
              </Button>
            ) : null}
          </div>
        </div>

        {householdName ? (
          <form onSubmit={saveName} className="mt-4 flex flex-col">
            <div className="flex flex-col gap-2 px-4">
              <Label htmlFor="profile-display-name">Tu nombre</Label>
              <Input
                id="profile-display-name"
                name="name"
                defaultValue={currentName ?? ""}
                maxLength={80}
                required
                autoComplete="name"
              />
              <p className="text-xs text-muted-foreground text-pretty">
                Con este nombre firmas lo que añades al inventario y a la lista.
              </p>
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
            <ResponsiveModalFooter>
              <Button type="submit" loading={savingName} disabled={busy}>
                {savingName ? "Guardando…" : "Guardar nombre"}
              </Button>
              <ResponsiveModalClose asChild>
                <Button type="button" variant="ghost">
                  Cancelar
                </Button>
              </ResponsiveModalClose>
            </ResponsiveModalFooter>
          </form>
        ) : (
          <ResponsiveModalFooter>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <ResponsiveModalClose asChild>
              <Button type="button" variant="outline">
                Cerrar
              </Button>
            </ResponsiveModalClose>
          </ResponsiveModalFooter>
        )}
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
