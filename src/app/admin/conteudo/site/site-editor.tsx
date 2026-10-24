"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useFormStatus } from "react-dom";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CONTENT_LIMITS } from "@/db/content-limits";
import { sitePublicImageUrl } from "@/modules/content/image-path";
import type { EditableSite, HowItWorksStep } from "@/modules/content/queries";
import { saveSiteSectionAction } from "@/modules/content/server/actions";
import { maskWhatsapp, whatsAppUrl } from "@/modules/content/whatsapp";

const SAVED_MESSAGE = "Salvo. O site já mostra a alteração.";

type EditorProps = {
  site: EditableSite;
  imageOrigin: string;
};

export function SiteEditor({ site, imageOrigin }: EditorProps) {
  const [version, setVersion] = useState(site.version);
  const [dirty, setDirty] = useState(false);
  const dirtyIds = useRef(new Set<string>());
  const markDirty = useCallback((id: string, value: boolean) => {
    if (value) dirtyIds.current.add(id);
    else dirtyIds.current.delete(id);
    setDirty(dirtyIds.current.size > 0);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const leave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const click = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest("a");
      if (!anchor || anchor.target === "_blank") return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (!window.confirm("Há alterações não salvas. Sair mesmo assim?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", leave);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", leave);
      document.removeEventListener("click", click, true);
    };
  }, [dirty]);

  return (
    <div className="flex max-w-2xl flex-col gap-10">
      <h2 className="text-xl">Editar site</h2>
      <HeroForm
        site={site}
        version={version}
        imageOrigin={imageOrigin}
        onSaved={setVersion}
        onDirty={markDirty}
      />
      <AboutForm
        site={site}
        version={version}
        imageOrigin={imageOrigin}
        onSaved={setVersion}
        onDirty={markDirty}
      />
      <HowForm site={site} version={version} onSaved={setVersion} onDirty={markDirty} />
      <ContactForm
        site={site}
        version={version}
        onSaved={setVersion}
        onDirty={markDirty}
      />
      <SearchForm
        site={site}
        version={version}
        onSaved={setVersion}
        onDirty={markDirty}
      />
    </div>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando…" : "Salvar"}
    </Button>
  );
}

function FormNotice({
  state,
  quiet = false,
}: {
  state: { ok: boolean; message?: string; fields?: Record<string, string> };
  quiet?: boolean;
}) {
  if (state.ok && !quiet) {
    return (
      <p role="status" className="text-sm">
        {SAVED_MESSAGE}
      </p>
    );
  }
  if (state.ok) return null;
  if (!state.message || state.fields) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {state.message}
    </p>
  );
}

