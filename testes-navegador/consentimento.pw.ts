import { expect, test, type Page } from "@playwright/test";
import {
  ID,
  banner,
  diasAntes,
  eventos,
  gravarEscolha,
  gravarRetrato,
  hojeBrasilia,
  interceptar,
  linkPreferencias,
  semEscritas,
  temDataLayer,
  type Registro,
} from "./apoio";

// Build com o ID de mentira G-TESTE00000 (rodar.mjs). O gtag.js de verdade
// nunca roda: o pedido dele recebe um script falso que não manda nada. Este
// teste prova o que o site faz (quando pede o script, o que põe no
// dataLayer); não prova o que o gtag.js real envia, nem que a medição
// aprimorada está desligada no painel do GA4 (isso é do DebugView).

let registro: Registro;

test.beforeEach(async ({ context }) => {
  registro = await interceptar(context);
});
test.afterEach(() => {
  semEscritas(registro);
});

async function aceitarNaTela(page: Page) {
  await banner(page).getByRole("button", { name: "Aceitar" }).click();
  await expect(banner(page)).toHaveCount(0);
}

async function pageViews(page: Page) {
  await expect.poll(async () => (await eventos(page)).filter((e) => e[0] === "page_view").length).toBeGreaterThan(0);
  return (await eventos(page)).filter((e) => e[0] === "page_view").map((e) => e[1]);
}

test("(a) antes da escolha: banner na tela e 0 requisições ao Google, sem dataLayer", async ({ page }) => {
  await page.goto("/");
  await expect(banner(page)).toBeVisible();
  await page.goto("/produtos");
  await page.goto("/quem-somos");
  await expect(banner(page)).toBeVisible();
  expect(registro.google).toEqual([]);
  expect(await temDataLayer(page)).toBe(false);
});

test("(b) recusar: 0 requisições ao Google, em várias páginas", async ({ page }) => {
  await page.goto("/");
  await banner(page).getByRole("button", { name: "Recusar" }).click();
  await expect(banner(page)).toHaveCount(0);
  for (const caminho of ["/produtos", "/produtos?categoria=bolos", "/quem-somos", "/"]) await page.goto(caminho);
  expect(registro.google).toEqual([]);
  expect(await temDataLayer(page)).toBe(false);
});

test("(c) aceitar: pede o gtag.js com o ID e manda page_view com origem e caminho limpos", async ({ page, baseURL }) => {
  await page.goto("/quem-somos?utm_source=teste#contato");
  expect(registro.google).toEqual([]);
  await aceitarNaTela(page);
  await expect.poll(() => registro.google.length).toBe(1);
  expect(registro.google[0].url).toBe(`https://www.googletagmanager.com/gtag/js?id=${ID}`);
  const [pv] = await pageViews(page);
  expect(pv).toEqual({ page_location: `${baseURL}/quem-somos`, page_referrer: "", page_title: await page.title() });
  // Configuração: page_view automático desligado, cookie de 180 dias, sem
  // sinais do Google nem personalização de anúncios.
  const config = (await page.evaluate(() => Array.from((window as unknown as { dataLayer: ArrayLike<unknown>[] }).dataLayer, (a) => Array.from(a))))
    .find((c) => c[0] === "config") as [string, string, Record<string, unknown>];
  expect(config[1]).toBe(ID);
  expect(config[2]).toMatchObject({ send_page_view: false, cookie_expires: 15552000, allow_google_signals: false, allow_ad_personalization_signals: false });
  expect(config[2]).not.toHaveProperty("debug_mode");
});

test("(d) ?categoria=adicionais passa", async ({ page, baseURL }) => {
  await page.goto("/produtos?categoria=adicionais&utm_source=x");
  await aceitarNaTela(page);
  const [pv] = await pageViews(page);
  expect(pv.page_location).toBe(`${baseURL}/produtos?categoria=adicionais`);
});

