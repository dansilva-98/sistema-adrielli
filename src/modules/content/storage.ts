export async function uploadSiteObject(
  config: { supabaseUrl: string; serviceRoleKey: string },
  body: Buffer,
): Promise<string> {
  const name = `${crypto.randomUUID()}.webp`;
  const response = await fetch(
    new URL(`/storage/v1/object/site-public/${name}`, config.supabaseUrl),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.serviceRoleKey}`,
        apikey: config.serviceRoleKey,
        "Content-Type": "image/webp",
      },
      body: new Uint8Array(body),
    },
  );
  if (!response.ok) throw new Error(`Falha ao guardar a imagem (${response.status}).`);
  return name;
}

export async function removeSiteObject(
  config: { supabaseUrl: string; serviceRoleKey: string },
  path: string,
): Promise<void> {
  const response = await fetch(
    new URL(`/storage/v1/object/site-public/${path}`, config.supabaseUrl),
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${config.serviceRoleKey}`,
        apikey: config.serviceRoleKey,
      },
    },
  );
  if (!response.ok) throw new Error("Falha ao remover a imagem.");
}
