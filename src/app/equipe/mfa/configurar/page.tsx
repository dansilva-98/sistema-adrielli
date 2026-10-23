import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  confirmTotpAction,
  generateTotpAction,
  requireAuthSession,
} from "@/modules/identity/server/actions";

import { GenerateTotpPanel } from "./generate-totp-panel";

export const instant = false;

export default async function ConfigureMfaPage() {
  await requireAuthSession();
  const supabase = await createSupabaseServerClient();
  const listed = await supabase.auth.mfa.listFactors();
  const verified = (listed.data?.totp ?? []).some(
    (factor) => factor.status === "verified",
  );
  if (verified) redirect("/equipe/mfa/verificar");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <main className="mx-auto w-full max-w-[28rem] px-4 py-16">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Configurar autenticador</CardTitle>
            <CardDescription>
              Gere o código e escaneie no aplicativo autenticador. Depois informe os 6
              dígitos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GenerateTotpPanel
              generateAction={generateTotpAction}
              confirmAction={confirmTotpAction}
            />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
