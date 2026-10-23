"use client";

import { useActionState } from "react";

import { acceptUpload } from "./actions";

type UploadState = { ok: boolean; message: string };

const empty: UploadState = { ok: false, message: "" };

export function UploadForm() {
  const [state, action, pending] = useActionState(acceptUpload, empty);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label htmlFor="h1-file">Arquivo</label>
      <input id="h1-file" name="file" type="file" required />
      <button type="submit" disabled={pending}>
        {pending ? "Enviando…" : "Enviar"}
      </button>
      <p data-testid="h1-upload-result" role="status">
        {state.message}
      </p>
    </form>
  );
}
