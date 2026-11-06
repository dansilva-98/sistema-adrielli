"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { CONTENT_LIMITS } from "@/db/content-limits";
import { confirmContentVersion } from "@/modules/content/edit-sync";
import { contentCreatedPath, contentEditTitle } from "@/modules/content/list-copy";
import type { StaffFaq } from "@/modules/content/queries";
import { createFaqAction, updateFaqAction } from "@/modules/content/server/actions";

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
const LIST_HREF = "/admin/conteudo/perguntas";
const CREATE_HREF = "/admin/conteudo/perguntas/novo";

type FormState =
  | { ok: true; id?: string; path?: string; version?: number }
  | { ok: false; message: string; field?: string; fields?: Record<string, string> };

export function FaqForm({ item }: { item: StaffFaq | null }) {
  const [createEpoch, setCreateEpoch] = useState(0);
  return (
    <FaqFormSession
      key={item?.id ?? `new-${createEpoch}`}
      item={item}
      onCreated={() => setCreateEpoch((current) => current + 1)}
    />
  );
}

function FaqFormSession({
  item,
  onCreated,
}: {
  item: StaffFaq | null;
  onCreated: () => void;
}) {
  const action = item ? updateFaqAction : createFaqAction;
  const [state, formAction] = useActionState(action, idle);
  const { hideSaved, trackSubmit } = useDismissSavedNotice(state.ok);
  return (
    <EditItemGate
      serverVersion={item?.version ?? null}
      savedVersion={state.ok ? state.version : undefined}
    >
      {({ formKey, onDirty, onDiscard }) => (
        <FaqFormFields
          key={formKey}
          item={item}
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

function FaqFormFields({
  item,
  state,
  formAction,
  onCreated,
  onDirty,
  onDiscard,
  hideSaved,
}: {
  item: StaffFaq | null;
  state: FormState;
  formAction: (formData: FormData) => void;
  onCreated: () => void;
  onDirty: (dirty: boolean) => void;
  onDiscard: () => void;
  hideSaved: boolean;
}) {
  const router = useRouter();
  const [question, setQuestion] = useState(item?.question ?? "");
  const [answer, setAnswer] = useState(item?.answer ?? "");
  const [published, setPublished] = useState(item?.published ?? true);
  const [mountedVersion] = useState(item?.version ?? 0);
  const [confirmedVersion, setConfirmedVersion] = useState(mountedVersion);
  const version = confirmContentVersion(
    confirmedVersion,
    state.ok ? state.version : undefined,
  );
  if (version !== confirmedVersion) setConfirmedVersion(version);
  const dirty = useDirtySinceSave(
    JSON.stringify({ question, answer, published }),
    state.ok ? (state.version ?? state.id ?? "ok") : false,
  );
  useUnsavedLeave(dirty, onDiscard);
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
        kind="faq"
        listHref={LIST_HREF}
        createHref={CREATE_HREF}
        title={item ? contentEditTitle("faq", item.question) : "Nova pergunta"}
        editing={Boolean(item)}
      />
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="published" value={published ? "true" : "false"} />
      <CountedField
        id="pergunta-titulo"
        label="Pergunta"
        help="A pergunta que a pessoa vê no site."
        name="question"
        value={question}
        max={CONTENT_LIMITS.faqQuestion}
        error={fields.question}
        onChange={setQuestion}
      />
      <CountedField
        id="pergunta-resposta"
        label="Resposta"
        help="A resposta, em Markdown simples."
        name="answer"
        value={answer}
        max={CONTENT_LIMITS.faqAnswer}
        error={fields.answer}
        multiline
        onChange={setAnswer}
      />
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
