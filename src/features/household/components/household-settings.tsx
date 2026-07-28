"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import {
  Copy,
  HousePlus,
  LogOut,
  RefreshCw,
  Share2,
  TriangleAlert,
  UserMinus,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ResponsiveModal,
  ResponsiveModalClose,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@/components/ui/responsive-modal";
import type { CurrentHousehold, HouseholdMember } from "../queries";
import {
  leaveHouseholdAction,
  regenerateInviteCodeAction,
  removeMemberAction,
} from "../actions";
import {
  HouseholdSwitcherButton,
  type SwitcherHousehold,
} from "./household-switcher";
import { RenameHouseholdDrawer } from "./rename-household-drawer";
import { TransferOwnershipDrawer } from "./transfer-ownership-drawer";
import { OwnerLeaveDrawer } from "./owner-leave-drawer";
import { DeleteHouseholdDrawer } from "./delete-household-drawer";

/**
 * Contenido de /ajustes/hogar. Antes era una única card dentro del índice de
 * Ajustes, donde competía con todo lo demás; aquí es la página completa, dividida
 * en secciones (invitar · miembros · tus hogares · gestión) para que lo
 * irreversible viva al final y no en medio de la pantalla raíz.
 *
 * Todo lo relativo a hogares vive aquí, incluido cambiar de hogar y añadir uno
 * nuevo: en el índice de Ajustes eran dos filas más que competían con las
 * preferencias, y su sitio natural es la pantalla del hogar.
 */
