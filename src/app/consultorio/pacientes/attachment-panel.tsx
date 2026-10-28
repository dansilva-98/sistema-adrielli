"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { idleClinicAction } from "@/modules/clinic/form-state";
import {
  ATTACHMENT_CATEGORIES,
  attachmentCategoryLabel,
  formatBytes,
  formatClinicTimestamp,
  type AttachmentCategory,
} from "@/modules/clinic/format";
import type { PatientAttachment } from "@/modules/clinic/patients";
import {
  confirmAttachmentUploadAction,
  deleteAttachmentAction,
  openAttachmentAction,
  prepareAttachmentUploadAction,
} from "@/modules/clinic/server/actions";

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function AttachmentPanel({
  patientId,
  attachments,
}: {
  patientId: string;
  attachments: PatientAttachment[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <UploadForm patientId={patientId} />
      {attachments.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
          Nenhum anexo.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {attachments.map((attachment) => (
            <AttachmentCard
              key={attachment.id}
              patientId={patientId}
              attachment={attachment}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function UploadForm({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [category, setCategory] = useState<AttachmentCategory>("CLINICAL_REPORT");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fileInput = form.elements.namedItem("file");
    const file = fileInput instanceof HTMLInputElement ? fileInput.files?.[0] : undefined;
    if (!file) {
      setMessage("Escolha um arquivo.");
      return;
    }
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const mime = MIME_BY_EXTENSION[extension];
    if (!mime) {
      setMessage("Envie um PDF ou uma imagem JPG, PNG ou WebP.");
      return;
    }
    setPending(true);
    setMessage("");
    const prepareData = new FormData();
    prepareData.set("patientId", patientId);
    prepareData.set("mime", mime);
    prepareData.set("size", String(file.size));
    const prepared = await prepareAttachmentUploadAction(prepareData);
    if (!prepared.ok) {
      setPending(false);
      setMessage(prepared.message);
      return;
    }
    const upload = await fetch(prepared.signedUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${prepared.token}`,
        "Content-Type": mime,
        "x-upsert": "false",
      },
      body: file,
    });
    if (!upload.ok) {
      setPending(false);
      setMessage("Não foi possível enviar o arquivo.");
      return;
    }
    const confirmData = new FormData();
    confirmData.set("patientId", patientId);
    confirmData.set("receipt", prepared.receipt);
    confirmData.set("originalName", file.name);
    confirmData.set("category", category);
    const confirmed = await confirmAttachmentUploadAction(idleClinicAction, confirmData);
    setPending(false);
    if (!confirmed.ok) {
      setMessage(confirmed.message);
      return;
    }
    form.reset();
    setMessage("");
    router.refresh();
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={onSubmit}>
      {message ? (
        <p className="text-sm text-support" role="status">
          {message}
        </p>
      ) : null}
      <label className="flex flex-col gap-1 text-sm">
        Arquivo
        <input
          name="file"
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="h-11 text-base"
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Categoria
        <select
          name="category"
          className="h-11 rounded-lg border border-border bg-surface px-3 text-base"
          value={category}
          onChange={(event) => setCategory(event.target.value as AttachmentCategory)}
        >
          {ATTACHMENT_CATEGORIES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" className="h-11" disabled={pending}>
        {pending ? "Enviando..." : "Enviar anexo"}
      </Button>
    </form>
  );
}

function AttachmentCard({
  patientId,
  attachment,
}: {
  patientId: string;
  attachment: PatientAttachment;
}) {
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const [opening, setOpening] = useState(false);
  const [state, action, pending] = useActionState(
    deleteAttachmentAction,
    idleClinicAction,
  );

  async function open() {
    const popup = window.open("", "_blank");
    setOpening(true);
    setMessage("");
    const result = await openAttachmentAction(attachment.id);
    setOpening(false);
    if (!result.ok) {
      popup?.close();
      setMessage(result.message);
      return;
    }
    if (!popup) {
      window.location.assign(result.url);
      return;
    }
    try {
      popup.opener = null;
      popup.location.replace(result.url);
    } catch {
      popup.close();
      window.location.assign(result.url);
    }
  }

  return (
    <li className="rounded-xl border border-border p-4">
      <p className="font-medium break-words">{attachment.originalName}</p>
      <p className="text-sm text-muted">
        {attachmentCategoryLabel(attachment.category)} ·{" "}
        {formatBytes(attachment.sizeBytes)} ·{" "}
        {formatClinicTimestamp(attachment.createdAt)} · {attachment.uploadedBy}
      </p>
      {message || state.message ? (
        <p className="mt-2 text-sm text-support" role="status">
          {message || state.message}
        </p>
      ) : null}
      <div className="mt-3 flex flex-col gap-2">
        <Button type="button" className="h-11" onClick={open} disabled={opening}>
          {opening ? "Abrindo..." : "Abrir"}
        </Button>
        {confirming ? (
          <form action={action} className="flex flex-col gap-2">
            <input type="hidden" name="patientId" value={patientId} />
            <input type="hidden" name="attachmentId" value={attachment.id} />
            <input type="hidden" name="confirm" value="sim" />
            <p className="text-sm">
              Excluir este anexo? Ele sai da lista e fica na lixeira.
            </p>
            <Button
              type="submit"
              variant="destructive"
              className="h-11"
              disabled={pending}
            >
              Confirmar exclusão
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => setConfirming(false)}
            >
              Cancelar
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => setConfirming(true)}
          >
            Excluir
          </Button>
        )}
      </div>
    </li>
  );
}
