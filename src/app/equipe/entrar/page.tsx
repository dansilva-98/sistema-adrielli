import { cookies } from "next/headers";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { serverEnv } from "@/lib/env.server";
import {
  isStaffSessionExpired,
  readStaffSession,
  SESSION_EXPIRED_MESSAGE,
  STAFF_SESSION_COOKIE,
} from "@/modules/identity/staff-session";
import { loginAction } from "@/modules/identity/server/actions";

import { StaffCredentialForm } from "../staff-credential-form";

export const instant = false;

export default async function StaffLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string }>;
}) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const token = cookieStore.get(STAFF_SESSION_COOKIE)?.value;
  const session = token ? readStaffSession(token, serverEnv.STAFF_SESSION_SECRET) : null;
  const expired =
    params.motivo === "sessao" || (session !== null && isStaffSessionExpired(session));
  const passwordReset = params.motivo === "senha";

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <main className="mx-auto w-full max-w-[28rem] px-4 py-16">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Entrar na equipe</CardTitle>
            <CardDescription>
              Use o e-mail e a senha da sua conta de equipe.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {expired ? (
              <p className="text-sm text-danger" role="status">
                {SESSION_EXPIRED_MESSAGE}
              </p>
            ) : null}
            {passwordReset ? (
              <p className="text-sm" role="status">
                Senha redefinida. Entre novamente.
              </p>
            ) : null}
            <StaffCredentialForm
              action={loginAction}
              submitLabel="Entrar"
              fields={[
                {
                  name: "email",
                  label: "E-mail",
                  type: "email",
                  autoComplete: "username",
                },
                {
                  name: "password",
                  label: "Senha",
                  type: "password",
                  autoComplete: "current-password",
                },
              ]}
            />
            <a className="text-sm underline" href="/equipe/redefinir-senha">
              Esqueci minha senha
            </a>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
