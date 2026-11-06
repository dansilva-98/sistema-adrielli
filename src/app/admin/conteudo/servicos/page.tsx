import { sql } from "@/db/client";
import { ADMIN_ROLES } from "@/modules/identity/access";
import { requireStaff } from "@/modules/identity/server/guard";
import { loadStaffServices } from "@/modules/content/queries";
import { addContentLabel, createdNoticeFromSearch } from "@/modules/content/list-copy";
import {
  deleteServiceAction,
  moveServiceAction,
  setServicePublishedAction,
} from "@/modules/content/server/actions";

import { ContentList } from "../content-list";
import { loadOrNull } from "../load";

export const instant = false;

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ criado?: string }>;
}) {
  await requireStaff({ roles: ADMIN_ROLES });
  const items = await loadOrNull(loadStaffServices(sql));
  if (!items) return <p role="alert">Não foi possível carregar o conteúdo.</p>;
  const { criado } = await searchParams;
  return (
    <ContentList
      title="Serviços"
      empty="Nenhum serviço ainda."
      createHref="/admin/conteudo/servicos/novo"
      createLabel={addContentLabel("service")}
      editBase="/admin/conteudo/servicos"
      kind="o serviço"
      notice={createdNoticeFromSearch("service", criado)}
      items={items.map((item) => ({
        id: item.id,
        label: item.title,
        published: item.published,
        sortOrder: item.sortOrder,
        version: item.version,
      }))}
      deleteAction={deleteServiceAction}
      moveAction={moveServiceAction}
      publishAction={setServicePublishedAction}
    />
  );
}
