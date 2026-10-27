import { describe, expect, it } from "vitest";

import {
  ageLabel,
  cpfIsValid,
  maskCpf,
  maskPhone,
  phoneLinks,
  searchText,
} from "../../src/modules/clinic/format";
import { parseCreatePatient } from "../../src/modules/clinic/schema";

const today = "2026-10-27";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const guardian = {
  guardianfullName: "Maria da Conceição",
  guardianrelationship: "MOTHER",
  guardianphone: "(11) 98765-4321",
  guardianemail: "",
  guardiancpf: "",
};

describe("pacientes", () => {
  it("calcula a idade em anos e em meses", () => {
    expect(ageLabel("2018-10-27", today)).toBe("8 anos");
    expect(ageLabel("2018-10-28", today)).toBe("7 anos");
    expect(ageLabel("2026-08-27", today)).toBe("2 meses");
    expect(ageLabel("2026-10-27", today)).toBe("menos de 1 mês");
    expect(ageLabel("2026-10-28", today)).toBe("");
  });

  it("valida o CPF e mascara telefone e CPF", () => {
    expect(cpfIsValid("52998224725")).toBe(true);
    expect(cpfIsValid("11111111111")).toBe(false);
    expect(maskCpf("52998224725")).toBe("529.982.247-25");
    expect(maskPhone("11987654321")).toBe("(11) 98765-4321");
    expect(phoneLinks("11987654321")).toEqual({
      call: "tel:+5511987654321",
      whatsapp: "https://wa.me/5511987654321",
    });
  });

  it("recusa data futura e aceita o cadastro com responsável", () => {
    expect(() =>
      parseCreatePatient(
        form({
          fullName: "João da Conceição",
          preferredName: "",
          birthDate: "2026-10-28",
          cpf: "",
          school: "",
          schoolGrade: "",
          referralSource: "",
          notes: "",
          addressText: "",
          ...guardian,
        }),
        today,
      ),
    ).toThrow(/não pode ser futura/);

    const parsed = parseCreatePatient(
      form({
        fullName: "João da Conceição",
        preferredName: "João",
        birthDate: "2018-01-02",
        cpf: "529.982.247-25",
        school: "",
        schoolGrade: "",
        referralSource: "",
        notes: "",
        addressText: "",
        ...guardian,
      }),
      today,
    );
    expect(parsed.cpf).toBe("52998224725");
    expect(parsed.guardian.phone).toBe("11987654321");
    expect(searchText("100%_")).toBe("100");
  });
});
