"use client";

import { useActionState } from "react";

import { probeAction } from "./actions";

type ActionState = { ok: boolean; message: string };

const empty: ActionState = { ok: false, message: "" };

export function ProbeForm() {
  const [state, action, pending] = useActionState(probeAction, empty);
  return (
    <form action={action}>
      <button type="submit" disabled={pending}>
        Executar ação
      </button>
      <p data-testid="h1-action-result" role="status">
        {state.message}
      </p>
    </form>
  );
}
