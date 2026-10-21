// Gera os cinco CSV da carga REAL dos Kits Festa por pessoa (21/10/2026) a partir
// das regras e das tabelas de quantidade que o Cainan mandou (listas dos PDFs da
// Taami, quantidades por tamanho). Os CSV ficam ao lado e são o que a carga lê:
//   node scripts/carga/kit-pessoa-real/gerar.mjs
// Se uma quantidade mudar, muda aqui (ou direto no CSV) e o ensaio da carga
// mostra o relatório. Nada daqui grava no banco.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pasta = path.dirname(fileURLToPath(import.meta.url));

const RECHEIOS = [
  "Morango com chocolate", "Morango com dois amores", "Morango com beijinho", "Morango com prestígio",
  "Morango com brigadeiro branco", "Abacaxi com coco", "Abacaxi com beijinho", "Abacaxi com brigadeiro branco",
  "Salada de frutas", "Pêssego com doce de leite", "Pêssego com brigadeiro branco", "Recheios com chocolate",
];
const FRITOS = ["Coxinha", "Risoles de carne", "Bolinha de queijo", "Kibe", "Croquete de presunto e queijo", "Enroladinho de salsicha"];
const ASSADOS = [
  "Empadinha de palmito", "Empadinha de frango", "Mini pizza de presunto e queijo", "Mini pizza de calabresa",
  "Mini pizza de milho com bacon", "Esfirra de carne", "Esfirra de frango", "Doguinho",
];
const DOCES_8G = ["Brigadeiro", "Beijinho", "Dois amores", "Cajuzinho", "Brigadeiro branco", "Brigadeiro de doce de leite"];
const DOCES_15G = ["Brigadeiro", "Beijinho", "Dois amores", "Churros", "Mineirinho", "Croco de amendoim", "Surpresa de uva", "Óreo", "Ninho com Nutella"];
const SANDUICHES = ["Mini X salada", "Mini dog", "Natural de presunto e queijo", "Pãozinho com patê de frango"];
const BEBIDAS_BASICO = ["Cini", "Coca"];

const L = {
  recheios: "Recheios do bolo", fritos: "Fritos", assados: "Assados", doces8: "Doces 8g", doces15: "Doces 15g",
  sanduiches: "Sanduíches", bebidasBasico: "Bebidas do Básico",
};

// Tamanhos: pessoas, kg de bolo. Descartáveis de 20 pessoas em diante.
const KG = { 10: 1, 15: 1.5, 20: 2, 30: 3, 40: 4, 50: 5, 60: 6, 70: 7, 80: 8, 90: 9, 100: 10 };
const descartaveis = (p) => (p >= 20 ? "sim" : "nao");

// Básico: pessoas -> [doces, fritos, [Cini, rotuloCini], [Coca, rotuloCoca]]
const BASICO = {
  10: [50, 150, [2, "2 Cini 2L"], [1, "1 Coca 1L"]],
  15: [120, 170, [2, "2 Cini 2L"], [1, "1 Coca 2L"]],
  20: [150, 200, [2, "2 Cini 2L"], [1, "1 Coca 2L"]],
  30: [240, 300, [4, "4 Cini 2L"], [2, "2 Coca 2L"]],
  40: [320, 400, [6, "6 Cini 2L"], [3, "3 Coca 2L"]],
  50: [400, 500, [8, "8 Cini 2L"], [4, "4 Coca 2L"]],
  60: [480, 600, [10, "10 Cini 2L"], [5, "5 Coca 2L"]],
  70: [560, 700, [12, "12 Cini 2L"], [6, "6 Coca 2L"]],
  80: [640, 800, [14, "14 Cini 2L"], [7, "7 Coca 2L"]],
  90: [720, 900, [15, "15 Cini 2L"], [7, "7 Coca 2L"]],
  100: [800, 1000, [16, "16 Cini 2L"], [8, "8 Coca 2L"]],
};
// Clássico: pessoas -> [doces, fritos, assados, maxAssados, coca]
const CLASSICO = {
  10: [50, 100, 50, 2, 1], 15: [120, 100, 70, 2, 1], 20: [150, 120, 80, 2, 2], 30: [200, 180, 120, 2, 3],
  40: [300, 250, 150, 3, 4], 50: [350, 300, 200, 4, 5], 60: [400, 360, 240, 5, 6], 70: [500, 400, 300, 6, 7],
  80: [600, 500, 300, 6, 8], 100: [700, 600, 400, 8, 10],
};
// Premium: pessoas -> [doces, fritos, assados, maxAssados, sanduiches, maxSanduiches, coca]
const PREMIUM = {
  10: [50, 80, 50, 2, 20, 1, 1], 15: [120, 80, 60, 2, 30, 1, 1], 20: [150, 80, 80, 2, 40, 1, 1],
  30: [200, 120, 120, 3, 60, 2, 3], 40: [300, 170, 150, 3, 80, 2, 4], 50: [350, 200, 200, 4, 100, 2, 5],
  60: [400, 240, 240, 5, 120, 2, 6], 70: [500, 250, 300, 6, 150, 3, 7], 80: [600, 300, 350, 6, 160, 3, 8],
  100: [700, 400, 400, 8, 200, 4, 10],
};

const csv = (cab, linhas) =>
  [cab, ...linhas].map((l) => (Array.isArray(l) ? l : [l]).map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(",")).join("\n") + "\n";

