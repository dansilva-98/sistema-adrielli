import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  confirmEmailMfaAction,
  loadVerifyMfaPageData,
  sendEmailMfaAction,
  verifyTotpAction,
} from "@/modules/identity/server/actions";

import { VerifyMfaPanel } from "./verify-mfa-panel";

export const instant = false;

export default async function VerifyMfaPage() {
  const page = await loadVerifyMfaPageData();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <main className="mx-auto w-full max-w-[28rem] px-4 py-16">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Verificar autenticador</CardTitle>
            <CardDescription>
              {page.hasTotp && !page.autoSend.sent
                ? "Informe o código de 6 dígitos do aplicativo autenticador."
                : "Informe o código de 6 dígitos enviado ao seu e-mail."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VerifyMfaPanel
              hasTotp={page.hasTotp}
              emailEnabled={page.emailEnabled}
              verifyTotpAction={verifyTotpAction}
              sendEmailAction={sendEmailMfaAction}
              confirmEmailAction={confirmEmailMfaAction}
              initialEmail={page.autoSend}
            />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
