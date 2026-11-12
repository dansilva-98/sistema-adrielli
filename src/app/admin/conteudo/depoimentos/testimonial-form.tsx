"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CONTENT_LIMITS } from "@/db/content-limits";
import { confirmContentVersion } from "@/modules/content/edit-sync";
import { sitePublicImageUrl } from "@/modules/content/image-path";
import {
  contentCreatedPath,
  contentEditTitle,
  contentListPreview,
} from "@/modules/content/list-copy";
import type { StaffTestimonial } from "@/modules/content/queries";
import {
  createTestimonialAction,
  updateTestimonialAction,
} from "@/modules/content/server/actions";

import {
  CountedField,
  FormNotice,
  SaveButton,
  savedNoticeState,
  useDirtySinceSave,
  useDismissSavedNotice,
  useUnsavedLeave,
} from "../cms-fields";
import { ContentFormChrome, PublishOnSiteField } from "../content-form-chrome";
import { ContentImageField } from "../content-image-field";
import { EditItemGate } from "../edit-item-gate";

const idle = { ok: false as const, message: "" };
const LIST_HREF = "/admin/conteudo/depoimentos";
const CREATE_HREF = "/admin/conteudo/depoimentos/novo";
const IMAGE_WARNING =
  "Antes de enviar, recorte ou cubra nomes, fotos de perfil, números de telefone e qualquer dado da criança. Publique só com a autorização da família (data do consentimento).";

type FormState =
  | { ok: true; id?: string; path?: string; version?: number }
  | { ok: false; message: string; field?: string; fields?: Record<string, string> };

export function TestimonialForm({
  item,
  imageOrigin,
}: {
  item: StaffTestimonial | null;
  imageOrigin: string;
}) {
  const [createEpoch, setCreateEpoch] = useState(0);
  return (
    <TestimonialFormSession
      key={item?.id ?? `new-${createEpoch}`}
      item={item}
      imageOrigin={imageOrigin}
      onCreated={() => setCreateEpoch((current) => current + 1)}
    />
  );
}

function TestimonialFormSession({
  item,
  imageOrigin,
  onCreated,
}: {
  item: StaffTestimonial | null;
  imageOrigin: string;
  onCreated: () => void;
}) {
  const action = item ? updateTestimonialAction : createTestimonialAction;
  const [state, formAction] = useActionState(action, idle);
  const { hideSaved, trackSubmit } = useDismissSavedNotice(state.ok);
  return (
    <EditItemGate
      serverVersion={item?.version ?? null}
      savedVersion={state.ok ? state.version : undefined}
    >
      {({ formKey, onDirty, onDiscard }) => (
        <TestimonialFormFields
          key={formKey}
          item={item}
          imageOrigin={imageOrigin}
          state={state}
          formAction={(formData) => {
            trackSubmit();
            formAction(formData);
          }}
          onCreated={onCreated}
          onDirty={onDirty}
          onDiscard={onDiscard}
          hideSaved={hideSaved}
        />
      )}
    </EditItemGate>
  );
}

