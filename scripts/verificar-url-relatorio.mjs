// Confere que a URL do relatório de visitas (LOOKER_REPORT_URL) não vaza.
// Nunca imprime a URL: só contagens e nomes de arquivo.
//
// Dois modos:
//
//   node scripts/verificar-url-relatorio.mjs --build
//     Depois de `npm run build`, com LOOKER_REPORT_URL no ambiente do build
//     (um valor de mentira serve). Varre .next/static (tudo que o navegador
//     baixa) e .next/server/app (HTML e RSC gerados no build) atrás do valor
//     e dos marcadores do endereço. Roda antes um controle positivo: um
//     arquivo temporário com o valor TEM que ser achado, senão a varredura
//     está cega.
//
//   node scripts/verificar-url-relatorio.mjs --site https://homologacao--pingodemell.netlify.app
//     Sem sessão (nenhum cookie): pede /admin, /admin/pedidos, /login e /
//     (sem seguir redirecionamentos), também com o cabeçalho RSC: 1, e conta
//     os marcadores no corpo e em cada script que a página carrega. /admin e
//     /admin/pedidos têm que responder 307 para /login.
//
// Os marcadores (hosts do Google e /embed/reporting/) funcionam sem saber o
// valor. Se LOOKER_REPORT_URL estiver no ambiente de quem roda, o valor
// também é procurado.

import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MARCADORES = ["datastudio.google.com", "lookerstudio.google.com", "embed/reporting"];
const valor = (process.env.LOOKER_REPORT_URL ?? "").trim();

function procurados() {
  return [...MARCADORES, ...(valor ? [valor] : [])];
}

function contar(texto) {
  const alvos = procurados();
  return alvos.reduce((soma, alvo) => soma + (texto.includes(alvo) ? 1 : 0), 0);
}

function arquivos(dir) {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    return statSync(caminho).isDirectory() ? arquivos(caminho) : [caminho];
  });
}

function varrer(dir, filtro = () => true) {
  const lista = arquivos(dir).filter(filtro);
  const achados = lista.filter((f) => contar(readFileSync(f, "latin1")) > 0);
  return { total: lista.length, achados };
}

async function modoBuild() {
  if (!valor) {
    console.error("LOOKER_REPORT_URL precisa estar no ambiente do build (um valor de mentira serve).");
    process.exit(2);
  }
  // Controle positivo.
  const tmp = mkdtempSync(join(tmpdir(), "relatorio-"));
  writeFileSync(join(tmp, "controle.js"), `var x = "${valor}";`);
  const controle = varrer(tmp);
  rmSync(tmp, { recursive: true, force: true });
  console.log(`Controle positivo (arquivo com o valor): achados ${controle.achados.length} de ${controle.total} (esperado 1 de 1)`);
  if (controle.achados.length !== 1) {
    console.error("FALHA: a varredura não enxergou o controle.");
    process.exit(1);
  }

  const estatico = varrer(join(".next", "static"));
  console.log(`.next/static (o que o navegador baixa): ${estatico.total} arquivos varridos, ${estatico.achados.length} com a URL ou marcadores`);
  const gerado = varrer(join(".next", "server", "app"), (f) => /\.(html|rsc|segment\.rsc|meta|body)$/.test(f));
  console.log(`.next/server/app (HTML e RSC gerados no build): ${gerado.total} arquivos varridos, ${gerado.achados.length} com a URL ou marcadores`);
  const ruins = [...estatico.achados, ...gerado.achados];
  for (const f of ruins) console.log(`  - ${f}`);
  if (ruins.length > 0) process.exit(1);
  console.log("OK: a URL do relatório não está em arquivo do navegador nem em página gerada no build.");
}

async function pedir(url, extra = {}) {
  const resp = await fetch(url, { redirect: "manual", headers: { "user-agent": "verificar-url-relatorio", ...extra } });
  const corpo = await resp.text();
  return { resp, corpo };
}

async function modoSite(base) {
  const origem = base.replace(/\/$/, "");
  let falhou = false;
  const linhas = [];
  for (const caminho of ["/admin", "/admin/visitas", "/admin/pedidos", "/login", "/"]) {
    for (const rsc of [false, true]) {
      // Com RSC: 1 o Next primeiro redireciona para o mesmo endereço com
      // ?_rsc=...; segue só esse salto (e o próximo) para chegar à resposta
      // de verdade. Redirecionamento para /login para aí.
      let alvo = origem + caminho;
      let { resp, corpo } = await pedir(alvo, rsc ? { rsc: "1" } : {});
      let corposVistos = contar(corpo);
      for (let salto = 0; rsc && salto < 2; salto += 1) {
        const destino = resp.headers.get("location");
        if (resp.status < 300 || resp.status > 399 || !destino || destino.includes("/login")) break;
        alvo = new URL(destino, origem).toString();
        ({ resp, corpo } = await pedir(alvo, { rsc: "1" }));
        corposVistos += contar(corpo);
      }
      const local = resp.headers.get("location") ?? "-";
      const cache = resp.headers.get("cache-control") ?? "-";
      const noCorpo = corposVistos;
      let nosScripts = 0;
      let scripts = 0;
      if (resp.status === 200 && !rsc) {
        const srcs = [...new Set([...corpo.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]))];
        for (const src of srcs) {
          const { corpo: js } = await pedir(new URL(src, origem).toString());
          scripts += 1;
          nosScripts += contar(js);
        }
      }
      const redirecionaAdmin = caminho.startsWith("/admin");
      // Na resposta RSC o redirecionamento pode vir dentro do fluxo (status 200 com
      // a instrução NEXT_REDIRECT para /login), em vez de um 307.
      const mandaParaLogin = (resp.status === 307 && local.endsWith("/login")) || (rsc && corpo.includes("NEXT_REDIRECT") && corpo.includes("/login"));
      const ok = redirecionaAdmin ? mandaParaLogin && noCorpo === 0 : noCorpo === 0 && nosScripts === 0;
      if (!ok) falhou = true;
      linhas.push(
        `${ok ? "ok  " : "FALHA"} ${caminho.padEnd(15)} ${rsc ? "RSC:1" : "html "}  status ${resp.status}  location ${local}  ${redirecionaAdmin ? `login ${mandaParaLogin ? "sim" : "NAO"}  ` : ""}corpo ${noCorpo}  scripts ${scripts} (${nosScripts})  cache-control ${cache}`,
      );
    }
  }
  console.log(linhas.join("\n"));
  console.log(valor ? "Procurou os marcadores e o valor de LOOKER_REPORT_URL." : "Procurou só os marcadores (LOOKER_REPORT_URL não está no ambiente de quem rodou).");
  if (falhou) process.exit(1);
  console.log("OK: sem sessão, nada do relatório no corpo nem nos scripts, e /admin manda para /login.");
}

const args = process.argv.slice(2);
if (args.includes("--build")) await modoBuild();
else if (args[0] === "--site" && args[1]) await modoSite(args[1]);
else {
  console.error("Uso: --build   ou   --site <endereço>");
  process.exit(2);
}