// --- listas
const listas = [];
for (const [nome, itens] of [[L.recheios, RECHEIOS], [L.fritos, FRITOS], [L.assados, ASSADOS], [L.doces8, DOCES_8G], [L.doces15, DOCES_15G], [L.sanduiches, SANDUICHES], [L.bebidasBasico, BEBIDAS_BASICO]]) {
  for (const item of itens) listas.push([nome, item, item === "Recheios com chocolate" ? "acréscimo a combinar no WhatsApp" : ""]);
}

// --- produtos
const DESC = {
  "Kit Festa Básico": "Bolo, doces e fritos, mais a bebida, para a festa do tamanho que você escolher.",
  "Kit Festa Clássico": "Bolo, doces, fritos e assados, mais Coca 2L, para a festa do tamanho que você escolher.",
  "Kit Festa Premium": "Bolo, doces, fritos, assados e sanduíches, mais Coca 2L, para a festa do tamanho que você escolher.",
};
const produtos = [
  ["Kit Festa Básico", "por-pessoa", "22", "3", "", "Kit Festa Básico 10 pessoas", DESC["Kit Festa Básico"]],
  ["Kit Festa Clássico", "por-pessoa", "34", "3", "nao", "", DESC["Kit Festa Clássico"]],
  ["Kit Festa Premium", "por-pessoa", "37", "3", "nao", "", DESC["Kit Festa Premium"]],
];

// --- grupos
const grupos = [];
const bolo = (k) => [k, "bolo", "Recheio do bolo", "escolha_unica", L.recheios, ""];
grupos.push(bolo("Kit Festa Básico"), ["Kit Festa Básico", "doces", "Doces", "distribuicao", L.doces8, "10"], ["Kit Festa Básico", "fritos", "Fritos", "distribuicao", L.fritos, "10"], ["Kit Festa Básico", "bebida", "Bebida", "escolha_unica", L.bebidasBasico, ""]);
grupos.push(bolo("Kit Festa Clássico"), ["Kit Festa Clássico", "doces", "Doces", "distribuicao", L.doces15, "10"], ["Kit Festa Clássico", "fritos", "Fritos", "distribuicao", L.fritos, "10"], ["Kit Festa Clássico", "assados", "Assados", "distribuicao", L.assados, "10"], ["Kit Festa Clássico", "bebida", "Bebida", "fixo", "", ""]);
grupos.push(bolo("Kit Festa Premium"), ["Kit Festa Premium", "doces", "Doces", "distribuicao", L.doces15, "10"], ["Kit Festa Premium", "fritos", "Fritos", "distribuicao", L.fritos, "10"], ["Kit Festa Premium", "assados", "Assados", "distribuicao", L.assados, "10"], ["Kit Festa Premium", "sanduiches", "Sanduíches", "distribuicao", L.sanduiches, "10"], ["Kit Festa Premium", "bebida", "Bebida", "fixo", "", ""]);

// --- tamanhos e quantidades
const tamanhos = [];
const q = [];
for (const [kit, tabela] of [["Kit Festa Básico", BASICO], ["Kit Festa Clássico", CLASSICO], ["Kit Festa Premium", PREMIUM]]) {
  for (const p of Object.keys(tabela).map(Number)) {
    tamanhos.push([kit, p, String(KG[p]), descartaveis(p)]);
    q.push([kit, p, "bolo", "", 1, "", ""]);
  }
}
for (const [p, [doces, fritos, cini, coca]] of Object.entries(BASICO)) {
  q.push(["Kit Festa Básico", p, "doces", "", doces, "", ""], ["Kit Festa Básico", p, "fritos", "", fritos, "", ""]);
  q.push(["Kit Festa Básico", p, "bebida", "Cini", cini[0], "", cini[1]], ["Kit Festa Básico", p, "bebida", "Coca", coca[0], "", coca[1]]);
}
for (const [p, [doces, fritos, assados, maxA, coca]] of Object.entries(CLASSICO)) {
  q.push(["Kit Festa Clássico", p, "doces", "", doces, "", ""], ["Kit Festa Clássico", p, "fritos", "", fritos, "", ""]);
  q.push(["Kit Festa Clássico", p, "assados", "", assados, maxA, ""], ["Kit Festa Clássico", p, "bebida", "", coca, "", "Coca 2L"]);
}
for (const [p, [doces, fritos, assados, maxA, sand, maxS, coca]] of Object.entries(PREMIUM)) {
  q.push(["Kit Festa Premium", p, "doces", "", doces, "", ""], ["Kit Festa Premium", p, "fritos", "", fritos, "", ""]);
  q.push(["Kit Festa Premium", p, "assados", "", assados, maxA, ""], ["Kit Festa Premium", p, "sanduiches", "", sand, maxS, ""], ["Kit Festa Premium", p, "bebida", "", coca, "", "Coca 2L"]);
}

fs.writeFileSync(path.join(pasta, "listas.csv"), csv("lista,opcao,descricao", listas));
fs.writeFileSync(path.join(pasta, "produtos.csv"), csv("produto,subcategoria,preco,prazo_producao_dias,destaque,herda_destaque_de,descricao", produtos));
fs.writeFileSync(path.join(pasta, "grupos.csv"), csv("produto,chave,rotulo,modo,lista,passo", grupos));
fs.writeFileSync(path.join(pasta, "tamanhos.csv"), csv("produto,pessoas,bolo_kg,descartaveis", tamanhos));
fs.writeFileSync(path.join(pasta, "quantidades.csv"), csv("produto,pessoas,grupo,opcao,total,max_sabores,rotulo", q));
console.log(`listas ${listas.length} itens, produtos ${produtos.length}, grupos ${grupos.length}, tamanhos ${tamanhos.length}, quantidades ${q.length}`);
