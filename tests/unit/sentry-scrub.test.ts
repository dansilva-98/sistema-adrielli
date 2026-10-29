import { describe, expect, it } from "vitest";

import { scrubSentryEvent } from "@/lib/sentry-scrub";

describe("scrubSentryEvent", () => {
  it("remove corpo, cookies, autorização, query string e campos sensíveis", () => {
    const original = {
      request: {
        url: "https://adrielliflores.example/equipe/entrar?token=abc&email=pessoa@example.com",
        query_string: "token=abc",
        data: { password: "segredo", note: "manter" },
        cookies: { session: "cookie-secreto" },
        headers: {
          Authorization: "Bearer segredo",
          Cookie: "session=cookie-secreto",
          "Content-Type": "application/json",
        },
      },
      extra: {
        email: "pessoa@example.com",
        phone: "11999999999",
        cpf: "00000000000",
        nested: { code: "123456", token: "abc", ok: true },
      },
      user: { email: "pessoa@example.com", id: "user-1" },
      message: "falha em https://adrielliflores.example/rota?password=segredo",
      detail: "SMTP recusou pessoa@example.com",
    };

    const scrubbed = scrubSentryEvent(original);
    const serialized = JSON.stringify(scrubbed);

    expect(original.request.data.password).toBe("segredo");
    expect(scrubbed.request.data).toBeUndefined();
    expect(scrubbed.request.cookies).toBeUndefined();
    expect(scrubbed.request.query_string).toBeUndefined();
    expect(scrubbed.request.headers.Authorization).toBeUndefined();
    expect(scrubbed.request.headers.Cookie).toBeUndefined();
    expect(scrubbed.request.headers["Content-Type"]).toBe("application/json");
    expect(scrubbed.request.url).toBe("https://adrielliflores.example/equipe/entrar");
    expect(scrubbed.extra.email).toBeUndefined();
    expect(scrubbed.extra.phone).toBeUndefined();
    expect(scrubbed.extra.cpf).toBeUndefined();
    expect(scrubbed.extra.nested.code).toBeUndefined();
    expect(scrubbed.extra.nested.token).toBeUndefined();
    expect(scrubbed.extra.nested.ok).toBe(true);
    expect(scrubbed.user.email).toBeUndefined();
    expect(scrubbed.user.id).toBe("user-1");
    expect(serialized).not.toContain("pessoa@example.com");
    expect(serialized).not.toContain("Bearer segredo");
    expect(serialized).not.toContain("cookie-secreto");
    expect(serialized).not.toContain("password=segredo");
    expect(scrubbed.message).toBe("falha em https://adrielliflores.example/rota");
    expect(scrubbed.detail).toBe("SMTP recusou [redacted]");
  });

  it("remove dados de paciente e token ou secao da query", () => {
    const scrubbed = scrubSentryEvent({
      request: {
        url: "https://adrielliflores.example/consultorio/pacientes/id?token=tokensecreto&secao=anexos&situacao=arquivados",
      },
      transaction:
        "/consultorio/pacientes/id?token=tokensecreto&secao=anexos&situacao=arquivados",
      breadcrumbs: [
        {
          category: "fetch",
          data: {
            url: "https://adrielliflores.example/storage/v1/object/sign/clinic-private/patients/id/file.pdf?token=tokensecreto&secao=anexos",
          },
        },
        {
          category: "xhr",
          data: {
            url: "/storage/v1/object/sign/clinic-private/patients/id/file.pdf?token=tokensecreto&secao=anexos",
          },
        },
      ],
      extra: {
        full_name: "NOME-COMPLETO-PRIVADO",
        fullName: "NOME-COMPLETO-PRIVADO",
        preferred_name: "APELIDO-PRIVADO",
        birth_date: "2018-01-02",
        cpf: "52998224725",
        phone: "11988887777",
        email: "pessoa-privada@example.com",
        preferredName: "APELIDO-CAMEL",
        birthDate: "2018-02-02",
        addressText: "ENDERECO-CAMEL",
        originalName: "ARQUIVO-CAMEL.pdf",
        school: "ESCOLA-PRIVADA",
        school_grade: "SERIE-PRIVADA",
        schoolGrade: "SERIE-CAMEL",
        notes: "NOTA-PRIVADA",
        address_text: "ENDERECO-PRIVADO",
        original_name: "ARQUIVO-PRIVADO.pdf",
        guardian: "RESPONSAVEL-PRIVADO",
        guardians: "RESPONSAVEIS-PRIVADOS",
        ok: true,
      },
    });
    const serialized = JSON.stringify(scrubbed);

    expect(scrubbed.request.url).toBe(
      "https://adrielliflores.example/consultorio/pacientes/id",
    );
    expect(scrubbed.transaction).toBe("/consultorio/pacientes/id?situacao=arquivados");
    expect(scrubbed.breadcrumbs[0].data.url).toBe(
      "https://adrielliflores.example/storage/v1/object/sign/clinic-private/patients/id/file.pdf",
    );
    expect(scrubbed.breadcrumbs[1].data.url).toBe(
      "/storage/v1/object/sign/clinic-private/patients/id/file.pdf",
    );
    expect(scrubbed.extra.ok).toBe(true);
    expect(scrubbed.extra.full_name).toBeUndefined();
    expect(scrubbed.extra.fullName).toBeUndefined();
    expect(scrubbed.extra.guardian).toBeUndefined();
    expect(serialized).not.toContain("tokensecreto");
    expect(serialized).not.toContain("secao=");
    expect(serialized).not.toContain("NOME-COMPLETO-PRIVADO");
    expect(serialized).not.toContain("APELIDO-PRIVADO");
    expect(serialized).not.toContain("APELIDO-CAMEL");
    expect(serialized).not.toContain("52998224725");
    expect(serialized).not.toContain("11988887777");
    expect(serialized).not.toContain("pessoa-privada@example.com");
    expect(serialized).not.toContain("ESCOLA-PRIVADA");
    expect(serialized).not.toContain("SERIE-PRIVADA");
    expect(serialized).not.toContain("SERIE-CAMEL");
    expect(serialized).not.toContain("NOTA-PRIVADA");
    expect(serialized).not.toContain("ENDERECO-PRIVADO");
    expect(serialized).not.toContain("ENDERECO-CAMEL");
    expect(serialized).not.toContain("ARQUIVO-PRIVADO.pdf");
    expect(serialized).not.toContain("ARQUIVO-CAMEL.pdf");
    expect(serialized).not.toContain("RESPONSAVEL-PRIVADO");
    expect(serialized).not.toContain("RESPONSAVEIS-PRIVADOS");
    expect(serialized).not.toContain("2018-01-02");
    expect(serialized).not.toContain("2018-02-02");
  });

  it("mantém o nome do SDK e remove chaves compostas e o nome do paciente", () => {
    const scrubbed = scrubSentryEvent({
      sdk: { name: "sentry.javascript.node" },
      contexts: {
        os: { name: "Windows" },
        browser: { name: "Chrome" },
      },
      request: {
        headers: {
          "x-supabase-token": "TOKEN-CABECALHO",
          "Content-Type": "application/json",
        },
      },
      extra: {
        fullName: "NOME-COMPLETO-PRIVADO",
        full_name: "NOME-COMPLETO-PRIVADO",
        access_token: "TOKEN-ACESSO",
        refreshToken: "TOKEN-RENOVACAO",
        userEmail: "EMAIL-USUARIO-PRIVADO",
        guardianPhone: "TELEFONE-RESPONSAVEL",
        otpCode: "CODIGO-OTP",
        newPassword: "SENHA-NOVA",
      },
    });
    const serialized = JSON.stringify(scrubbed);

    expect(scrubbed.sdk.name).toBe("sentry.javascript.node");
    expect(scrubbed.contexts.os.name).toBe("Windows");
    expect(scrubbed.contexts.browser.name).toBe("Chrome");
    expect(scrubbed.request.headers["Content-Type"]).toBe("application/json");
    expect(scrubbed.request.headers["x-supabase-token"]).toBeUndefined();
    expect(scrubbed.extra.fullName).toBeUndefined();
    expect(scrubbed.extra.full_name).toBeUndefined();
    expect(scrubbed.extra.access_token).toBeUndefined();
    expect(scrubbed.extra.refreshToken).toBeUndefined();
    expect(scrubbed.extra.userEmail).toBeUndefined();
    expect(scrubbed.extra.guardianPhone).toBeUndefined();
    expect(scrubbed.extra.otpCode).toBeUndefined();
    expect(scrubbed.extra.newPassword).toBeUndefined();
    expect(serialized).not.toContain("NOME-COMPLETO-PRIVADO");
    expect(serialized).not.toContain("TOKEN-CABECALHO");
    expect(serialized).not.toContain("TOKEN-ACESSO");
    expect(serialized).not.toContain("TOKEN-RENOVACAO");
    expect(serialized).not.toContain("EMAIL-USUARIO-PRIVADO");
    expect(serialized).not.toContain("TELEFONE-RESPONSAVEL");
    expect(serialized).not.toContain("CODIGO-OTP");
    expect(serialized).not.toContain("SENHA-NOVA");
  });
});
