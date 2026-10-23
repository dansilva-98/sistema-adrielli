"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { StaffCredentialForm } from "../../staff-credential-form";

type TotpSetupState = {
  message: string;
  qrCode: string;
  factorId: string;
  secret: string;
};

type GenerateAction = (
  state: TotpSetupState,
  formData: FormData,
) => Promise<TotpSetupState>;
type ConfirmAction = (
  state: { message: string },
  formData: FormData,
) => Promise<{ message: string }>;

const emptySetup: TotpSetupState = { message: "", qrCode: "", factorId: "", secret: "" };

export function GenerateTotpPanel({
  generateAction,
  confirmAction,
}: {
  generateAction: GenerateAction;
  confirmAction: ConfirmAction;
}) {
  const [state, formAction, pending] = useActionState(generateAction, emptySetup);

  if (!state.qrCode) {
    return (
      <form action={formAction} className="flex flex-col gap-4">
        {state.message ? (
          <p className="text-sm text-danger" role="status">
            {state.message}
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Aguarde…" : "Gerar código"}
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* O QR do Supabase é um data URL. O segredo fica no elemento só para o teste gerar o código. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={state.qrCode}
        alt="Código para configurar o autenticador"
        className="mx-auto h-48 w-48"
        data-testid="totp-secret"
        data-secret={state.secret}
      />
      <StaffCredentialForm
        action={confirmAction}
        submitLabel="Confirmar"
        fields={[
          { name: "code", label: "Código", type: "text", autoComplete: "one-time-code" },
        ]}
        hidden={[{ name: "factorId", value: state.factorId }]}
      />
    </div>
  );
}
