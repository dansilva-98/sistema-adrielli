"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  STAFF_ROLES,
  STAFF_ROLE_LABELS,
  type StaffRole,
} from "@/modules/identity/access";
import type { StaffListItem } from "@/modules/identity/staff-list";

import { inviteStaffAction, setStaffAccessAction, updateRolesAction } from "./actions";
import { emptyState, type StaffFormState } from "./staff-form";

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

function RoleFields({ selected }: { selected: readonly StaffRole[] }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">Papéis</legend>
      {STAFF_ROLES.map((role) => (
        <Label key={role}>
          <input
            type="checkbox"
            name="roles"
            value={role}
            defaultChecked={selected.includes(role)}
            className="size-4 accent-primary"
          />
          {STAFF_ROLE_LABELS[role]}
        </Label>
      ))}
    </fieldset>
  );
}

function FormStatus({ state }: { state: StaffFormState }) {
  if (!state.message) return null;
  return (
    <p role="status" className="text-sm">
      {state.message}
    </p>
  );
}

function InviteForm() {
  const [state, action] = useActionState(inviteStaffAction, emptyState);
  return (
    <form action={action} className="flex max-w-md flex-col gap-3">
      <h2 className="text-lg">Convidar</h2>
      <Label htmlFor="invite-name">Nome</Label>
      <Input id="invite-name" name="name" autoComplete="name" required />
      <Label htmlFor="invite-email">E-mail</Label>
      <Input id="invite-email" name="email" type="email" autoComplete="off" required />
      <RoleFields selected={[]} />
      <FormStatus state={state} />
      <SubmitButton label="Enviar convite" pendingLabel="Enviando…" />
    </form>
  );
}

function RoleDialog({ user }: { user: StaffListItem }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(updateRolesAction, emptyState);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>Alterar papéis</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Alterar papéis</DialogTitle>
          <DialogDescription>Confirme os papéis de {user.displayName}.</DialogDescription>
        </DialogHeader>
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="userId" value={user.id} />
          <RoleFields selected={user.roles} />
          <FormStatus state={state} />
          <DialogFooter>
            <SubmitButton label="Confirmar" pendingLabel="Salvando…" />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AccessDialog({ user, actorId }: { user: StaffListItem; actorId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(setStaffAccessAction, emptyState);
  if (user.id === actorId && !user.disabled) return null;
  const disable = !user.disabled;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={disable ? "destructive" : "outline"} />}>
        {disable ? "Desativar" : "Reativar"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{disable ? "Desativar usuário" : "Reativar usuário"}</DialogTitle>
          <DialogDescription>
            {disable
              ? `Desativar ${user.displayName} encerra o acesso imediatamente.`
              : `Reativar ${user.displayName} devolve o acesso.`}
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="userId" value={user.id} />
          <input type="hidden" name="disabled" value={disable ? "true" : "false"} />
          <FormStatus state={state} />
          <DialogFooter>
            <SubmitButton label="Confirmar" pendingLabel="Salvando…" />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function UsersPanel({
  items,
  actorId,
}: {
  items: readonly StaffListItem[];
  actorId: string;
}) {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="mb-4 text-lg">Usuários</h2>
        {items.length === 0 ? (
          <p>Nenhum usuário da equipe.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Papéis</TableHead>
                <TableHead>MFA</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Último login</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.displayName}</TableCell>
                  <TableCell className="max-w-48 whitespace-normal break-all">
                    {user.email}
                  </TableCell>
                  <TableCell className="whitespace-normal">{user.roleLabels}</TableCell>
                  <TableCell>{user.mfaActive ? "sim" : "não"}</TableCell>
                  <TableCell>{user.disabled ? "desativado" : "ativo"}</TableCell>
                  <TableCell>{user.lastLogin}</TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="flex flex-wrap gap-2">
                      <RoleDialog user={user} />
                      <AccessDialog user={user} actorId={actorId} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      <InviteForm />
    </div>
  );
}
