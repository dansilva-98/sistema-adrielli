import type postgres from "postgres";

import { recordAudit } from "@/modules/audit/record";

import {
  issueUploadReceipt,
  newAttachmentPath,
  readUploadReceipt,
  type UploadReceipt,
} from "./attachment-receipt";
import {
  ATTACHMENT_MAX_BYTES,
  AttachmentFileError,
  isStoredMime,
  prepareStoredBytes,
  sha256Hex,
  type StoredMime,
} from "./file-bytes";
import type { AttachmentCategory } from "./format";
import { ClinicRuleError, type Actor } from "./patients";
import type { ClinicObjectStore } from "./storage";

type Database = postgres.Sql;

const DOWNLOAD_SECONDS = 60;

function cleanName(value: string): string {
  const name = value.replace(/[\\/]/g, " ").replace(/\s+/g, " ").trim();
  if (name.length < 1 || name.length > 200) throw new ClinicRuleError("type");
  return name;
}

function fileError(error: unknown): never {
  if (error instanceof AttachmentFileError) {
    throw new ClinicRuleError(error.code);
  }
  throw error;
}

export async function prepareAttachmentUpload(
  db: Database,
  actor: Actor,
  store: ClinicObjectStore,
  secret: string,
  input: { patientId: string; mime: string; size: number },
  now: number,
): Promise<{ signedUrl: string; token: string; receipt: string }> {
  if (!isStoredMime(input.mime) || input.size < 1 || input.size > ATTACHMENT_MAX_BYTES) {
    throw new ClinicRuleError(input.size > ATTACHMENT_MAX_BYTES ? "size" : "type");
  }
  const patients = await db<{ id: string }[]>`
    select id from clinic.patients where id = ${input.patientId}::uuid
  `;
  if (!patients[0]) throw new ClinicRuleError("not-found");
  const path = newAttachmentPath(input.patientId, input.mime);
  const upload = await store.createUpload(path);
  return {
    signedUrl: upload.signedUrl,
    token: upload.token,
    receipt: issueUploadReceipt(
      secret,
      { patientId: input.patientId, path, mime: input.mime, actorId: actor.userId },
      now,
    ),
  };
}

export async function confirmAttachmentUpload(
  db: Database,
  actor: Actor,
  store: ClinicObjectStore,
  secret: string,
  input: {
    receipt: string;
    originalName: string;
    category: AttachmentCategory;
    now: number;
  },
): Promise<void> {
  const receipt = readUploadReceipt(secret, input.receipt, input.now);
  if (!receipt || receipt.actorId !== actor.userId)
    throw new ClinicRuleError("not-found");
  const originalName = cleanName(input.originalName);
  const stored = await store.read(receipt.path);
  if (!stored) throw new ClinicRuleError("not-found");

  let prepared: Uint8Array;
  try {
    prepared = await prepareStoredBytes(stored, receipt.mime);
  } catch (error) {
    await store.remove(receipt.path);
    fileError(error);
  }
  if (
    prepared.byteLength !== stored.byteLength ||
    sha256Hex(prepared) !== sha256Hex(stored)
  ) {
    await store.write(receipt.path, prepared, receipt.mime);
  }

  try {
    await insertAttachment(db, actor, receipt, originalName, input.category, prepared);
  } catch (error) {
    await store.remove(receipt.path);
    throw error;
  }
}

async function insertAttachment(
  db: Database,
  actor: Actor,
  receipt: UploadReceipt,
  originalName: string,
  category: AttachmentCategory,
  bytes: Uint8Array,
): Promise<void> {
  const digest = sha256Hex(bytes);
  await db.begin(async (tx) => {
    const patients = await tx<{ id: string }[]>`
      select id from clinic.patients where id = ${receipt.patientId}::uuid
    `;
    if (!patients[0]) throw new ClinicRuleError("not-found");
    const rows = await tx<{ id: string }[]>`
      insert into clinic.patient_attachments (
        patient_id, storage_path, original_name, mime_type, size_bytes, sha256,
        category, uploaded_by
      )
      values (
        ${receipt.patientId}::uuid,
        ${receipt.path},
        ${originalName},
        ${receipt.mime},
        ${bytes.byteLength},
        ${digest},
        ${category}::clinic.attachment_category,
        ${actor.userId}::uuid
      )
      returning id
    `;
    const attachmentId = rows[0]?.id;
    if (!attachmentId) throw new ClinicRuleError("not-found");
    await recordAudit(
      {
        action: "clinic.attachment.uploaded",
        actorUserId: actor.userId,
        entityType: "attachment",
        entityId: attachmentId,
        ip: actor.ip,
        metadata: {},
      },
      tx,
    );
  });
}

export async function openAttachment(
  db: Database,
  actor: Actor,
  store: ClinicObjectStore,
  attachmentId: string,
): Promise<string> {
  const rows = await db<{ storage_path: string }[]>`
    select storage_path
    from clinic.patient_attachments
    where id = ${attachmentId}::uuid
      and deleted_at is null
  `;
  const path = rows[0]?.storage_path;
  if (!path) throw new ClinicRuleError("not-found");
  const url = await store.signedDownload(path, DOWNLOAD_SECONDS);
  await recordAudit(
    {
      action: "clinic.attachment.downloaded",
      actorUserId: actor.userId,
      entityType: "attachment",
      entityId: attachmentId,
      ip: actor.ip,
      metadata: {},
    },
    db,
  );
  return url;
}

export async function deleteAttachment(
  db: Database,
  actor: Actor,
  attachmentId: string,
): Promise<void> {
  await db.begin(async (tx) => {
    const rows = await tx<{ id: string }[]>`
      update clinic.patient_attachments
      set deleted_at = now(), deleted_by = ${actor.userId}::uuid
      where id = ${attachmentId}::uuid
        and deleted_at is null
      returning id
    `;
    if (!rows[0]) throw new ClinicRuleError("not-found");
    await recordAudit(
      {
        action: "clinic.attachment.deleted",
        actorUserId: actor.userId,
        entityType: "attachment",
        entityId: attachmentId,
        ip: actor.ip,
        metadata: {},
      },
      tx,
    );
  });
}

export function declaredMime(value: string): StoredMime | null {
  return isStoredMime(value) ? value : null;
}
