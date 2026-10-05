import { expect, test } from "@playwright/test";
import { banner, gravarEscolha, interceptar, linkPreferencias, semEscritas, temDataLayer, type Registro } from "./apoio";

// Build sem GA4_ID (rodar.mjs). O controle positivo (banner e link
// aparecem com o ID) está em consentimento.pw.ts, caso (a).

let registro: Registro;
test.beforeEach(async ({ context }) => {
  registro = await interceptar(context);
});
test.afterEach(() => {
  semEscritas(registro);
});

test("(l) sem ID: sem banner, sem link de preferências, sem dataLayer e 0 requisições ao Google, mesmo com aceite salvo", async ({ page }) => {
  for (const caminho of ["/", "/produtos?categoria=bolos", "/quem-somos", "/carrinho", "/politica-de-privacidade"]) {
    await page.goto(caminho);
    await expect(page.locator("footer")).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
    await expect(linkPreferencias(page)).toHaveCount(0);
    expect(await temDataLayer(page)).toBe(false);
  }
  await gravarEscolha(page, "aceito");
  await page.goto("/");
  await expect(page.locator("footer")).toBeVisible();
  expect(await temDataLayer(page)).toBe(false);
  expect(registro.google).toEqual([]);
});
