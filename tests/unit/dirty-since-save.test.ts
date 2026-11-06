import { describe, expect, it } from "vitest";

import { advanceDirtySinceSave, savedNoticeState } from "@/app/admin/conteudo/cms-fields";

describe("rascunho depois de salvar", () => {
  it("o segundo salvamento deixa de estar sujo", () => {
    const first = advanceDirtySinceSave({
      snapshot: "um",
      savedToken: 2,
      baseline: "um",
      seenToken: false,
    });
    expect(first.dirty).toBe(false);

    const typed = advanceDirtySinceSave({
      snapshot: "dois",
      savedToken: 2,
      baseline: first.baseline,
      seenToken: first.seenToken,
    });
    expect(typed.dirty).toBe(true);

    const second = advanceDirtySinceSave({
      snapshot: "dois",
      savedToken: 3,
      baseline: typed.baseline,
      seenToken: typed.seenToken,
    });
    expect(second.dirty).toBe(false);
  });

  it("remontar com salvamento antigo começa limpo", () => {
    const remounted = advanceDirtySinceSave({
      snapshot: "oculto",
      savedToken: 3,
      baseline: "oculto",
      seenToken: false,
    });
    expect(remounted.dirty).toBe(false);
  });
});

describe("aviso de salvo na montagem", () => {
  it("esconde o aviso de um salvamento anterior à montagem", () => {
    expect(savedNoticeState({ ok: true, version: 2 }, 2, true)).toEqual({
      ok: false,
      message: "",
    });
  });

  it("mostra o aviso quando a versão avançou nesta visita", () => {
    expect(savedNoticeState({ ok: true, version: 3 }, 2, true)).toEqual({
      ok: true,
      version: 3,
    });
  });

  it("esconde o aviso quando a rota foi ocultada", () => {
    expect(savedNoticeState({ ok: true, version: 3 }, 1, true, true)).toEqual({
      ok: false,
      message: "",
    });
  });

  it("mantém o aviso no fluxo de criação", () => {
    expect(savedNoticeState({ ok: true, version: 1 }, 0, false)).toEqual({
      ok: true,
      version: 1,
    });
  });
});
