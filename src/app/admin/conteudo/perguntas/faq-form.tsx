"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { CONTENT_LIMITS } from "@/db/content-limits";
import type { StaffFaq } from "@/modules/content/queries";
import { createFaqAction, updateFaqAction } from "@/modules/content/server/actions";

import {
  CountedField,
  FormNotice,
  SaveButton,
  useDirtySinceSave,
  useUnsavedLeave,
} from "../cms-fields";

const idle = { ok: false as const, message: "" };

export function FaqForm({ item }: { item: StaffFaq | null }) {
  const router = useRouter();
  const action = item ? updateFaqAction : createFaqAction;
  const [state, formAction] = useActionState(action, idle);
  const [question, setQuestion] = useState(item?.question ?? "");
  const [answer, setAnswer] = useState(item?.answer ?? "");
  const [published, setPublished] = useState(item?.published ?? false);
  const version = state.ok && state.version ? state.version : (item?.version ?? 0);
  const dirty = useDirtySinceSave(
    JSON.stringify({ question, answer, published }),
    state.ok,
  );
  useUnsavedLeave(dirty);

  useEffect(() => {
    if (state.ok && !item && state.id)
      router.push(`/admin/conteudo/perguntas/${state.id}`);
  }, [item, router, state]);

  const fields = state.ok ? {} : (state.fields ?? {});
  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      <h2 className="text-xl">{item ? "Editar pergunta" : "Nova pergunta"}</h2>
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
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={published}
          onChange={(event) => setPublished(event.target.checked)}
        />
        Publicado
      </label>
      {dirty && state.ok ? null : <FormNotice state={state} />}
      <SaveButton />
    </form>
  );
}
