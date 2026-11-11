import { cn } from "@/lib/utils";
import type { PublicTestimonial } from "@/modules/content/queries";
import { testimonialImageAlt } from "@/modules/content/testimonial-alt";

import { SitePhoto } from "./site-photo";

export function TestimonialList({ items }: { items: PublicTestimonial[] }) {
  if (items.length === 0) return null;
  const imaged = items.filter((item) => item.imagePath).length;
  const grid = imaged >= 2;
  return (
    <div
      className={
        grid
          ? "grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3"
          : "flex flex-col gap-4"
      }
    >
      {items.map((item) =>
        item.imagePath ? (
          <TestimonialWithImage key={item.id} item={item} path={item.imagePath} />
        ) : (
          <TestimonialQuote
            key={item.id}
            item={item}
            className={grid ? "col-span-full" : undefined}
          />
        ),
      )}
    </div>
  );
}

function TestimonialQuote({
  item,
  className,
}: {
  item: PublicTestimonial;
  className?: string;
}) {
  return (
    <figure className={cn("flex flex-col gap-1", className)}>
      <blockquote>{item.quote}</blockquote>
      {item.authorLabel ? (
        <figcaption className="text-sm text-muted">{item.authorLabel}</figcaption>
      ) : null}
    </figure>
  );
}

function TestimonialWithImage({ item, path }: { item: PublicTestimonial; path: string }) {
  return (
    <figure className="flex flex-col gap-2">
      <SitePhoto
        path={path}
        alt={testimonialImageAlt(item.quote)}
        className="max-w-[360px] border border-line object-contain"
      />
      {item.authorLabel ? (
        <figcaption className="text-sm text-muted">{item.authorLabel}</figcaption>
      ) : null}
      <details>
        <summary className="cursor-pointer focus-visible:outline-2">
          Ler a transcrição
        </summary>
        <p className="pt-2">{item.quote}</p>
      </details>
    </figure>
  );
}
