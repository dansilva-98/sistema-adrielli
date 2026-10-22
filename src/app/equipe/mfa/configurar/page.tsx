import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { confirmTotpAction, enrollTotp } from "@/modules/identity/server/actions";

import { StaffCredentialForm } from "../../staff-credential-form";

export const instant = false;

export default async function ConfigureMfaPage() {
  const enrolled = await enrollTotp();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <main className="mx-auto w-full max-w-[28rem] px-4 py-16">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Configurar autenticador</CardTitle>
            <CardDescription>
              Escaneie o código no aplicativo autenticador e informe o código de 6
              dígitos.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {"error" in enrolled ? (
              <p className="text-sm text-danger" role="status">
                {enrolled.error}
              </p>
            ) : (
              <>
                {/* O QR do Supabase é um data URL. O CSP já permite imagens data:. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={enrolled.qrCode}
                  alt="Código para configurar o autenticador"
                  className="mx-auto h-48 w-48"
                />
                <StaffCredentialForm
                  action={confirmTotpAction}
                  submitLabel="Confirmar"
                  fields={[
                    {
                      name: "code",
                      label: "Código",
                      type: "text",
                      autoComplete: "one-time-code",
                    },
                  ]}
                  hidden={[{ name: "factorId", value: enrolled.factorId }]}
                />
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
