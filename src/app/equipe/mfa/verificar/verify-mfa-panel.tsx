"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { StaffCredentialForm } from "../../staff-credential-form";

type EmailMfaFormState = {
  message: string;
  sent: boolean;
  locked: boolean;
  retryAt: number;
  maskedEmail: string;
};

type EmailAction = (
  state: EmailMfaFormState,
  formData: FormData,
) => Promise<EmailMfaFormState>;
type TotpAction = (
  state: { message: string },
  formData: FormData,
) => Promise<{ message: string }>;

function remainingSeconds(retryAt: number): number {
  return Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
}

export function VerifyMfaPanel({
  hasTotp,
  emailEnabled,
  verifyTotpAction,
  sendEmailAction,
  confirmEmailAction,
  initialEmail,
}: {
  hasTotp: boolean;
  emailEnabled: boolean;
  verifyTotpAction: TotpAction;
  sendEmailAction: EmailAction;
  confirmEmailAction: EmailAction;
  initialEmail: EmailMfaFormState;
}) {
  const [method, setMethod] = useState<"totp" | "email">(hasTotp ? "totp" : "email");
  const [sendState, sendAction, sending] = useActionState(sendEmailAction, initialEmail);
  const [confirmState, confirmAction, confirming] = useActionState(
    confirmEmailAction,
    initialEmail,
  );
  const [, setTick] = useState(0);

  useEffect(() => {
    if (sendState.retryAt <= Date.now()) return;
    const timer = window.setInterval(() => {
      setTick((value) => value + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [sendState.retryAt]);

  const seconds = remainingSeconds(sendState.retryAt);

  const sent = sendState.sent || initialEmail.sent;
  const masked = sendState.maskedEmail || initialEmail.maskedEmail;
  const message = confirmState.message || sendState.message;
  const locked = confirmState.locked;
  const canResend = seconds === 0 && !sending;

  if (method === "totp" && hasTotp) {
    return (
      <div className="flex flex-col gap-4">
        <StaffCredentialForm
          action={verifyTotpAction}
          submitLabel="Verificar"
          submitClassName="h-11 min-h-11"
          fields={[
            {
              name: "code",
              label: "Código",
              type: "text",
              autoComplete: "one-time-code",
              inputMode: "numeric",
              maxLength: 6,
            },
          ]}
        />
        {emailEnabled ? (
          <form
            action={sendAction}
            onSubmit={() => {
              setMethod("email");
            }}
          >
            <Button type="submit" variant="link" className="h-11 min-h-11 px-0">
              Receber código por e-mail
            </Button>
          </form>
        ) : null}
      </div>
    );
  }

  if (!emailEnabled) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm">Use um aplicativo autenticador para confirmar o acesso.</p>
        <Link
          href="/equipe/mfa/configurar"
          className="inline-flex min-h-11 items-center text-primary"
        >
          Prefiro usar um aplicativo autenticador
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        {sent
          ? `Enviamos um código para ${masked}.`
          : `Enviaremos um código para ${masked}.`}
      </p>
      {message ? (
        <p className="text-sm" role="status">
          {message}
        </p>
      ) : null}
      {locked ? (
        <p className="text-sm" role="status">
          Peça um novo código.
        </p>
      ) : null}
      {sent && !locked ? (
        <form action={confirmAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="code">Código</Label>
            <Input
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              required
              className="h-11 min-h-11"
            />
          </div>
          <Button
            type="submit"
            disabled={confirming}
            variant="outline"
            className="h-11 min-h-11"
          >
            {confirming ? "Aguarde…" : "Confirmar"}
          </Button>
        </form>
      ) : null}
      <form action={sendAction}>
        <Button
          type="submit"
          disabled={!canResend}
          className="h-11 min-h-11"
          variant={sent ? "outline" : "default"}
        >
          {sending
            ? "Enviando…"
            : sent
              ? canResend
                ? "Reenviar código"
                : `Reenviar código (${seconds}s)`
              : "Enviar código"}
        </Button>
      </form>
      {hasTotp ? (
        <Button
          type="button"
          variant="link"
          className="h-11 min-h-11 px-0"
          onClick={() => {
            setMethod("totp");
          }}
        >
          Código do aplicativo
        </Button>
      ) : (
        <Link
          href="/equipe/mfa/configurar"
          className="inline-flex min-h-11 items-center text-primary"
        >
          Prefiro usar um aplicativo autenticador
        </Link>
      )}
    </div>
  );
}
