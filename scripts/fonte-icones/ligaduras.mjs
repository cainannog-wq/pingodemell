// Lê um arquivo woff2 e devolve os textos que a fonte transforma em ícone
// (ligaduras da tabela GSUB, tipo 4, inclusive dentro de extensão, tipo 7).
// Só leitura de bytes, sem dependência: o woff2 guarda as tabelas num bloco
// brotli único (zlib do Node), e cmap e GSUB não são transformadas.
// Usado pelo gerador (scripts/fonte-icones/gerar.mjs) e pelo teste
// src/lib/icones.test.ts.
import { brotliDecompressSync } from "node:zlib";

const TABELAS_CONHECIDAS = (
  "cmap head hhea hmtx maxp name OS/2 post cvt  fpgm glyf loca prep CFF  VORG EBDT " +
  "EBLC gasp hdmx kern LTSH PCLT VDMX vhea vmtx BASE GDEF GPOS GSUB EBSC JSTF MATH " +
  "CBDT CBLC COLR CPAL SVG  sbix acnt avar bdat bloc bsln cvar fdsc feat fmtx fvar " +
  "gvar hsty just lcar mort morx opbd prop trak Zapf Silf Glat Gloc Feat Sill"
)
  .match(/.{4} ?/g)
  .map((s) => s.slice(0, 4));

// Tabelas do woff2 (nome e bytes já descomprimidos, sem desfazer
// transformação: só servem as que não são transformadas).
export function tabelasWoff2(buf) {
  if (buf.toString("latin1", 0, 4) !== "wOF2") throw new Error("O arquivo não é woff2.");
  const quantas = buf.readUInt16BE(12);
  const comprimido = buf.readUInt32BE(20);
  let o = 48;
  const base128 = () => {
    let v = 0;
    for (let i = 0; i < 5; i++) {
      const x = buf[o++];
      v = v * 128 + (x & 127);
      if (!(x & 128)) return v;
    }
    throw new Error("UIntBase128 inválido.");
  };
  const lista = [];
  for (let i = 0; i < quantas; i++) {
    const flags = buf[o++];
    let nome;
    if ((flags & 63) === 63) {
      nome = buf.toString("latin1", o, o + 4);
      o += 4;
    } else {
      nome = TABELAS_CONHECIDAS[flags & 63];
    }
    const versao = (flags >> 6) & 3;
    const original = base128();
    const glyfOuLoca = nome === "glyf" || nome === "loca";
    const transformada = glyfOuLoca ? versao === 0 : versao !== 0;
    const tamanho = transformada ? base128() : original;
    lista.push({ nome: nome.trim(), tamanho, transformada });
  }
  const dados = brotliDecompressSync(buf.subarray(o, o + comprimido));
  const tabelas = new Map();
  let pos = 0;
  for (const t of lista) {
    tabelas.set(t.nome, { bytes: dados.subarray(pos, pos + t.tamanho), transformada: t.transformada });
    pos += t.tamanho;
  }
  return tabelas;
}

// caractere -> glifo, pela subtabela 4 ou 12 do cmap.
function caractereParaGlifo(cmap) {
  const mapa = new Map();
  const n = cmap.readUInt16BE(2);
  for (let i = 0; i < n; i++) {
    const off = cmap.readUInt32BE(4 + i * 8 + 4);
    const formato = cmap.readUInt16BE(off);
    if (formato === 12) {
      const grupos = cmap.readUInt32BE(off + 12);
      for (let g = 0; g < grupos; g++) {
        const p = off + 16 + g * 12;
        const ini = cmap.readUInt32BE(p);
        const fim = cmap.readUInt32BE(p + 4);
        const glifo = cmap.readUInt32BE(p + 8);
        for (let c = ini; c <= fim; c++) mapa.set(c, glifo + c - ini);
      }
    } else if (formato === 4) {
      const segs = cmap.readUInt16BE(off + 6) / 2;
      const fins = off + 14;
      const inis = fins + segs * 2 + 2;
      const deltas = inis + segs * 2;
      const ranges = deltas + segs * 2;
      for (let s = 0; s < segs; s++) {
        const fim = cmap.readUInt16BE(fins + s * 2);
        const ini = cmap.readUInt16BE(inis + s * 2);
        const delta = cmap.readInt16BE(deltas + s * 2);
        const range = cmap.readUInt16BE(ranges + s * 2);
        for (let c = ini; c <= fim && c !== 0xffff; c++) {
          let glifo;
          if (range === 0) glifo = (c + delta) & 0xffff;
          else {
            const p = ranges + s * 2 + range + (c - ini) * 2;
            glifo = cmap.readUInt16BE(p);
            if (glifo !== 0) glifo = (glifo + delta) & 0xffff;
          }
          if (glifo !== 0 && !mapa.has(c)) mapa.set(c, glifo);
        }
      }
    }
  }
  return mapa;
}

