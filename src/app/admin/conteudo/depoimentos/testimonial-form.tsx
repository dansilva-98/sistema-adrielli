"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CONTENT_LIMITS } from "@/db/content-limits";
import type { StaffTestimonial } from "@/modules/content/queries";
import {
  createTestimonialAction,
  updateTestimonialAction,
} from "@/modules/content/server/actions";

import {
  CountedField,
  FormNotice,
  SaveButton,
  useDirtySinceSave,
  useUnsavedLeave,
} from "../cms-fields";

const idle = { ok: false as const, message: "" };

export function TestimonialForm({ item }: { item: StaffTestimonial | null }) {
  const router = useRouter();
  const action = item ? updateTestimonialAction : createTestimonialAction;
  const [state, formAction] = useActionState(action, idle);
  const [quote, setQuote] = useState(item?.quote ?? "");
  const [author, setAuthor] = useState(item?.authorLabel ?? "");
  const [consentAt, setConsentAt] = useState(item?.consentAt ?? "");
  const [published, setPublished] = useState(item?.published ?? false);
  const version = state.ok && state.version ? state.version : (item?.version ?? 0);
  const dirty = useDirtySinceSave(
    JSON.stringify({ quote, author, consentAt, published }),
    state.ok,
  );
  useUnsavedLeave(dirty);

  useEffect(() => {
    if (state.ok && !item && state.id) {
      router.push(`/admin/conteudo/depoimentos/${state.id}`);
    }
  }, [item, router, state]);

  const fields = state.ok ? {} : (state.fields ?? {});
  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      <h2 className="text-xl">{item ? "Editar depoimento" : "Novo depoimento"}</h2>
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
