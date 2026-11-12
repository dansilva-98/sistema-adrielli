import { sql } from "@/db/client";
import { ADMIN_ROLES } from "@/modules/identity/access";
import { requireStaff } from "@/modules/identity/server/guard";
import { loadStaffTestimonials } from "@/modules/content/queries";
import {
  addContentLabel,
  createdNoticeFromSearch,
  testimonialListLabel,
} from "@/modules/content/list-copy";
import {
  deleteTestimonialAction,
  moveTestimonialAction,
  setTestimonialPublishedAction,
} from "@/modules/content/server/actions";

import { ContentList } from "../content-list";
import { loadOrNull } from "../load";

export const instant = false;

export default async function TestimonialsPage({
  searchParams,
}: {
  searchParams: Promise<{ criado?: string }>;
}) {
  await requireStaff({ roles: ADMIN_ROLES });
  const items = await loadOrNull(loadStaffTestimonials(sql));
  if (!items) return <p role="alert">Não foi possível carregar o conteúdo.</p>;
  const { criado } = await searchParams;
  return (
    <ContentList
      title="Depoimentos"
      empty="Nenhum depoimento ainda."
      createHref="/admin/conteudo/depoimentos/novo"
      createLabel={addContentLabel("testimonial")}
      editBase="/admin/conteudo/depoimentos"
      kind="o depoimento"
      notice={createdNoticeFromSearch("testimonial", criado)}
      items={items.map((item) => ({
        id: item.id,
        label: testimonialListLabel(item.quote, item.imagePath),
        published: item.published,
        sortOrder: item.sortOrder,
        version: item.version,
      }))}
      deleteAction={deleteTestimonialAction}
      moveAction={moveTestimonialAction}
      publishAction={setTestimonialPublishedAction}
    />
  );
}
