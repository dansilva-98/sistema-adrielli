"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FormMessage = { message: string };
type StaffFormAction = (state: FormMessage, formData: FormData) => Promise<FormMessage>;

export function StaffCredentialForm({
  action,
  submitLabel,
  fields,
  hidden,
  submitClassName,
}: {
  action: StaffFormAction;
  submitLabel: string;
  fields: Array<{
    name: string;
    label: string;
    type: string;
    autoComplete: string;
    inputMode?: "numeric" | "text";
    maxLength?: number;
    autoFocus?: boolean;
  }>;
  hidden?: Array<{ name: string; value: string }>;
  submitClassName?: string;
}) {
  const [state, formAction, pending] = useActionState(action, { message: "" });

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {hidden?.map((field) => (
        <input key={field.name} type="hidden" name={field.name} value={field.value} />
      ))}
      {fields.map((field) => (
        <div key={field.name} className="flex flex-col gap-2">
          <Label htmlFor={field.name}>{field.label}</Label>
          <Input
            id={field.name}
            name={field.name}
            type={field.type}
            autoComplete={field.autoComplete}
            inputMode={field.inputMode}
            maxLength={field.maxLength}
            autoFocus={field.autoFocus}
            required
          />
        </div>
      ))}
      {state.message ? (
        <p className="text-sm" role="status">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className={submitClassName}>
        {pending ? "Aguarde…" : submitLabel}
      </Button>
    </form>
  );
}
