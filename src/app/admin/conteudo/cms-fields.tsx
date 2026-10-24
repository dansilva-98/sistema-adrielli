"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const SAVED_MESSAGE = "Salvo. O site já mostra a alteração.";

export function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando…" : "Salvar"}
    </Button>
  );
}

export function FormNotice({
  state,
}: {
  state: { ok: boolean; message?: string; fields?: Record<string, string> };
}) {
  if (state.ok) {
    return (
      <p role="status" className="text-sm">
        {SAVED_MESSAGE}
      </p>
    );
  }
  if (!state.message || state.fields) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {state.message}
    </p>
  );
}

export function CountedField({
  id,
  label,
  help,
  name,
  value,
  max,
  error,
  multiline = false,
  onChange,
}: {
  id: string;
  label: string;
  help: string;
  name: string;
  value: string;
  max: number;
  error?: string;
  multiline?: boolean;
  onChange: (value: string) => void;
}) {
  const helpId = `${id}-ajuda`;
  const countId = `${id}-contador`;
  const errorId = `${id}-erro`;
  const describedBy = error ? `${helpId} ${countId} ${errorId}` : `${helpId} ${countId}`;
  const shared = {
    id,
    name,
    value,
    maxLength: max,
    "aria-invalid": Boolean(error) || undefined,
    "aria-describedby": describedBy,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(event.target.value),
  };
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <p id={helpId} className="text-sm text-muted">
        {help}
      </p>
      {multiline ? <Textarea {...shared} /> : <Input {...shared} />}
      <p id={countId} className="text-xs text-muted">
        {value.length}/{max}
      </p>
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function useDirtySinceSave(snapshot: string, saved: boolean): boolean {
  const [baseline, setBaseline] = useState(snapshot);
  const [marked, setMarked] = useState(false);
  if (saved && !marked) {
    setMarked(true);
    setBaseline(snapshot);
  } else if (!saved && marked) {
    setMarked(false);
  }
  return snapshot !== baseline;
}

export function useUnsavedLeave(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const leave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const click = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest("a");
      if (!anchor || anchor.target === "_blank") return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (!window.confirm("Há alterações não salvas. Sair mesmo assim?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", leave);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", leave);
      document.removeEventListener("click", click, true);
    };
  }, [dirty]);
}
