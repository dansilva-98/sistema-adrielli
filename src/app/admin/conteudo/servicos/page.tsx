import { sql } from "@/db/client";
import { ADMIN_ROLES } from "@/modules/identity/access";
import { requireStaff } from "@/modules/identity/server/guard";
import { loadStaffServices } from "@/modules/content/queries";
import {
  deleteServiceAction,
  moveServiceAction,
  setServicePublishedAction,
} from "@/modules/content/server/actions";

import { ContentList } from "../content-list";
import { loadOrNull } from "../load";

export const instant = false;

export default async function ServicesPage() {
  await requireStaff({ roles: ADMIN_ROLES });
  const items = await loadOrNull(loadStaffServices(sql));
  if (!items) return <p role="alert">Não foi possível carregar o conteúdo.</p>;
  return (
    <ContentList
      title="Serviços"
      empty="Nenhum serviço ainda."
      createHref="/admin/conteudo/servicos/novo"
      createLabel="Criar o primeiro serviço"
      editBase="/admin/conteudo/servicos"
      kind="o serviço"
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
