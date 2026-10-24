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
import { sitePublicImageUrl } from "@/modules/content/image-path";
import type { StaffService } from "@/modules/content/queries";
import {
  createServiceAction,
  updateServiceAction,
} from "@/modules/content/server/actions";

import {
  CountedField,
  FormNotice,
  SaveButton,
  useDirtySinceSave,
  useUnsavedLeave,
} from "../cms-fields";

const idle = { ok: false as const, message: "" };

export function ServiceForm({
  service,
  imageOrigin,
}: {
  service: StaffService | null;
  imageOrigin: string;
}) {
  const router = useRouter();
  const action = service ? updateServiceAction : createServiceAction;
  const [state, formAction] = useActionState(action, idle);
  const [title, setTitle] = useState(service?.title ?? "");
  const [slug, setSlug] = useState(service?.slug ?? "");
  const [summary, setSummary] = useState(service?.summary ?? "");
  const [body, setBody] = useState(service?.body ?? "");
  const [alt, setAlt] = useState(service?.imageAlt ?? "");
  const [published, setPublished] = useState(service?.published ?? false);
  const [file, setFile] = useState<File | null>(null);
  const [remove, setRemove] = useState(false);
  const version = state.ok && state.version ? state.version : (service?.version ?? 0);
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
  const dirty = useDirtySinceSave(snapshot, state.ok);
  useUnsavedLeave(dirty);

  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  useEffect(() => {
    if (state.ok && !service && state.id) {
      router.push(`/admin/conteudo/servicos/${state.id}`);
    }
  }, [router, service, state]);

  const fields = state.ok ? {} : (state.fields ?? {});
  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      <h2 className="text-xl">{service ? "Editar serviço" : "Novo serviço"}</h2>
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
