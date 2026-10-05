// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://homologacao--pingodemell.netlify.app/"}
import { afterEach, expect, it, vi } from "vitest";
import { CHAVE_CONSENTIMENTO, reiniciarConsentimentoParaTeste } from "@/lib/consentimento/consentimento";
import { iniciarGtag, reiniciarAnaliticaParaTeste } from "./gtag";

// debug_mode só no host da homologação, testado em execução
// (location.hostname); gtag.test.ts prova a ausência em outro host.
afterEach(() => {
  reiniciarAnaliticaParaTeste();
  vi.unstubAllEnvs();
});

it("na homologação, o config leva debug_mode: true", () => {
  vi.stubEnv("GA4_ID", "G-TESTE00000");
  window.localStorage.setItem(CHAVE_CONSENTIMENTO, JSON.stringify({ versao: 1, escolha: "aceito", data: "2026-10-05", versaoPolitica: 1 }));
  reiniciarConsentimentoParaTeste();
  iniciarGtag("G-TESTE00000");
  const config = (window.dataLayer ?? []).map((a) => Array.from(a as ArrayLike<unknown>)).find((c) => c[0] === "config");
  expect(config?.[2]).toMatchObject({ debug_mode: true, send_page_view: false });
});
