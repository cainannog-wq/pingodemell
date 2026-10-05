// npm run test:consentimento (PR 2 da Fase 4). Duas rodadas, cada uma com
// o seu build:
//   1. com o ID de mentira G-TESTE00000 (nunca o ID real), consentimento.pw.ts;
//   2. sem ID, sem-id.pw.ts.
// CONTEXT fica vazio (build de máquina local, não produção), então a trava
// de produção não zera o ID de mentira. Para no primeiro erro e devolve o
// código de saída do Playwright.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function rodar(rotulo, comando, args, env) {
  console.log(`\n[test:consentimento] ${rotulo}`);
  const r = spawnSync(comando, args, { cwd: raiz, stdio: "inherit", env, shell: process.platform === "win32" });
  if (r.status !== 0) {
    console.error(`[test:consentimento] falhou em: ${rotulo} (código ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

const base = { ...process.env };
delete base.CONTEXT;
delete base.GA4_ID;

const inicio = Date.now();
for (const [modo, ga4] of [
  ["com-id", "G-TESTE00000"],
  ["sem-id", ""],
]) {
  const env = { ...base, PDM_MODO: modo, GA4_ID: ga4 };
  rodar(`build ${modo}`, npx, ["next", "build"], env);
  rodar(`testes ${modo}`, npx, ["playwright", "test", "-c", "testes-navegador/playwright.config.ts"], env);
}
console.log(`\n[test:consentimento] tudo certo em ${Math.round((Date.now() - inicio) / 1000)} s`);