export function HouseholdSettings({
  household,
  households,
  members,
}: {
  household: CurrentHousehold;
  /** Todos los hogares del usuario, para alternar entre ellos. */
  households: SwitcherHousehold[];
  members: HouseholdMember[];
}) {
  const [pending, startTransition] = useTransition();
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [removing, setRemoving] = useState<HouseholdMember | null>(null);
  const [removingPending, startRemoving] = useTransition();
  const isOwner = household.role === "owner";
  const otherMembers = members.filter((m) => !m.isCurrentUser);
  const hasOtherMembers = otherMembers.length > 0;
  // navigator.share solo existe en cliente; useSyncExternalStore devuelve false
  // en servidor e hidratación, evitando el desajuste de hidratación.
  const canShare = useSyncExternalStore(
    () => () => {},
    () => "share" in navigator,
    () => false,
  );

  function inviteUrl() {
    return `${window.location.origin}/unirse/${household.inviteCode}`;
  }

  function copyLink() {
    navigator.clipboard
      .writeText(inviteUrl())
      .then(() => toast.success("Enlace copiado"))
      .catch(() => toast.error("No se pudo copiar"));
  }

  function shareLink() {
    navigator
      .share({
        title: `Únete a ${household.name} en Fill Good`,
        text: "Te invito a nuestro hogar en Fill Good para compartir la compra.",
        url: inviteUrl(),
      })
      .catch(() => {
        // El usuario canceló el diálogo de compartir: no es un error.
      });
  }

  function regenerate() {
    startTransition(async () => {
      const result = await regenerateInviteCodeAction();
      if (result?.error) toast.error(result.error);
      else toast.success("Código regenerado");
    });
  }

  function leave() {
    startTransition(async () => {
      const result = await leaveHouseholdAction();
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setLeaveOpen(false);
    });
  }

  function removeMember() {
    if (!removing) return;
    const userId = removing.userId;
    startRemoving(async () => {
      const result = await removeMemberAction(userId);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Miembro quitado del hogar");
      setRemoving(null);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Invitar al hogar</CardTitle>
          <CardDescription>
            Comparte el enlace para que otros miembros se unan con un solo toque.
            También puedes dictarles el código. Caduca a los 7 días; regenéralo
            cuando quieras con el botón de la derecha.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-1.5 text-sm font-medium">Código de invitación</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg border bg-muted px-3 py-2.5 font-mono text-lg tracking-widest">
              {household.inviteCode}
            </code>
            <Button
              variant="outline"
              size="icon"
              aria-label="Copiar enlace de invitación"
              onClick={copyLink}
            >
              <Copy aria-hidden />
            </Button>
            {canShare ? (
              <Button
                variant="outline"
                size="icon"
                aria-label="Compartir enlace de invitación"
                onClick={shareLink}
              >
                <Share2 aria-hidden />
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="icon"
              aria-label="Regenerar código"
              onClick={regenerate}
              loading={pending}
            >
              <RefreshCw aria-hidden />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Miembros ({members.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2">
            {members.map((m) => (
              <li
                key={m.userId}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="truncate">
                  {m.displayName ?? "Miembro"}
                  {m.isCurrentUser ? (
                    <span className="text-muted-foreground"> (tú)</span>
                  ) : null}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={m.role === "owner" ? "default" : "secondary"}>
                    {m.role === "owner" ? "Propietario" : "Miembro"}
                  </Badge>
                  {isOwner && !m.isCurrentUser ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Quitar a ${m.displayName ?? "este miembro"} del hogar`}
                      onClick={() => setRemoving(m)}
                    >
                      <UserMinus aria-hidden />
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tus hogares</CardTitle>
          <CardDescription>
            {households.length > 1
              ? "El inventario, la lista y los menús que ves son los del hogar activo."
              : "Puedes tener más de un hogar: una segunda residencia, la casa de vacaciones…"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            {/* Con un solo hogar el botón no se renderiza y queda solo el de
                añadir; de ahí que la descripción cambie según el número. */}
            <HouseholdSwitcherButton
              households={households}
              activeId={household.id}
            />
            <Button asChild variant="outline" className="justify-start">
              <Link href="/ajustes/hogar/nuevo">
                <HousePlus aria-hidden />
                Crear o unirse a otro hogar
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gestión del hogar</CardTitle>
          <CardDescription>
            {isOwner
              ? hasOtherMembers
                ? "Puedes ceder la propiedad y seguir en el hogar, o abandonarlo transfiriéndola en el mismo paso."
                : "Eres el único miembro. Al eliminar el hogar se borrará todo su contenido."
              : "Dejarás de ver el inventario y las listas de este hogar."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isOwner ? (
            <div className="flex flex-col gap-2">
              <RenameHouseholdDrawer currentName={household.name} />
              {hasOtherMembers ? (
                <>
                  <TransferOwnershipDrawer candidates={otherMembers} />
                  <OwnerLeaveDrawer candidates={otherMembers} />
                </>
              ) : null}
              <DeleteHouseholdDrawer householdName={household.name} />
            </div>
          ) : (
            <ResponsiveModal open={leaveOpen} onOpenChange={setLeaveOpen}>
              <Button
                variant="destructive"
                onClick={() => setLeaveOpen(true)}
                disabled={pending}
                className="self-start"
              >
                <LogOut aria-hidden />
                Abandonar hogar
              </Button>
              <ResponsiveModalContent>
                <ResponsiveModalHeader>
                  <ResponsiveModalTitle className="flex items-center gap-2">
                    <TriangleAlert
                      className="size-5 text-destructive"
                      aria-hidden
                    />
                    ¿Abandonar este hogar?
                  </ResponsiveModalTitle>
                  <ResponsiveModalDescription>
                    Dejarás de ver su inventario y sus listas. Podrás volver a
                    unirte con el código de invitación.
                  </ResponsiveModalDescription>
                </ResponsiveModalHeader>
                <ResponsiveModalFooter className="gap-2">
                  <Button
                    variant="destructive"
                    onClick={leave}
                    loading={pending}
                  >
                    <LogOut aria-hidden />
                    {pending ? "Abandonando…" : "Abandonar"}
                  </Button>
                  <ResponsiveModalClose asChild>
                    <Button type="button" variant="ghost">
                      Cancelar
                    </Button>
                  </ResponsiveModalClose>
                </ResponsiveModalFooter>
              </ResponsiveModalContent>
            </ResponsiveModal>
          )}
        </CardContent>
      </Card>

      <ResponsiveModal
        open={removing !== null}
        onOpenChange={(o) => {
          if (!o) setRemoving(null);
        }}
      >
        <ResponsiveModalContent>
          <ResponsiveModalHeader>
            <ResponsiveModalTitle className="flex items-center gap-2">
              <TriangleAlert className="size-5 text-destructive" aria-hidden />
              ¿Quitar del hogar?
            </ResponsiveModalTitle>
            <ResponsiveModalDescription>
              {removing?.displayName ?? "Este miembro"} dejará de tener acceso al
              hogar y a sus datos. Se regenerará el código de invitación; podrás
              volver a invitarle cuando quieras.
            </ResponsiveModalDescription>
          </ResponsiveModalHeader>
          <ResponsiveModalFooter className="gap-2">
            <Button
              variant="destructive"
              onClick={removeMember}
              loading={removingPending}
            >
              <UserMinus aria-hidden />
              {removingPending ? "Quitando…" : "Quitar del hogar"}
            </Button>
            <ResponsiveModalClose asChild>
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </ResponsiveModalClose>
          </ResponsiveModalFooter>
        </ResponsiveModalContent>
      </ResponsiveModal>
    </div>
  );
}
