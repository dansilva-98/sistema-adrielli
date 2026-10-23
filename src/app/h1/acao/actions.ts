"use server";

type ActionState = { ok: boolean; message: string };

export async function probeAction(
  state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void state;
  void formData;
  return { ok: true, message: "Ação aceita." };
}