test("(e) ?categoria=texto sai só com o caminho", async ({ page, baseURL }) => {
  await page.goto("/produtos?categoria=texto");
  await aceitarNaTela(page);
  const [pv] = await pageViews(page);
  expect(pv.page_location).toBe(`${baseURL}/produtos`);
});

test("(f) ?editar=abc cortado no page_location e no page_referrer; referrer externo só com a origem", async ({ page, baseURL }) => {
  await page.goto("/", { referer: "https://l.instagram.com/caminho?u=x" });
  await aceitarNaTela(page);
  const [inicial] = await pageViews(page);
  expect(inicial.page_referrer).toBe("https://l.instagram.com/");

  await page.goto("/produtos/brigadeiro-gourmet?editar=abc");
  let pvs = await pageViews(page);
  expect(pvs.at(-1)!.page_location).toBe(`${baseURL}/produtos/brigadeiro-gourmet`);
  // Navegação interna (sem recarregar): o referrer é o endereço limpo.
  await page.locator(".site-header-logo").click();
  await page.waitForURL(`${baseURL}/`);
  await expect.poll(async () => (await pageViews(page)).length).toBe(2);
  pvs = await pageViews(page);
  expect(pvs[1]).toMatchObject({ page_location: `${baseURL}/`, page_referrer: `${baseURL}/produtos/brigadeiro-gourmet` });
  expect(JSON.stringify(await eventos(page))).not.toContain("editar");
});

test("(g) revogar pelo rodapé: desliga, apaga _ga e _ga_TESTE00000 e recarrega; depois, nada ao Google", async ({ page, context, baseURL }) => {
  await page.goto("/quem-somos");
  await aceitarNaTela(page);
  await expect.poll(() => registro.google.length).toBe(1);
  const host = new URL(baseURL!).hostname;
  await context.addCookies([
    { name: "_ga", value: "GA1.1.1.1", domain: host, path: "/" },
    { name: "_ga_TESTE00000", value: "GS1.1.1", domain: host, path: "/" },
    { name: "outro", value: "fica", domain: host, path: "/" },
  ]);
  const antes = registro.google.length;

  await linkPreferencias(page).click();
  await expect(banner(page).getByText("Sua escolha atual: Aceito")).toBeVisible();
  const recarga = page.waitForEvent("load");
  await banner(page).getByRole("button", { name: "Recusar" }).click();
  await recarga;

  const nomes = (await context.cookies()).map((c) => c.name).sort();
  expect(nomes).toEqual(["outro"]);
  expect(await temDataLayer(page)).toBe(false);
  await page.goto("/produtos");
  expect(registro.google.length).toBe(antes);
});

test("(h) escolha com 181 dias pergunta de novo (com 180, não)", async ({ page }) => {
  await page.goto("/quem-somos");
  await gravarEscolha(page, "aceito", diasAntes(hojeBrasilia(), 180));
  await page.reload();
  await expect(banner(page)).toHaveCount(0);

  await gravarEscolha(page, "aceito", diasAntes(hojeBrasilia(), 181));
  const antes = registro.google.length;
  await page.reload();
  await expect(banner(page)).toBeVisible();
  expect(registro.google.length).toBe(antes);
});

test("(i) versaoPolitica diferente pergunta de novo", async ({ page }) => {
  await page.goto("/quem-somos");
  await gravarEscolha(page, "aceito", hojeBrasilia(), 2);
  await page.reload();
  await expect(banner(page)).toBeVisible();
  expect(registro.google).toEqual([]);
});

test("(j) /admin e /login: sem banner e 0 requisições ao Google, mesmo com aceite salvo", async ({ page }) => {
  await page.goto("/quem-somos");
  await gravarEscolha(page, "aceito");
  const antes = registro.google.length;
  for (const caminho of ["/login", "/admin"]) {
    await page.goto(caminho);
    await expect(page.getByText("Usamos cookies")).toHaveCount(0);
    expect(await temDataLayer(page)).toBe(false);
  }
  expect(registro.google.length).toBe(antes);
});

