import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { StaffCredentialForm } from "../staff-credential-form";
import { acceptInviteAction } from "./actions";

export const instant = false;

const invalidInvite = "Este convite não é mais válido. Peça um novo à administração.";

export default async function FirstAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string }>;
}) {
  const params = await searchParams;
  const tokenHash = params.token_hash ?? "";

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <main className="mx-auto w-full max-w-[28rem] px-4 py-16">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Primeiro acesso</CardTitle>
            <CardDescription>Crie a senha da sua conta de equipe.</CardDescription>
          </CardHeader>
          <CardContent>
            {tokenHash ? (
              <StaffCredentialForm
                action={acceptInviteAction}
                submitLabel="Criar senha"
                fields={[
                  {
                    name: "password",
                    label: "Senha",
                    type: "password",
                    autoComplete: "new-password",
                  },
                ]}
                hidden={[{ name: "token_hash", value: tokenHash }]}
              />
            ) : (
              <p className="text-sm" role="alert">
                {invalidInvite}
              </p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
