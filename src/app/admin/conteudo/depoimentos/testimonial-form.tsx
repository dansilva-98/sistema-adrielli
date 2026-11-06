"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CONTENT_LIMITS } from "@/db/content-limits";
import { confirmContentVersion } from "@/modules/content/edit-sync";
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
import { EditItemGate } from "../edit-item-gate";

const idle = { ok: false as const, message: "" };
const LIST_HREF = "/admin/conteudo/depoimentos";
const CREATE_HREF = "/admin/conteudo/depoimentos/novo";

type FormState =
  | { ok: true; id?: string; path?: string; version?: number }
  | { ok: false; message: string; field?: string; fields?: Record<string, string> };

export function TestimonialForm({ item }: { item: StaffTestimonial | null }) {
  const [createEpoch, setCreateEpoch] = useState(0);
  return (
    <TestimonialFormSession
      key={item?.id ?? `new-${createEpoch}`}
      item={item}
      onCreated={() => setCreateEpoch((current) => current + 1)}
    />
  );
}

function TestimonialFormSession({
  item,
  onCreated,
}: {
  item: StaffTestimonial | null;
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
      {({ formKey, onDirty }) => (
        <TestimonialFormFields
          key={formKey}
          item={item}
          state={state}
          formAction={(formData) => {
            trackSubmit();
            formAction(formData);
          }}
          onCreated={onCreated}
          onDirty={onDirty}
          hideSaved={hideSaved}
        />
      )}
    </EditItemGate>
  );
}

function TestimonialFormFields({
  item,
  state,
  formAction,
  onCreated,
  onDirty,
  hideSaved,
}: {
  item: StaffTestimonial | null;
  state: FormState;
  formAction: (formData: FormData) => void;
  onCreated: () => void;
  onDirty: (dirty: boolean) => void;
  hideSaved: boolean;
}) {
  const router = useRouter();
  const [quote, setQuote] = useState(item?.quote ?? "");
  const [author, setAuthor] = useState(item?.authorLabel ?? "");
  const [consentAt, setConsentAt] = useState(item?.consentAt ?? "");
  const [published, setPublished] = useState(item?.published ?? true);
  const [mountedVersion] = useState(item?.version ?? 0);
  const [confirmedVersion, setConfirmedVersion] = useState(mountedVersion);
  const version = confirmContentVersion(
    confirmedVersion,
    state.ok ? state.version : undefined,
  );
  if (version !== confirmedVersion) setConfirmedVersion(version);
  const dirty = useDirtySinceSave(
    JSON.stringify({ quote, author, consentAt, published }),
    state.ok ? (state.version ?? state.id ?? "ok") : false,
  );
  useUnsavedLeave(dirty);
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);

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
      <input type="hidden" name="published" value={published ? "true" : "false"} />
      <CountedField
        id="depoimento-texto"
        label="Depoimento"
        help="O texto que aparece no site."
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