function CountedField({
  id,
  label,
  help,
  name,
  value,
  max,
  error,
  multiline = false,
  onChange,
}: {
  id: string;
  label: string;
  help: string;
  name: string;
  value: string;
  max: number;
  error?: string;
  multiline?: boolean;
  onChange: (value: string) => void;
}) {
  const helpId = `${id}-ajuda`;
  const countId = `${id}-contador`;
  const errorId = `${id}-erro`;
  const describedBy = error ? `${helpId} ${countId} ${errorId}` : `${helpId} ${countId}`;
  const shared = {
    id,
    name,
    value,
    maxLength: max,
    "aria-invalid": Boolean(error) || undefined,
    "aria-describedby": describedBy,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(event.target.value),
  };
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <p id={helpId} className="text-sm text-muted">
        {help}
      </p>
      {multiline ? <Textarea {...shared} /> : <Input {...shared} />}
      <p id={countId} className="text-xs text-muted">
        {value.length}/{max}
      </p>
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function useSection(
  id: string,
  snapshot: string,
  onDirty: (id: string, dirty: boolean) => void,
) {
  const [state, action] = useActionState(saveSiteSectionAction, {
    ok: false,
    message: "",
  });
  const dirty = snapshot !== "";
  useEffect(() => {
    onDirty(id, dirty);
  }, [dirty, id, onDirty]);
  useEffect(() => () => onDirty(id, false), [id, onDirty]);
  return { state, action, dirty };
}

function HeroForm({
  site,
  version,
  imageOrigin,
  onSaved,
  onDirty,
}: EditorProps & {
  version: number;
  onSaved: (version: number) => void;
  onDirty: (id: string, dirty: boolean) => void;
}) {
  const [title, setTitle] = useState(site.heroTitle);
  const [subtitle, setSubtitle] = useState(site.heroSubtitle);
  const [tagline, setTagline] = useState(site.heroTagline);
  const [alt, setAlt] = useState(site.heroImageAlt ?? "");
  const [path, setPath] = useState(site.heroImagePath);
  const image = useImageField(path);
  const savedPath = (next: string | null) => {
    setPath(next);
    image.clearFile();
    image.setRemove(false);
  };
  const current = JSON.stringify({
    title,
    subtitle,
    tagline,
    alt,
    path: image.keptPath,
    file: image.file?.name ?? "",
    remove: image.remove,
  });
  const [baseline, setBaseline] = useState(current);
  const { state, action } = useSection(
    "hero",
    current === baseline ? "" : "dirty",
    onDirty,
  );
  useSaved(state, onSaved, () => {
    const nextPath = state.ok && state.path ? state.path : null;
    savedPath(nextPath);
    setBaseline(
      JSON.stringify({
        title,
        subtitle,
        tagline,
        alt,
        path: nextPath,
        file: "",
        remove: false,
      }),
    );
  });
  return (
    <form action={action} className="flex flex-col gap-4 border-b border-border pb-8">
      <h3 className="text-lg">Topo</h3>
      <input type="hidden" name="section" value="hero" />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="heroImagePath" value={image.keptPath ?? ""} />
      {image.remove ? <input type="hidden" name="removeImage" value="true" /> : null}
      <CountedField
        id="hero-title"
        label="Nome"
        help="Aparece como título do topo."
        name="heroTitle"
        value={title}
        max={CONTENT_LIMITS.heroTitle}
        error={state.ok ? undefined : state.fields?.heroTitle}
        onChange={setTitle}
      />
      <CountedField
        id="hero-subtitle"
        label="Especialidade"
        help="A linha logo abaixo do nome."
        name="heroSubtitle"
        value={subtitle}
        max={CONTENT_LIMITS.heroSubtitle}
        error={state.ok ? undefined : state.fields?.heroSubtitle}
        onChange={setSubtitle}
      />
      <CountedField
        id="hero-tagline"
        label="Frase"
        help="A frase curta do topo."
        name="heroTagline"
        value={tagline}
        max={CONTENT_LIMITS.heroTagline}
        error={state.ok ? undefined : state.fields?.heroTagline}
        onChange={setTagline}
      />
      <ImageField
        id="hero-image"
        altId="hero-alt"
        altName="heroImageAlt"
        alt={alt}
        altError={state.ok ? undefined : state.fields?.heroImageAlt}
        imageError={state.ok ? undefined : state.fields?.image}
        origin={imageOrigin}
        image={image}
        onAlt={setAlt}
      />
      <FormNotice state={state} quiet={current !== baseline} />
      <SaveButton />
    </form>
  );
}

function AboutForm({
  site,
  version,
  imageOrigin,
  onSaved,
  onDirty,
}: EditorProps & {
  version: number;
  onSaved: (version: number) => void;
  onDirty: (id: string, dirty: boolean) => void;
}) {
  const [title, setTitle] = useState(site.aboutTitle);
  const [body, setBody] = useState(site.aboutBody);
  const [alt, setAlt] = useState(site.aboutImageAlt ?? "");
  const [path, setPath] = useState(site.aboutImagePath);
  const image = useImageField(path);
  const current = JSON.stringify({
    title,
    body,
    alt,
    path: image.keptPath,
    file: image.file?.name ?? "",
    remove: image.remove,
  });
  const [baseline, setBaseline] = useState(current);
  const { state, action } = useSection(
    "about",
    current === baseline ? "" : "dirty",
    onDirty,
  );
  useSaved(state, onSaved, () => {
    const nextPath = state.ok && state.path ? state.path : null;
    setPath(nextPath);
    image.clearFile();
    image.setRemove(false);
    setBaseline(
      JSON.stringify({ title, body, alt, path: nextPath, file: "", remove: false }),
    );
  });
  return (
    <form action={action} className="flex flex-col gap-4 border-b border-border pb-8">
      <h3 className="text-lg">Sobre</h3>
      <input type="hidden" name="section" value="about" />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="aboutImagePath" value={image.keptPath ?? ""} />
      {image.remove ? <input type="hidden" name="removeImage" value="true" /> : null}
      <CountedField
        id="about-title"
        label="Título"
        help="O título da página Sobre."
        name="aboutTitle"
        value={title}
        max={CONTENT_LIMITS.aboutTitle}
        error={state.ok ? undefined : state.fields?.aboutTitle}
        onChange={setTitle}
      />
      <CountedField
        id="about-body"
        label="Texto"
        help="O texto completo, em Markdown simples."
        name="aboutBody"
        value={body}
        max={CONTENT_LIMITS.aboutBody}
        multiline
        error={state.ok ? undefined : state.fields?.aboutBody}
        onChange={setBody}
      />
      <ImageField
        id="about-image"
        altId="about-alt"
        altName="aboutImageAlt"
        alt={alt}
        altError={state.ok ? undefined : state.fields?.aboutImageAlt}
        imageError={state.ok ? undefined : state.fields?.image}
        origin={imageOrigin}
        image={image}
        onAlt={setAlt}
      />
      <FormNotice state={state} quiet={current !== baseline} />
      <SaveButton />
    </form>
  );
}

function HowForm({
  site,
  version,
  onSaved,
  onDirty,
}: Omit<EditorProps, "imageOrigin"> & {
  version: number;
  onSaved: (version: number) => void;
  onDirty: (id: string, dirty: boolean) => void;
}) {
  const [steps, setSteps] = useState<HowItWorksStep[]>(site.howItWorks);
  const current = JSON.stringify(steps);
  const [baseline, setBaseline] = useState(current);
  const { state, action } = useSection(
    "how",
    current === baseline ? "" : "dirty",
    onDirty,
  );
  useSaved(state, onSaved, () => setBaseline(current));
  const update = (index: number, patch: Partial<HowItWorksStep>) => {
    setSteps((items) =>
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  };
  const move = (index: number, direction: -1 | 1) => {
    const next = index + direction;
    if (next < 0 || next >= steps.length) return;
    setSteps((items) => {
      const copy = [...items];
      const [item] = copy.splice(index, 1);
      if (!item) return items;
      copy.splice(next, 0, item);
      return copy;
    });
  };
  return (
    <form action={action} className="flex flex-col gap-4 border-b border-border pb-8">
      <h3 className="text-lg">Como funciona</h3>
      <p className="text-sm text-muted">De 3 a 6 etapas. A ordem é a do site.</p>
      <input type="hidden" name="section" value="how" />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="howItWorks" value={current} />
      {steps.map((step, index) => (
        <fieldset
          key={index}
          className="flex flex-col gap-3 rounded-lg border border-border p-3"
        >
          <legend className="px-1 text-sm font-medium">Etapa {index + 1}</legend>
          <CountedField
            id={`step-title-${index}`}
            label="Título"
            help="O nome curto da etapa."
            name={`stepTitle${index}`}
            value={step.title}
            max={CONTENT_LIMITS.howItWorksTitle}
            error={state.ok ? undefined : state.fields?.[`howItWorks.${index}.title`]}
            onChange={(value) => update(index, { title: value })}
          />
          <CountedField
            id={`step-body-${index}`}
            label="Texto"
            help="O que acontece nesta etapa."
            name={`stepBody${index}`}
            value={step.body}
            max={CONTENT_LIMITS.howItWorksBody}
            multiline
            error={state.ok ? undefined : state.fields?.[`howItWorks.${index}.body`]}
            onChange={(value) => update(index, { body: value })}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              Subir
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={index === steps.length - 1}
              onClick={() => move(index, 1)}
            >
              Descer
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={steps.length <= 3}
              onClick={() =>
                setSteps((items) => items.filter((_, itemIndex) => itemIndex !== index))
              }
            >
              Remover etapa
            </Button>
          </div>
        </fieldset>
      ))}
      {!state.ok && state.fields?.howItWorks ? (
        <p role="alert" className="text-sm text-destructive">
          {state.fields.howItWorks}
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        disabled={steps.length >= 6}
        onClick={() => setSteps((items) => [...items, { title: "", body: "" }])}
      >
        Adicionar etapa
      </Button>
      <FormNotice state={state} quiet={current !== baseline} />
      <SaveButton />
    </form>
  );
}

function ContactForm({
  site,
  version,
  onSaved,
  onDirty,
}: Omit<EditorProps, "imageOrigin"> & {
  version: number;
  onSaved: (version: number) => void;
  onDirty: (id: string, dirty: boolean) => void;
}) {
  const [number, setNumber] = useState(maskWhatsapp(site.whatsappNumber ?? ""));
  const [message, setMessage] = useState(site.whatsappMessage);
  const [email, setEmail] = useState(site.contactEmail ?? "");
  const [address, setAddress] = useState(site.addressText ?? "");
  const [area, setArea] = useState(site.serviceAreaText ?? "");
  const current = JSON.stringify({ number, message, email, address, area });
  const [baseline, setBaseline] = useState(current);
  const { state, action } = useSection(
    "contact",
    current === baseline ? "" : "dirty",
    onDirty,
  );
  useSaved(state, onSaved, () => setBaseline(current));
  const link = whatsAppUrl(number.replace(/\D/g, ""), message);
  return (
    <form action={action} className="flex flex-col gap-4 border-b border-border pb-8">
      <h3 className="text-lg">Contato</h3>
      <input type="hidden" name="section" value="contact" />
      <input type="hidden" name="version" value={version} />
      <div className="flex flex-col gap-1">
        <Label htmlFor="whatsapp">WhatsApp</Label>
        <p id="whatsapp-ajuda" className="text-sm text-muted">
          Com DDI. A máscara é só visual; gravamos os dígitos.
        </p>
        <Input
          id="whatsapp"
          name="whatsappNumber"
          inputMode="tel"
          autoComplete="tel"
          value={number}
          aria-invalid={
            state.ok ? undefined : Boolean(state.fields?.whatsappNumber) || undefined
          }
          aria-describedby="whatsapp-ajuda whatsapp-link"
          onChange={(event) => setNumber(maskWhatsapp(event.target.value))}
        />
        <p id="whatsapp-link" className="text-sm">
          {link ? (
            <a href={link} target="_blank" rel="noopener noreferrer">
              {link}
            </a>
          ) : (
            "O link aparece quando houver um número."
          )}
        </p>
        {!state.ok && state.fields?.whatsappNumber ? (
          <p className="text-sm text-destructive">{state.fields.whatsappNumber}</p>
        ) : null}
      </div>
      <CountedField
        id="whatsapp-message"
        label="Mensagem"
        help="O texto que abre junto com a conversa."
        name="whatsappMessage"
        value={message}
        max={CONTENT_LIMITS.whatsappMessage}
        multiline
        error={state.ok ? undefined : state.fields?.whatsappMessage}
        onChange={setMessage}
      />
      <CountedField
        id="contact-email"
        label="E-mail"
        help="Aparece como texto e como link."
        name="contactEmail"
        value={email}
        max={CONTENT_LIMITS.contactEmail}
        error={state.ok ? undefined : state.fields?.contactEmail}
        onChange={setEmail}
      />
      <CountedField
        id="address"
        label="Endereço"
        help="Texto selecionável no site."
        name="addressText"
        value={address}
        max={CONTENT_LIMITS.addressText}
        multiline
        error={state.ok ? undefined : state.fields?.addressText}
        onChange={setAddress}
      />
      <CountedField
        id="service-area"
        label="Área de atendimento"
        help="Onde você atende, em texto."
        name="serviceAreaText"
        value={area}
        max={CONTENT_LIMITS.serviceAreaText}
        error={state.ok ? undefined : state.fields?.serviceAreaText}
        onChange={setArea}
      />
      <FormNotice state={state} quiet={current !== baseline} />
      <SaveButton />
    </form>
  );
}

function SearchForm({
  site,
  version,
  onSaved,
  onDirty,
}: Omit<EditorProps, "imageOrigin"> & {
  version: number;
  onSaved: (version: number) => void;
  onDirty: (id: string, dirty: boolean) => void;
}) {
  const [seoTitle, setSeoTitle] = useState(site.seoTitle);
  const [seoDescription, setSeoDescription] = useState(site.seoDescription);
  const [instagram, setInstagram] = useState(site.instagramHandle ?? "");
  const [support, setSupport] = useState(site.supportEmail ?? "");
  const current = JSON.stringify({ seoTitle, seoDescription, instagram, support });
  const [baseline, setBaseline] = useState(current);
  const { state, action } = useSection(
    "search",
    current === baseline ? "" : "dirty",
    onDirty,
  );
  useSaved(state, onSaved, () => setBaseline(current));
  return (
    <form action={action} className="flex flex-col gap-4">
      <h3 className="text-lg">Busca e redes</h3>
      <input type="hidden" name="section" value="search" />
      <input type="hidden" name="version" value={version} />
      <CountedField
        id="seo-title"
        label="Título da busca"
        help="O título que os buscadores mostram."
        name="seoTitle"
        value={seoTitle}
        max={CONTENT_LIMITS.seoTitle}
        error={state.ok ? undefined : state.fields?.seoTitle}
        onChange={setSeoTitle}
      />
      <CountedField
        id="seo-description"
        label="Descrição da busca"
        help="O resumo abaixo do título na busca."
        name="seoDescription"
        value={seoDescription}
        max={CONTENT_LIMITS.seoDescription}
        multiline
        error={state.ok ? undefined : state.fields?.seoDescription}
        onChange={setSeoDescription}
      />
      <CountedField
        id="instagram"
        label="Instagram"
        help="Só o usuário, sem @."
        name="instagramHandle"
        value={instagram}
        max={CONTENT_LIMITS.instagramHandle}
        error={state.ok ? undefined : state.fields?.instagramHandle}
        onChange={setInstagram}
      />
      <CountedField
        id="support-email"
        label="E-mail de suporte"
        help="Para quem escreve à equipe, fora do contato público."
        name="supportEmail"
        value={support}
        max={CONTENT_LIMITS.supportEmail}
        error={state.ok ? undefined : state.fields?.supportEmail}
        onChange={setSupport}
      />
      <FormNotice state={state} quiet={current !== baseline} />
      <SaveButton />
    </form>
  );
}

function useSaved(
  state: { ok: boolean; version?: number; path?: string },
  onSaved: (version: number) => void,
  accept: () => void,
) {
  const seen = useRef<number | null>(null);
  useEffect(() => {
    if (!state.ok || state.version == null || seen.current === state.version) return;
    seen.current = state.version;
    accept();
    onSaved(state.version);
  }, [accept, onSaved, state]);
}

function useImageField(initial: string | null) {
  const [file, setFile] = useState<File | null>(null);
  const [remove, setRemove] = useState(false);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);
  const keptPath = file || remove ? null : initial;
  return {
    file,
    remove,
    preview,
    keptPath,
    setFile: (next: File | null) => {
      setFile(next);
      if (next) setRemove(false);
    },
    clearFile: () => setFile(null),
    setRemove,
  };
}

function ImageField({
  id,
  altId,
  altName,
  alt,
  altError,
  imageError,
  origin,
  image,
  onAlt,
}: {
  id: string;
  altId: string;
  altName: string;
  alt: string;
  altError?: string;
  imageError?: string;
  origin: string;
  image: ReturnType<typeof useImageField>;
  onAlt: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!image.file && inputRef.current) inputRef.current.value = "";
  }, [image.file]);
  const src =
    image.preview ?? (image.keptPath ? sitePublicImageUrl(origin, image.keptPath) : null);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Imagem</p>
      <p className="text-sm text-muted">
        JPEG, PNG ou WebP, até 4 MB. A foto é regravada.
      </p>
      {src ? (
        // A prévia é do arquivo local ou do bucket já público; o alt vem do campo ao lado.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt || "Prévia da imagem"}
          className="max-h-48 w-auto rounded-lg"
        />
      ) : (
        <p className="text-sm text-muted">Nenhuma imagem.</p>
      )}
      <Label htmlFor={id}>Trocar imagem</Label>
      <Input
        id={id}
        name="image"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        ref={inputRef}
        onChange={(event) => image.setFile(event.target.files?.[0] ?? null)}
      />
      {imageError ? <p className="text-sm text-destructive">{imageError}</p> : null}
      {src ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button type="button" variant="outline" />}>
            Remover
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remover a imagem</DialogTitle>
              <DialogDescription>
                Ela sai do site quando você salvar este bloco.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  image.setFile(null);
                  image.setRemove(true);
                  setOpen(false);
                }}
              >
                Remover
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      <CountedField
        id={altId}
        label="Descrição da imagem"
        help="Quem não vê a foto ouve este texto."
        name={altName}
        value={alt}
        max={CONTENT_LIMITS.heroImageAlt}
        error={altError}
        onChange={onAlt}
      />
    </div>
  );
}