function cobertura(t, off) {
  const formato = t.readUInt16BE(off);
  const glifos = [];
  if (formato === 1) {
    const n = t.readUInt16BE(off + 2);
    for (let i = 0; i < n; i++) glifos.push(t.readUInt16BE(off + 4 + i * 2));
  } else if (formato === 2) {
    const n = t.readUInt16BE(off + 2);
    for (let i = 0; i < n; i++) {
      const p = off + 4 + i * 6;
      for (let g = t.readUInt16BE(p); g <= t.readUInt16BE(p + 2); g++) glifos.push(g);
    }
  } else throw new Error(`Cobertura de formato ${formato} desconhecida.`);
  return glifos;
}

// Devolve uma função que diz se um texto vira ícone nesta fonte: o texto
// passa pelo cmap (caractere -> glifo) e a sequência de glifos precisa ser
// uma ligadura inteira. Maiúsculas e minúsculas podem dividir o mesmo glifo,
// por isso a comparação é por glifo, não por letra.
export function ligadurasWoff2(buf) {
  const tabelas = tabelasWoff2(buf);
  const cmap = tabelas.get("cmap");
  const gsub = tabelas.get("GSUB");
  if (!cmap || !gsub || cmap.transformada || gsub.transformada) throw new Error("Fonte sem cmap ou GSUB legível.");
  const glifos = caractereParaGlifo(cmap.bytes);
  const t = gsub.bytes;
  const lookups = t.readUInt16BE(8);
  const sequencias = new Set();
  const subtabelaLigadura = (off) => {
    if (t.readUInt16BE(off) !== 1) return;
    const cobertos = cobertura(t, off + t.readUInt16BE(off + 2));
    const conjuntos = t.readUInt16BE(off + 4);
    for (let i = 0; i < conjuntos; i++) {
      const conj = off + t.readUInt16BE(off + 6 + i * 2);
      const ligs = t.readUInt16BE(conj);
      for (let l = 0; l < ligs; l++) {
        const lig = conj + t.readUInt16BE(conj + 2 + l * 2);
        const comps = t.readUInt16BE(lig + 2);
        const seq = [cobertos[i]];
        for (let c = 1; c < comps; c++) seq.push(t.readUInt16BE(lig + 4 + (c - 1) * 2));
        sequencias.add(seq.join(","));
      }
    }
  };
  const n = t.readUInt16BE(lookups);
  for (let i = 0; i < n; i++) {
    const lk = lookups + t.readUInt16BE(lookups + 2 + i * 2);
    const tipo = t.readUInt16BE(lk);
    const subs = t.readUInt16BE(lk + 4);
    for (let s = 0; s < subs; s++) {
      const sub = lk + t.readUInt16BE(lk + 6 + s * 2);
      if (tipo === 4) subtabelaLigadura(sub);
      else if (tipo === 7 && t.readUInt16BE(sub + 2) === 4) subtabelaLigadura(sub + t.readUInt32BE(sub + 4));
    }
  }
  return {
    quantidade: sequencias.size,
    viraIcone(texto) {
      const seq = [...texto].map((c) => glifos.get(c.codePointAt(0)));
      return seq.every((g) => g !== undefined) && sequencias.has(seq.join(","));
    },
  };
}
