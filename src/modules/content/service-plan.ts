import { serviceSchema, type ServiceInput } from "@/modules/content/schema";
import { slugFromTitle } from "@/modules/content/slug";

const IMAGE_PLACEHOLDER = "00000000-0000-4000-8000-000000000000.webp";

export type ServiceDraft = {
  title: string;
  slug: string;
  summary: string;
  body: string;
  imagePath: string;
  imageAlt: string;
  published: boolean;
  version: number;
  hasNewFile: boolean;
};

export type ServicePlan =
  | {
      ok: true;
      upload: boolean;
      data: ServiceInput;
    }
  | {
      ok: false;
      message: string;
      field?: string;
      fields: Record<string, string>;
    };

export function planServiceWrite(draft: ServiceDraft): ServicePlan {
  const slug = draft.slug.trim() || slugFromTitle(draft.title);
  const parsed = serviceSchema.safeParse({
    title: draft.title,
    slug,
    summary: draft.summary,
    body: draft.body,
    imagePath: draft.hasNewFile ? IMAGE_PLACEHOLDER : draft.imagePath,
    imageAlt: draft.imageAlt,
    published: draft.published,
    version: draft.version >= 1 ? draft.version : undefined,
  });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fields[key]) fields[key] = issue.message;
    }
    const first = parsed.error.issues[0];
    const field = first?.path[0];
    return {
      ok: false,
      message: first?.message ?? "Confira os dados e tente novamente.",
      field: typeof field === "string" ? field : undefined,
      fields,
    };
  }
  return {
    ok: true,
    upload: draft.hasNewFile,
    data: {
      ...parsed.data,
      imagePath: draft.hasNewFile ? null : parsed.data.imagePath,
    },
  };
}
