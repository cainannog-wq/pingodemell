// Regera o subconjunto da fonte de ícones a partir da lista tipada
// (src/lib/icones.ts). Rodar quando entrar ou sair um ícone:
//
//   node scripts/fonte-icones/gerar.mjs
//
// Pede ao Google Fonts (CSS2, parâmetro icon_names, eixos opsz 24, wght 400,
// FILL 1, GRAD 0) o woff2 só com os nomes da lista, como um navegador
// moderno receberia; confere que o arquivo é woff2, que não tem eixo
// variável e que cada nome vira ícone; e grava, em
// src/fonts/material-symbols-rounded/, o woff2 e o manifesto (nomes, URLs,
// data, bytes e sha256). Só lê da rede; não toca em banco nem em segredo.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ICONES } from "../../src/lib/icones.ts";
import { ligadurasWoff2, tabelasWoff2 } from "./ligaduras.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PASTA = join(RAIZ, "src", "fonts", "material-symbols-rounded");
const ARQUIVO = "material-symbols-rounded.woff2";
// Navegador moderno: com outro agente o Google pode devolver ttf ou woff.
const AGENTE =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

const nomes = [...ICONES];
const ordenados = [...nomes].sort();
if (nomes.join() !== ordenados.join() || new Set(nomes).size !== nomes.length) {
  console.error("src/lib/icones.ts precisa estar em ordem alfabética e sem repetição.");
  process.exit(1);
}

const urlCss =
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,1,0" +
  `&icon_names=${nomes.join(",")}&display=block`;

const respostaCss = await fetch(urlCss, { headers: { "User-Agent": AGENTE } });
if (!respostaCss.ok) throw new Error(`CSS do Google Fonts: HTTP ${respostaCss.status}`);
const css = await respostaCss.text();
const urls = [...css.matchAll(/src:\s*url\(([^)]+)\)\s*format\('woff2'\)/g)].map((m) => m[1]);
if (urls.length !== 1) throw new Error(`Esperava 1 arquivo woff2 no CSS, veio ${urls.length}.`);
const urlWoff2 = urls[0];

const respostaFonte = await fetch(urlWoff2, { headers: { "User-Agent": AGENTE } });
if (!respostaFonte.ok) throw new Error(`woff2 do Google Fonts: HTTP ${respostaFonte.status}`);
const fonte = Buffer.from(await respostaFonte.arrayBuffer());

const tabelas = tabelasWoff2(fonte);
if (tabelas.has("fvar")) throw new Error("A fonte veio com eixo variável (fvar); esperado instância fixa.");
const ligaduras = ligadurasWoff2(fonte);
const faltando = nomes.filter((n) => !ligaduras.viraIcone(n));
if (faltando.length > 0) throw new Error(`Nomes sem ícone no arquivo baixado: ${faltando.join(", ")}`);

const sha256 = createHash("sha256").update(fonte).digest("hex");
const manifesto = {
  familia: "Material Symbols Rounded",
  eixos: { opsz: 24, wght: 400, FILL: 1, GRAD: 0 },
  arquivo: ARQUIVO,
  bytes: fonte.length,
  sha256,
  gerado_em: new Date().toISOString(),
  url_css: urlCss,
  url_woff2: urlWoff2,
  nomes,
};

mkdirSync(PASTA, { recursive: true });
writeFileSync(join(PASTA, ARQUIVO), fonte);
writeFileSync(join(PASTA, "manifesto.json"), JSON.stringify(manifesto, null, 2) + "\n");
console.log(`${nomes.length} ícones, ${fonte.length} bytes, sha256 ${sha256}`);
console.log(`Gravado em ${join("src", "fonts", "material-symbols-rounded")}`);
