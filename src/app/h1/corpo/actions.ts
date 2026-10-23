"use server";

type UploadState = { ok: boolean; message: string };

export async function acceptUpload(
  state: UploadState,
  formData: FormData,
): Promise<UploadState> {
  void state;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Escolha um arquivo." };
  }
  return { ok: true, message: `Recebido ${file.size} bytes.` };
}