test("(k) clique em wa.me: o evento leva só a origem; a URL e a mensagem do WhatsApp não aparecem em nada interceptado", async ({ page }) => {
  await page.goto("/");
  await aceitarNaTela(page);
  const [aba] = await Promise.all([page.waitForEvent("popup"), page.locator(".site-fab").click()]);
  await aba.close();
  const cliques = (await eventos(page)).filter((e) => e[0] === "whatsapp_clique");
  expect(cliques).toEqual([["whatsapp_clique", { origem: "flutuante" }]]);
  expect(registro.whatsapp.length).toBeGreaterThan(0);
  const tudo = JSON.stringify([await eventos(page), registro.google]);
  expect(tudo).not.toContain("wa.me");
  expect(tudo).not.toContain("text=");
  expect(tudo).not.toMatch(/Ol[aá]/);
});

for (const modo of ["registrado", "sem_registro"] as const) {
  test(`(m, n) confirmação ${modo}: confirmacao_exibida e pedido_enviado uma vez cada; recarregar não repete`, async ({ page }) => {
    await page.goto("/quem-somos");
    await gravarEscolha(page, "aceito");
    await gravarRetrato(page, modo);
    await page.goto("/confirmacao");
    await expect(page.getByRole("heading", { level: 1, name: "Falta só enviar" })).toBeVisible();
    await expect.poll(async () => (await eventos(page)).filter((e) => e[0] === "confirmacao_exibida").length).toBe(1);

    const botao = page.getByRole("link", { name: /^Enviar pelo WhatsApp/ });
    const [aba] = await Promise.all([page.waitForEvent("popup"), botao.click()]);
    // O evento sai dentro do clique; a página da confirmação continua (nova aba).
    const depois = (await eventos(page)).map((e) => e[0]);
    expect(depois.filter((n) => n === "pedido_enviado")).toHaveLength(1);
    expect(depois.filter((n) => n === "whatsapp_clique")).toHaveLength(1);
    await aba.close();
    const [aba2] = await Promise.all([page.waitForEvent("popup"), botao.click()]);
    await aba2.close();
    expect((await eventos(page)).filter((e) => e[0] === "pedido_enviado")).toEqual([["pedido_enviado", {}]]);

    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Falta só enviar" })).toBeVisible();
    await expect.poll(async () => (await eventos(page)).some((e) => e[0] === "page_view")).toBe(true);
    expect((await eventos(page)).map((e) => e[0])).not.toContain("confirmacao_exibida");
    const [aba3] = await Promise.all([page.waitForEvent("popup"), botao.click()]);
    await aba3.close();
    expect((await eventos(page)).map((e) => e[0])).not.toContain("pedido_enviado");

    const tudo = JSON.stringify(await eventos(page));
    expect(tudo).not.toContain("9999");
    expect(tudo).not.toContain("wa.me");
    expect(tudo).not.toMatch(/valor|total|price|value|currency/);
  });
}

test("(controle) o interceptador de escritas pega POST /api/pedidos e escrita na Supabase, e nenhuma sai", async ({ page }) => {
  await page.goto("/quem-somos");
  const resultados = await page.evaluate(async () => {
    const tentar = (url: string, init: RequestInit) =>
      fetch(url, init).then(
        () => "respondeu",
        () => "abortada"
      );
    return [
      await tentar("/api/pedidos", { method: "POST", body: "{}" }),
      await tentar("https://exemplo.supabase.co/rest/v1/pedidos", { method: "POST", body: "{}" }),
    ];
  });
  expect(resultados).toEqual(["abortada", "abortada"]);
  expect(registro.escritas.map((e) => `${e.metodo} ${new URL(e.url).pathname}`)).toEqual(["POST /api/pedidos", "POST /rest/v1/pedidos"]);
  // Controle feito: limpa para o afterEach conferir o resto do teste.
  registro.escritas.length = 0;
});
