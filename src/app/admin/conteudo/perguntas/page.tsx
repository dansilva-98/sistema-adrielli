import { sql } from "@/db/client";
import { ADMIN_ROLES } from "@/modules/identity/access";
import { requireStaff } from "@/modules/identity/server/guard";
import { loadStaffFaq } from "@/modules/content/queries";
import { addContentLabel, createdNoticeFromSearch } from "@/modules/content/list-copy";
import {
  deleteFaqAction,
  moveFaqAction,
  setFaqPublishedAction,
} from "@/modules/content/server/actions";

import { ContentList } from "../content-list";
import { loadOrNull } from "../load";

export const instant = false;

export default async function FaqPage({
  searchParams,
}: {
  searchParams: Promise<{ criado?: string }>;
}) {
  await requireStaff({ roles: ADMIN_ROLES });
  const items = await loadOrNull(loadStaffFaq(sql));
  if (!items) return <p role="alert">Não foi possível carregar o conteúdo.</p>;
  const { criado } = await searchParams;
  return (
    <ContentList
      title="Perguntas frequentes"
      empty="Nenhuma pergunta ainda."
      createHref="/admin/conteudo/perguntas/novo"
      createLabel={addContentLabel("faq")}
      editBase="/admin/conteudo/perguntas"
      kind="a pergunta"
      notice={createdNoticeFromSearch("faq", criado)}
      items={items.map((item) => ({
        id: item.id,
        label: item.question,
        published: item.published,
        sortOrder: item.sortOrder,
        version: item.version,
      }))}
      deleteAction={deleteFaqAction}
      moveAction={moveFaqAction}
      publishAction={setFaqPublishedAction}
    />
  );
}
