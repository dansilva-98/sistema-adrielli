export type ClinicActionState = {
  ok: boolean;
  code: "" | "duplicate";
  message: string;
};

export const idleClinicAction: ClinicActionState = {
  ok: false,
  code: "",
  message: "",
};
