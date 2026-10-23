import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireAuthSession, verifyTotpAction } from "@/modules/identity/server/actions";

import { StaffCredentialForm } from "../../staff-credential-form";

export const instant = false;

export default async function VerifyMfaPage() {
  await requireAuthSession();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <main className="mx-auto w-full max-w-[28rem] px-4 py-16">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Verificar autenticador</CardTitle>
            <CardDescription>
              Informe o código de 6 dígitos do aplicativo autenticador.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StaffCredentialForm
              action={verifyTotpAction}
              submitLabel="Verificar"
              fields={[
                {
                  name: "code",
                  label: "Código",
                  type: "text",
                  autoComplete: "one-time-code",
                },
              ]}
            />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