function TestimonialFormFields({
  item,
  imageOrigin,
  state,
  formAction,
  onCreated,
  onDirty,
  onDiscard,
  hideSaved,
}: {
  item: StaffTestimonial | null;
  imageOrigin: string;
  state: FormState;
  formAction: (formData: FormData) => void;
  onCreated: () => void;
  onDirty: (dirty: boolean) => void;
  onDiscard: () => void;
  hideSaved: boolean;
}) {
  const router = useRouter();
  const [quote, setQuote] = useState(item?.quote ?? "");
  const [author, setAuthor] = useState(item?.authorLabel ?? "");
  const [consentAt, setConsentAt] = useState(item?.consentAt ?? "");
  const [published, setPublished] = useState(item?.published ?? true);
  const [file, setFile] = useState<File | null>(null);
  const [remove, setRemove] = useState(false);
  const [mountedVersion] = useState(item?.version ?? 0);
  const [confirmedVersion, setConfirmedVersion] = useState(mountedVersion);
  const version = confirmContentVersion(
    confirmedVersion,
    state.ok ? state.version : undefined,
  );
  if (version !== confirmedVersion) setConfirmedVersion(version);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  const kept = !remove && !file ? item?.imagePath : null;
  const src = preview ?? (kept ? sitePublicImageUrl(imageOrigin, kept) : null);
  const hasImage = Boolean(src);
  const dirty = useDirtySinceSave(
    JSON.stringify({
      quote,
      author,
      consentAt,
      published,
      image: file ? "novo" : kept,
    }),
    state.ok ? (state.version ?? state.id ?? "ok") : false,
  );
  useUnsavedLeave(dirty, onDiscard);
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);

  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  useEffect(() => {
    if (state.ok && !item && state.id) {
      onCreated();
      router.push(contentCreatedPath(LIST_HREF));
    }
  }, [item, onCreated, router, state]);

  const fields = state.ok ? {} : (state.fields ?? {});
  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      <ContentFormChrome
        kind="testimonial"
        listHref={LIST_HREF}
        createHref={CREATE_HREF}
        title={
          item
            ? contentEditTitle("testimonial", contentListPreview(item.quote))
            : "Novo depoimento"
        }
        editing={Boolean(item)}
      />
      <p className="text-sm">
        Publique só com autorização por escrito de quem deu o depoimento.
      </p>
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <input type="hidden" name="version" value={version} />
      <input
        type="hidden"
        name="imagePath"
        value={remove ? "" : (item?.imagePath ?? "")}
      />
      <input type="hidden" name="removeImage" value={remove ? "true" : "false"} />
      <input type="hidden" name="published" value={published ? "true" : "false"} />
      <CountedField
        id="depoimento-texto"
        label={hasImage ? "Transcrição do print (obrigatória)" : "Depoimento"}
        help={
          hasImage
            ? "Escreva o que está na imagem. Esse texto é lido por quem usa leitor de tela."
            : "O texto que aparece no site."
        }
        name="quote"
        value={quote}
        max={CONTENT_LIMITS.testimonialQuote}
        error={fields.quote}
        multiline
        onChange={setQuote}
      />
      <CountedField
        id="depoimento-autor"
        label="Quem falou"
        help="Um nome ou uma forma curta de identificar, sem dados desnecessários."
        name="authorLabel"
        value={author}
        max={CONTENT_LIMITS.testimonialAuthor}
        error={fields.authorLabel}
        onChange={setAuthor}
      />
      <ContentImageField
        id="depoimento-imagem"
        label="Imagem (opcional)"
        help="JPEG, PNG ou WebP, até 4 MB. A foto é regravada."
        warning={IMAGE_WARNING}
        src={src}
        alt={quote || "Prévia da imagem"}
        error={fields.image}
        removeTrigger="Remover imagem"
        onFile={(next) => {
          setFile(next);
          setRemove(false);
        }}
        onRemove={() => {
          setFile(null);
          setRemove(true);
        }}
      />
      <div className="flex flex-col gap-1">
        <Label htmlFor="depoimento-consentimento">Data do consentimento</Label>
        <p id="depoimento-consentimento-ajuda" className="text-sm text-muted">
          Se a autorização for retirada, exclua o depoimento. Ocultar não basta.
        </p>
        <Input
          id="depoimento-consentimento"
          name="consentAt"
          type="date"
          value={consentAt}
          aria-invalid={Boolean(fields.consentAt) || undefined}
          aria-describedby="depoimento-consentimento-ajuda"
          onChange={(event) => setConsentAt(event.target.value)}
        />
        {fields.consentAt ? (
          <p className="text-sm text-destructive">{fields.consentAt}</p>
        ) : null}
      </div>
      <PublishOnSiteField checked={published} onChange={setPublished} />
      {dirty && state.ok ? null : (
        <FormNotice
          state={savedNoticeState(state, mountedVersion, Boolean(item), hideSaved)}
        />
      )}
      <SaveButton />
    </form>
  );
}
