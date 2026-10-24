import { sql } from "@/db/client";
import { ADMIN_ROLES } from "@/modules/identity/access";
import { requireStaff } from "@/modules/identity/server/guard";
import { loadStaffTestimonials } from "@/modules/content/queries";
import {
  deleteTestimonialAction,
  moveTestimonialAction,
  setTestimonialPublishedAction,
} from "@/modules/content/server/actions";

import { ContentList } from "../content-list";
import { loadOrNull } from "../load";

export const instant = false;

export default async function TestimonialsPage() {
  await requireStaff({ roles: ADMIN_ROLES });
  const items = await loadOrNull(loadStaffTestimonials(sql));
  if (!items) return <p role="alert">Não foi possível carregar o conteúdo.</p>;
  return (
    <ContentList
      title="Depoimentos"
      empty="Nenhum depoimento ainda."
      createHref="/admin/conteudo/depoimentos/novo"
      createLabel="Criar o primeiro depoimento"
      editBase="/admin/conteudo/depoimentos"
      kind="o depoimento"
      items={items.map((item) => ({
        id: item.id,
        label: item.quote.length > 80 ? `${item.quote.slice(0, 77)}…` : item.quote,
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
