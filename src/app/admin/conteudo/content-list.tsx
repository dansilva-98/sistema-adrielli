"use client";

import { useActionState } from "react";
import Link from "next/link";

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

type FormState =
  | { ok: true; id?: string; version?: number }
  | { ok: false; message: string; field?: string; fields?: Record<string, string> };

type RowAction = (state: FormState, formData: FormData) => Promise<FormState>;
type PlainAction = (formData: FormData) => Promise<FormState>;

export type ContentRow = {
  id: string;
  label: string;
  published: boolean;
  sortOrder: number;
  version: number;
};

const idle: FormState = { ok: false, message: "" };

export function ContentList({
  title,
  empty,
  createHref,
  createLabel,
  editBase,
  kind,
  items,
  deleteAction,
  moveAction,
  publishAction,
}: {
  title: string;
  empty: string;
  createHref: string;
  createLabel: string;
  editBase: string;
  kind: string;
  items: ContentRow[];
  deleteAction: PlainAction;
  moveAction: PlainAction;
  publishAction: RowAction;
}) {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl">{title}</h2>
        {items.length > 0 ? (
          <Button render={<Link href={createHref} />}>Novo</Button>
        ) : null}
      </div>
      {items.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p>{empty}</p>
          <Button render={<Link href={createHref} />}>{createLabel}</Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item, index) => (
            <ContentRowView
              key={item.id}
              item={item}
              kind={kind}
              editHref={`${editBase}/${item.id}`}
              first={index === 0}
              last={index === items.length - 1}
              deleteAction={deleteAction}
              moveAction={moveAction}
              publishAction={publishAction}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ContentRowView({
  item,
  kind,
  editHref,
  first,
  last,
  deleteAction,
  moveAction,
  publishAction,
}: {
  item: ContentRow;
  kind: string;
  editHref: string;
  first: boolean;
  last: boolean;
  deleteAction: PlainAction;
  moveAction: PlainAction;
  publishAction: RowAction;
}) {
  const [state, publish] = useActionState(publishAction, idle);
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">{item.label}</p>
        <p className="text-sm text-muted">
          {item.published ? "Publicado" : "Oculto"} · ordem {item.sortOrder}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" render={<Link href={editHref} />}>
          Editar
        </Button>
        <form action={publish}>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="version" value={item.version} />
          <input
            type="hidden"
            name="published"
            value={item.published ? "false" : "true"}
          />
          <Button type="submit" variant="outline">
            {item.published ? "Ocultar" : "Publicar"}
          </Button>
        </form>
        <form
          action={async (formData) => {
            await moveAction(formData);
          }}
        >
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="version" value={item.version} />
          <input type="hidden" name="direction" value="up" />
          <Button type="submit" variant="outline" disabled={first}>
            Subir
          </Button>
        </form>
        <form
          action={async (formData) => {
            await moveAction(formData);
          }}
        >
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="version" value={item.version} />
          <input type="hidden" name="direction" value="down" />
          <Button type="submit" variant="outline" disabled={last}>
            Descer
          </Button>
        </form>
        <Dialog>
          <DialogTrigger render={<Button type="button" variant="destructive" />}>
            Excluir
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Excluir {kind}</DialogTitle>
              <DialogDescription>
                Excluir {kind} «{item.label}»? Essa exclusão é definitiva.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <form
                action={async (formData) => {
                  await deleteAction(formData);
                }}
              >
                <input type="hidden" name="id" value={item.id} />
                <Button type="submit" variant="destructive">
                  Excluir
                </Button>
              </form>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {!state.ok && state.message ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
    </li>
  );
}
