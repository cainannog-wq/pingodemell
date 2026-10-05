import path from "node:path";
import { defineConfig } from "@playwright/test";

// Prova do consentimento e do GA4 no navegador (PR 2 da Fase 4), fora do
// npm run test. Roda pelo npm run test:consentimento (rodar.mjs), que
// constrói o site duas vezes: com o ID de mentira G-TESTE00000 (PDM_MODO
// "com-id") e sem ID (PDM_MODO "sem-id"). Nenhuma requisição chega ao
// Google nem ao WhatsApp, e nenhuma escrita sai do navegador (apoio.ts).
//
// Usa o Chrome instalado na máquina (channel "chrome"): nada de navegador
// baixado. Sem Chrome, global-setup.ts falha com mensagem clara; o teste
// nunca pula.

const MODO = process.env.PDM_MODO === "sem-id" ? "sem-id" : "com-id";
const PORTA = 3997;

export default defineConfig({
  testDir: ".",
  testMatch: MODO === "sem-id" ? "sem-id.pw.ts" : "consentimento.pw.ts",
  globalSetup: "./global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 60_000,
  reporter: [["list"]],
  // Saída do Playwright (anexos de falha) dentro de .next, já fora do git.
  outputDir: path.resolve(__dirname, "../.next/playwright"),
  use: {
    baseURL: `http://localhost:${PORTA}`,
    channel: "chrome",
    headless: true,
  },
  webServer: {
    // O servidor é iniciado e encerrado pelo próprio Playwright (no Windows,
    // um servidor iniciado à mão por shell ficou órfão na porta).
    command: `npx next start -p ${PORTA}`,
    cwd: path.resolve(__dirname, ".."),
    url: `http://localhost:${PORTA}/quem-somos`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
