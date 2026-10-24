import { describe, expect, it } from "vitest";

import { contactSectionSchema } from "@/modules/content/schema";
import { maskWhatsapp, whatsAppUrl } from "@/modules/content/whatsapp";

describe("editor do site", () => {
  it("mascara o WhatsApp e grava só os dígitos", () => {
    expect(maskWhatsapp("5511988887777")).toBe("+55 (11) 98888-7777");
    expect(maskWhatsapp("+55 (11) 98888-7777")).toBe("+55 (11) 98888-7777");
    const parsed = contactSectionSchema.parse({
      version: 1,
      whatsappNumber: "+55 (11) 98888-7777",
      whatsappMessage: "Olá",
      contactEmail: "",
      addressText: "",
      serviceAreaText: "",
    });
    expect(parsed.whatsappNumber).toBe("5511988887777");
    expect(whatsAppUrl(parsed.whatsappNumber, parsed.whatsappMessage)).toBe(
      "https://wa.me/5511988887777?text=Ol%C3%A1",
    );
  });
});
