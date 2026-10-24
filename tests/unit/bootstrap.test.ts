import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  bootstrapLogMessage,
  inviteStaffByEmail,
  readBootstrapEmail,
} from "@/modules/identity/bootstrap-super-admin";

describe("bootstrap do SUPER_ADMIN", () => {
  it("lê o e-mail do comando e recusa a chamada sem ele", () => {
    expect(readBootstrapEmail(["--email", "Admin@Example.com"])).toBe(
      "admin@example.com",
    );
    expect(() => readBootstrapEmail([])).toThrow(/Uso: pnpm admin:bootstrap/);
  });

  it("não deixa o e-mail aparecer na mensagem de erro", () => {
    expect(bootstrapLogMessage(new Error("Falha em admin@example.com"))).toBe(
      "Recusado: o e-mail informado não pode ser usado.",
    );
    expect(bootstrapLogMessage(new Error("Recusado: já existe um SUPER_ADMIN."))).toBe(
      "Recusado: já existe um SUPER_ADMIN.",
    );
  });

  it("o e-mail sai do evento e não entra em env nem em run", () => {
    const workflow = readFileSync(".github/workflows/primeiro-administrador.yml", "utf8");
    expect(workflow).toContain(`EMAIL=$(jq -r '.inputs.email' "$GITHUB_EVENT_PATH")`);
    expect(workflow).toContain('echo "::add-mask::$EMAIL"');
    expect(workflow).toContain('echo "EMAIL=$EMAIL" >> "$GITHUB_ENV"');
    expect(workflow).toContain("NEXT_PUBLIC_SITE_URL: https://adrielliflores.com.br");
    expect(workflow).not.toContain("${{ inputs.email }}");
    const readme = readFileSync("README.md", "utf8");
    expect(readme).toContain("SMTP do Resend já configurado");
    expect(readme).toContain("supabase/templates/invite.html");
    expect(readme).toContain("Este workflow não altera o SMTP.");

    let section = "";
    for (const line of workflow.split("\n")) {
      if (/^\s+env:\s*$/.test(line)) section = "env";
      else if (/^\s+run:/.test(line)) section = "run";
      else if (section && line.trim() !== "" && !line.startsWith(" ")) section = "";
      if (section === "env" || section === "run") {
        expect(line).not.toContain("${{ inputs.email }}");
      }
      if (section === "env") {
        expect(line).not.toContain("inputs.email");
        expect(line).not.toMatch(/^\s+EMAIL:/);
      }
    }
  });

  it("convida pela API admin e não revela a chave quando o convite falha", async () => {
    const secret = "service-role-test";
    let requestUrl = "";
    let authorization = "";
    const created = await inviteStaffByEmail({
      supabaseUrl: "http://127.0.0.1:54321",
      serviceRoleKey: secret,
      email: "admin@example.com",
      fetchImpl: async (url, init) => {
        requestUrl = String(url);
        const headers = new Headers(init?.headers);
        authorization = headers.get("Authorization") ?? "";
        return new Response(
          JSON.stringify({ id: "11111111-1111-4111-8111-111111111111" }),
          { status: 200 },
        );
      },
    });
    expect(created.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(requestUrl).toBe("http://127.0.0.1:54321/auth/v1/invite");
    expect(authorization).toBe(`Bearer ${secret}`);

    await expect(
      inviteStaffByEmail({
        supabaseUrl: "http://127.0.0.1:54321",
        serviceRoleKey: secret,
        email: "admin@example.com",
        fetchImpl: async () => new Response("nope", { status: 500 }),
      }),
    ).rejects.toThrow(/^Recusado: o convite no Supabase Auth falhou\.$/);
  });
});
