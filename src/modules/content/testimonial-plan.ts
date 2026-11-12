import { testimonialSchema, type TestimonialInput } from "@/modules/content/schema";

const IMAGE_PLACEHOLDER = "00000000-0000-4000-8000-000000000000.webp";

export type TestimonialDraft = {
  quote: string;
  authorLabel: string;
  consentAt: string | null;
  imagePath: string;
  published: boolean;
  version: number;
  hasNewFile: boolean;
};

export type TestimonialPlan =
  | {
      ok: true;
      upload: boolean;
      data: TestimonialInput;
    }
  | {
      ok: false;
      message: string;
      field?: string;
      fields: Record<string, string>;
    };

export function planTestimonialWrite(draft: TestimonialDraft): TestimonialPlan {
  const parsed = testimonialSchema.safeParse({
    quote: draft.quote,
    authorLabel: draft.authorLabel,
    consentAt: draft.consentAt,
    imagePath: draft.hasNewFile ? IMAGE_PLACEHOLDER : draft.imagePath,
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
