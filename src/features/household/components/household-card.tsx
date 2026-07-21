"use client";

import { useSyncExternalStore, useTransition } from "react";
import { Copy, LogOut, RefreshCw, Share2 } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
import type { CurrentHousehold, HouseholdMember } from "../queries";
import { leaveHouseholdAction, regenerateInviteCodeAction } from "../actions";
import { TransferOwnershipDrawer } from "./transfer-ownership-drawer";
import { DeleteHouseholdDrawer } from "./delete-household-drawer";

export function HouseholdCard({
  household,
  members,
}: {
  household: CurrentHousehold;
  members: HouseholdMember[];
}) {
  const [pending, startTransition] = useTransition();
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
    const ok = window.confirm(
      "¿Seguro que quieres abandonar este hogar? Dejarás de ver su inventario y sus listas.",
    );
    if (!ok) return;
    startTransition(async () => {
      const result = await leaveHouseholdAction();
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{household.name}</CardTitle>
        <CardDescription>
          Comparte el enlace para que otros miembros se unan a tu hogar con un
          solo toque. También puedes dictarles el código.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
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
              disabled={pending}
            >
              <RefreshCw aria-hidden />
            </Button>
          </div>
        </div>

        <Separator />

        <div>
          <p className="mb-2 text-sm font-medium">
            Miembros ({members.length})
          </p>
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
                <Badge variant={m.role === "owner" ? "default" : "secondary"}>
                  {m.role === "owner" ? "Propietario" : "Miembro"}
                </Badge>
              </li>
            ))}
          </ul>
        </div>

        <Separator />

        {isOwner ? (
          <div className="flex flex-col gap-2">
            {hasOtherMembers ? (
              <>
                <TransferOwnershipDrawer candidates={otherMembers} />
                <p className="text-sm text-muted-foreground">
                  Como propietario, para abandonar el hogar antes debes
                  transferir la propiedad a otro miembro.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Eres el único miembro. Al eliminar el hogar se borrará todo su
                contenido.
              </p>
            )}
            <DeleteHouseholdDrawer householdName={household.name} />
          </div>
        ) : (
          <Button
            variant="destructive"
            onClick={leave}
            disabled={pending}
            className="self-start"
          >
            <LogOut aria-hidden />
            Abandonar hogar
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
