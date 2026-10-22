import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  requestPasswordResetAction,
  setPasswordAction,
} from "@/modules/identity/server/actions";

import { StaffCredentialForm } from "../staff-credential-form";

export const instant = false;

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <main className="mx-auto w-full max-w-[28rem] px-4 py-16">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Redefinir senha</CardTitle>
            <CardDescription>
              {params.code
                ? "Escolha uma nova senha para a sua conta de equipe."
                : "Informe o e-mail da conta. A resposta é a mesma mesmo que ele não esteja cadastrado."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {params.code ? (
              <StaffCredentialForm
                action={setPasswordAction}
                submitLabel="Salvar senha"
                fields={[
                  {
                    name: "password",
                    label: "Nova senha",
                    type: "password",
                    autoComplete: "new-password",
                  },
                ]}
                hidden={[{ name: "code", value: params.code }]}
              />
            ) : (
              <StaffCredentialForm
                action={requestPasswordResetAction}
                submitLabel="Enviar instruções"
                fields={[
                  {
                    name: "email",
                    label: "E-mail",
                    type: "email",
                    autoComplete: "username",
                  },
                ]}
              />
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
