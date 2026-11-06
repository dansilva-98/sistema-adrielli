import { describe, expect, it } from "vitest";

import { confirmContentVersion, serverEditSync } from "@/modules/content/edit-sync";

describe("edição acompanha a versão do servidor", () => {
  it("não recarrega depois do próprio salvamento", () => {
    expect(
      serverEditSync({
        serverVersion: 2,
        knownVersion: 1,
        savedVersion: 2,
        dirty: false,
      }),
    ).toEqual({ apply: "remember-save", version: 2 });
  });

  it("recarrega quando a lista avançou a versão e não há rascunho", () => {
    expect(
      serverEditSync({
        serverVersion: 3,
        knownVersion: 2,
        savedVersion: 2,
        dirty: false,
      }),
    ).toEqual({ apply: "reload", version: 3 });
  });

  it("mantém o rascunho e a versão antiga se houver alteração pendente", () => {
    expect(
      serverEditSync({
        serverVersion: 3,
        knownVersion: 2,
        savedVersion: 2,
        dirty: true,
      }),
    ).toEqual({ apply: "keep-draft", version: 2 });
  });

  it("ignora props atrasadas depois de salvar", () => {
    expect(
      serverEditSync({
        serverVersion: 1,
        knownVersion: 2,
        savedVersion: 2,
        dirty: false,
      }),
    ).toEqual({ apply: "remember-save", version: 2 });
  });

  it("a versão confirmada não recua depois de um erro", () => {
    expect(confirmContentVersion(1, 2)).toBe(2);
    expect(confirmContentVersion(2, undefined)).toBe(2);
  });
});
