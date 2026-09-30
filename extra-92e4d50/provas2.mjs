// Provas extras do PR quem-somos: contraste medido, rede por domínio e
// árvore de acessibilidade nos dois tamanhos. Só lê; não clica em nada.
// Uso: node provas2.mjs <baseUrl> <pastaSaida>
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.argv[2];
const OUT = process.argv[3];
mkdirSync(OUT, { recursive: true });
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORTA = 9334;
const edge = spawn(EDGE, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${PORTA}`, `--user-data-dir=${path.resolve(OUT, "..", "perfil-cdp2")}`, "about:blank"], { stdio: "ignore" });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
let alvo;
for (let i = 0; i < 40 && !alvo; i++) {
  try {
    alvo = (await (await fetch(`http://127.0.0.1:${PORTA}/json/list`)).json()).find((t) => t.type === "page");
  } catch {
    await esperar(250);
  }
}
const ws = new WebSocket(alvo.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0;
const pendentes = new Map();
const eventos = [];
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pendentes.has(m.id)) {
    const { ok, erro } = pendentes.get(m.id);
    pendentes.delete(m.id);
    m.error ? erro(new Error(JSON.stringify(m.error))) : ok(m.result);
  } else if (m.method) eventos.push(m);
});
const cdp = (method, params = {}) =>
  new Promise((ok, erro) => {
    const n = ++id;
    pendentes.set(n, { ok, erro });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const js = async (expr) => (await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result.value;
await cdp("Page.enable");
await cdp("Network.enable");
await cdp("Accessibility.enable");
await cdp("Network.setCacheDisabled", { cacheDisabled: true });

async function abrir(largura) {
  await cdp("Emulation.setDeviceMetricsOverride", { width: largura, height: largura < 768 ? 812 : 900, deviceScaleFactor: 1, mobile: largura < 768 });
  await cdp("Emulation.setTouchEmulationEnabled", { enabled: largura < 768 });
  eventos.length = 0;
  await cdp("Page.navigate", { url: `${BASE}/quem-somos` });
  for (let i = 0; i < 80; i++) {
    await esperar(250);
    if ((await js("document.readyState")) === "complete") break;
  }
  await js("document.fonts.ready.then(() => true)");
  // Rola a página inteira (imagens de carregamento tardio entram na rede).
  await js("(async () => { for (let y = 0; y < document.body.scrollHeight; y += 300) { scrollTo(0, y); await new Promise(r => setTimeout(r, 150)); } scrollTo(0, 0); return true; })()");
  await esperar(3000);
}

// Contraste WCAG de cada texto do main contra o fundo que está de fato
// atrás dele (primeiro ancestral com cor de fundo; alfa parcial é somado
// por cima do de baixo).
const MEDIR = `(() => {
  const rgba = (s) => { const m = s.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const sobre = (cima, baixo) => { const a = cima[3]; return [0, 1, 2].map((i) => cima[i] * a + baixo[i] * (1 - a)).concat(1); };
  const fundo = (el) => { const camadas = []; for (let e = el; e; e = e.parentElement) { const c = rgba(getComputedStyle(e).backgroundColor); if (c && c[3] > 0) { camadas.push(c); if (c[3] >= 1) break; } } let r = [255, 255, 255, 1]; for (const c of camadas.reverse()) r = sobre(c, r); return r; };
  const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const razao = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const main = document.querySelector('main');
  const linhas = [];
  for (const el of main.querySelectorAll('*')) {
    const texto = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
    if (!texto) continue;
    if (el.closest('[aria-hidden="true"]')) continue;
    const cs = getComputedStyle(el);
    if (el.getClientRects().length === 0 || cs.visibility !== 'visible') continue;
    if (el.closest('.site-visually-hidden')) continue;
    const bg = fundo(el);
    const cor = sobre(rgba(cs.color), bg);
    const secao = el.closest('section');
    linhas.push({ secao: secao?.className || secao?.id || '', texto: texto.slice(0, 50), cor: hex(cor), fundo: hex(bg), px: parseFloat(cs.fontSize), peso: cs.fontWeight, razao: Math.round(razao(cor, bg) * 100) / 100 });
  }
  const teste = (a, b) => Math.round(razao(rgba(a), rgba(b)) * 100) / 100;
  return { linhas, referencia: {
    'texto cinza --text-muted #6b655c sobre dourado claro --gold-100 #fff8d9': teste('rgb(107,101,92)', 'rgb(255,248,217)'),
    'texto cinza --text-muted #6b655c sobre creme --surface-page #f2f0e9': teste('rgb(107,101,92)', 'rgb(242,240,233)'),
    'texto cinza --text-muted #6b655c sobre cartão --cream-050 #faf9f4': teste('rgb(107,101,92)', 'rgb(250,249,244)'),
  } };
})()`;

// Árvore de acessibilidade como o leitor de tela recebe (nós ignorados fora).
async function arvore() {
  const { nodes } = await cdp("Accessibility.getFullAXTree");
  const porId = new Map(nodes.map((n) => [n.nodeId, n]));
  const principal = nodes.find((n) => n.role?.value === "main");
  const saida = [];
  const andar = (n, nivel) => {
    if (!n) return;
    const nome = n.name?.value ?? "";
    if (!n.ignored && n.role?.value !== "generic" && n.role?.value !== "none" && (nome || ["heading", "link", "list", "listitem", "figure", "blockquote", "region", "image", "img"].includes(n.role?.value))) {
      saida.push(`${"  ".repeat(nivel)}${n.role?.value}${nome ? `: "${nome}"` : ""}`);
    }
    for (const c of n.childIds ?? []) andar(porId.get(c), n.ignored ? nivel : nivel + 1);
  };
  andar(principal, 0);
  return saida;
}

const SO_DESKTOP = [
  "e uma bancada pequena. De lá para cá crescemos com o bairro",
  "O que não mudou foi o cuidado. Cada pedido ainda passa pela mão da Taami",
  "do jeito que a gente serviria em casa.",
  "A gente pergunta o tema, as cores e a idade porque cada festa tem uma história.",
  "Nada sai daqui sem passar pela nossa conferência.",
  "Seguir no Instagram",
  // Linha própria do dia fechado (maiúscula só pelo CSS ::first-letter).
  'StaticText: "Segunda fechado"',
];
const SO_MOBILE = [
  "Hoje atendemos Fazenda Rio Grande com bolos, salgados, doces tradicionais, personalizados e finos. O cuidado é o que não mudou.",
  "Tema, cores e idade: cada festa tem uma história.",
  "Prazos combinados e cumpridos, com conferência item por item.",
  // O React separa " · " e "segunda fechado" em dois textos.
  'StaticText: " · "\n',
  'StaticText: "segunda fechado"',
];

const resultado = {};
const rede = {};
for (const largura of [1280, 375]) {
  await abrir(largura);
  const reqs = eventos.filter((e) => e.method === "Network.requestWillBeSent").map((e) => e.params.request.url);
  rede[largura] = reqs;
  const medicao = await js(MEDIR);
  const ax = await arvore();
  const texto = ax.join("\n");
  const presenca = (lista) => Object.fromEntries(lista.map((t) => [t, texto.includes(t)]));
  resultado[largura] = { medicao, presencaDesktop: presenca(SO_DESKTOP), presencaMobile: presenca(SO_MOBILE) };
  writeFileSync(path.join(OUT, `arvore-acessibilidade-${largura}.txt`), texto + "\n");
}

// Rede por domínio.
const linhasRede = [];
for (const largura of [1280, 375]) {
  const porDominio = {};
  for (const u of rede[largura]) {
    const host = /^https?:/.test(u) ? new URL(u).host : u.split(":")[0] + ":";
    (porDominio[host] ??= []).push(u);
  }
  linhasRede.push(`=== ${BASE}/quem-somos em ${largura}px: ${rede[largura].length} requisições ===`);
  for (const [host, urls] of Object.entries(porDominio).sort()) {
    linhasRede.push(`\n${host} (${urls.length})${host === new URL(BASE).host ? "  [o próprio site]" : "  [TERCEIRO]"}`);
    for (const u of urls) linhasRede.push(`  ${u.length > 160 ? u.slice(0, 160) + "…" : u}`);
  }
  linhasRede.push("");
}
writeFileSync(path.join(OUT, "rede-por-dominio.txt"), linhasRede.join("\n"));

// Contraste: tabela.
const linhasContraste = [];
for (const largura of [1280, 375]) {
  const { linhas, referencia } = resultado[largura].medicao;
  linhasContraste.push(`=== ${largura}px: ${linhas.length} textos visíveis no main; menor razão ${Math.min(...linhas.map((l) => l.razao))}:1 ===`);
  for (const l of linhas) linhasContraste.push(`${l.razao.toFixed(2).padStart(6)}:1  cor ${l.cor} sobre ${l.fundo}  ${l.px}px/${l.peso}  [${l.secao}]  "${l.texto}"`);
  if (largura === 1280) {
    linhasContraste.push("\nReferência (cálculo com os tokens):");
    for (const [k, v] of Object.entries(referencia)) linhasContraste.push(`  ${v.toFixed(2)}:1  ${k}`);
  }
  linhasContraste.push("");
}
writeFileSync(path.join(OUT, "contraste.txt"), linhasContraste.join("\n"));

// Versões inativas.
const linhasVersoes = [];
for (const largura of [1280, 375]) {
  linhasVersoes.push(`=== ${largura}px: árvore de acessibilidade do main (o que o leitor de tela recebe) ===`);
  for (const [t, v] of Object.entries(resultado[largura].presencaDesktop)) linhasVersoes.push(`  [só desktop] ${v ? "PRESENTE" : "ausente "}  "${t}"`);
  for (const [t, v] of Object.entries(resultado[largura].presencaMobile)) linhasVersoes.push(`  [só mobile ] ${v ? "PRESENTE" : "ausente "}  "${t}"`);
  linhasVersoes.push("");
}
writeFileSync(path.join(OUT, "versoes-inativas.txt"), linhasVersoes.join("\n"));
console.log(linhasVersoes.join("\n"));
console.log(linhasContraste.join("\n"));
console.log(linhasRede.filter((l) => l.startsWith("===") || /^\S.*\(\d+\)/.test(l)).join("\n"));
ws.close();
edge.kill();
process.exit(0);
