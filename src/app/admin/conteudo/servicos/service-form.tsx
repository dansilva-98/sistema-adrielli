"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CONTENT_LIMITS } from "@/db/content-limits";
import { confirmContentVersion } from "@/modules/content/edit-sync";
import { sitePublicImageUrl } from "@/modules/content/image-path";
import { contentCreatedPath, contentEditTitle } from "@/modules/content/list-copy";
import type { StaffService } from "@/modules/content/queries";
import {
  createServiceAction,
  updateServiceAction,
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
const LIST_HREF = "/admin/conteudo/servicos";
const CREATE_HREF = "/admin/conteudo/servicos/novo";

type FormState =
  | { ok: true; id?: string; path?: string; version?: number }
  | { ok: false; message: string; field?: string; fields?: Record<string, string> };

export function ServiceForm({
  service,
  imageOrigin,
}: {
  service: StaffService | null;
  imageOrigin: string;
}) {
  const [createEpoch, setCreateEpoch] = useState(0);
  return (
    <ServiceFormSession
      key={service?.id ?? `new-${createEpoch}`}
      service={service}
      imageOrigin={imageOrigin}
      onCreated={() => setCreateEpoch((current) => current + 1)}
    />
  );
}

function ServiceFormSession({
  service,
  imageOrigin,
  onCreated,
}: {
  service: StaffService | null;
  imageOrigin: string;
  onCreated: () => void;
}) {
  const action = service ? updateServiceAction : createServiceAction;
  const [state, formAction] = useActionState(action, idle);
  const { hideSaved, trackSubmit } = useDismissSavedNotice(state.ok);
  return (
    <EditItemGate
      serverVersion={service?.version ?? null}
      savedVersion={state.ok ? state.version : undefined}
    >
      {({ formKey, onDirty }) => (
        <ServiceFormFields
          key={formKey}
          service={service}
          imageOrigin={imageOrigin}
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

function ServiceFormFields({
  service,
  imageOrigin,
  state,
  formAction,
  onCreated,
  onDirty,
  hideSaved,
}: {
  service: StaffService | null;
  imageOrigin: string;
  state: FormState;
  formAction: (formData: FormData) => void;
  onCreated: () => void;
  onDirty: (dirty: boolean) => void;
  hideSaved: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(service?.title ?? "");
  const [slug, setSlug] = useState(service?.slug ?? "");
  const [summary, setSummary] = useState(service?.summary ?? "");
  const [body, setBody] = useState(service?.body ?? "");
  const [alt, setAlt] = useState(service?.imageAlt ?? "");
  const [published, setPublished] = useState(service?.published ?? true);
  const [file, setFile] = useState<File | null>(null);
  const [remove, setRemove] = useState(false);
  const [mountedVersion] = useState(service?.version ?? 0);
  const [confirmedVersion, setConfirmedVersion] = useState(mountedVersion);
  const version = confirmContentVersion(
    confirmedVersion,
    state.ok ? state.version : undefined,
  );
  if (version !== confirmedVersion) setConfirmedVersion(version);
  const [open, setOpen] = useState(false);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  const kept = !remove && !file ? service?.imagePath : null;
  const src = preview ?? (kept ? sitePublicImageUrl(imageOrigin, kept) : null);
  const snapshot = JSON.stringify({
    title,
    slug,
    summary,
    body,
    alt,
    published,
    image: file ? "novo" : kept,
  });
  const dirty = useDirtySinceSave(
    snapshot,
    state.ok ? (state.version ?? state.id ?? "ok") : false,
  );
  useUnsavedLeave(dirty);
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);

  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  useEffect(() => {
    if (state.ok && !service && state.id) {
      onCreated();
      router.push(contentCreatedPath(LIST_HREF));
    }
  }, [onCreated, router, service, state]);

  const fields = state.ok ? {} : (state.fields ?? {});
  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      <ContentFormChrome
        kind="service"
        listHref={LIST_HREF}
        createHref={CREATE_HREF}
        title={service ? contentEditTitle("service", service.title) : "Novo serviço"}
        editing={Boolean(service)}
      />
      {service ? <input type="hidden" name="id" value={service.id} /> : null}
      <input type="hidden" name="version" value={version} />
      <input
        type="hidden"
        name="imagePath"
        value={remove ? "" : (service?.imagePath ?? "")}
      />
      <input type="hidden" name="removeImage" value={remove ? "true" : "false"} />
      <input type="hidden" name="published" value={published ? "true" : "false"} />
      <CountedField
        id="servico-titulo"
        label="Título"
        help="O nome do serviço no site."
        name="title"
        value={title}
        max={CONTENT_LIMITS.serviceTitle}
        error={fields.title}
        onChange={setTitle}
      />
      <CountedField
        id="servico-endereco"
        label="Endereço"
        help="Letras minúsculas e hífen. Vazio gera um endereço a partir do título."
        name="slug"
        value={slug}
        max={CONTENT_LIMITS.serviceSlug}
        error={fields.slug}
        onChange={setSlug}
      />
      <CountedField
        id="servico-resumo"
        label="Resumo"
        help="A linha curta do card."
        name="summary"
        value={summary}
        max={CONTENT_LIMITS.serviceSummary}
        error={fields.summary}
        onChange={setSummary}
      />
      <CountedField
        id="servico-texto"
        label="Texto"
        help="O texto completo, em Markdown simples."
        name="body"
        value={body}
        max={CONTENT_LIMITS.serviceBody}
        error={fields.body}
        multiline
        onChange={setBody}
      />
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Imagem</p>
        <p className="text-sm text-muted">
          JPEG, PNG ou WebP, até 4 MB. A foto é regravada.
        </p>
        {src ? (
          // A prévia é local ou do bucket público; o alt fica no campo ao lado.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt || "Prévia da imagem"}
            className="max-h-48 w-auto rounded-lg"
          />
        ) : (
          <p className="text-sm text-muted">Nenhuma imagem.</p>
        )}
        <Label htmlFor="servico-imagem">Trocar imagem</Label>
        <input
          id="servico-imagem"
          name="image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setRemove(false);
          }}
        />
        {fields.image ? <p className="text-sm text-destructive">{fields.image}</p> : null}
        {src ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button type="button" variant="outline" />}>
              Remover
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Remover a imagem</DialogTitle>
                <DialogDescription>
                  Ela sai do site quando você salvar este serviço.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    setFile(null);
                    setRemove(true);
                    setOpen(false);
                  }}
                >
                  Remover
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>
      <CountedField
        id="servico-alt"
        label="Descrição da imagem"
        help="Quem não vê a foto ouve este texto."
        name="imageAlt"
        value={alt}
        max={CONTENT_LIMITS.serviceImageAlt}
        error={fields.imageAlt}
        onChange={setAlt}
      />
      <PublishOnSiteField checked={published} onChange={setPublished} />
      {dirty && state.ok ? null : (
        <FormNotice
          state={savedNoticeState(state, mountedVersion, Boolean(service), hideSaved)}
        />
      )}
      <SaveButton />
    </form>
  );
}
