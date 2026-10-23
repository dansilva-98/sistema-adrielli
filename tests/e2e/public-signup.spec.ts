import { expect, test } from "@playwright/test";

test("cadastro público da equipe não existe", async ({ request }) => {
  for (const path of ["/cadastro", "/equipe/cadastro"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(404);
  }
});
