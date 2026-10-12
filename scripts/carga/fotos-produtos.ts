// Carga das fotos dos produtos a partir de um manifesto (11/10/2026).
// GRAVA EM PRODUÇÃO com --executar: não é teste (como os seed-*.mjs).
//
// O que faz, por produto do manifesto que ainda está vazio (sem capa e sem
// foto extra):
// - cada foto passa pela MESMA redução do admin (reduzirFoto, de
//   src/lib/galeria/reduzir.ts: lado maior até 2000px, WebP 0,85/0,75/0,65,
//   até 2 MB, sem metadados), com um motor sharp no lugar do canvas do
//   navegador. HEIC é convertido antes, sem perda, pelo leitor do Windows;
// - sobe a capa em capa/{id}/{uuid}.webp e as extras em
//   galeria/{id}/{uuid}.webp (os caminhos do admin, montados pelas mesmas
//   funções), uma cópia por produto mesmo quando o arquivo de origem é o
//   mesmo (a limpeza de capa/{id}/ do admin apagaria um arquivo
//   compartilhado);
// - depois de subir tudo, grava numa transação só: image_url (endereço
//   público, como o admin) e as linhas de produto_fotos com a posição do
//   manifesto. Dentro dela, e só dentro dela, desliga o gatilho
//   produtos_set_atualizado_em (a ordem de "Os mais pedidos" usa
//   atualizado_em e não pode mudar). Os gatilhos do slug ficam ligados.
//   lock_timeout de 2 s; qualquer falha desfaz tudo e apaga os arquivos que
//   esta execução subiu.
//
// Nunca envia slug, nunca altera nome, preço, unidade, categoria, ativo ou
// destaque, e só apaga do storage arquivo que esta execução subiu (ou que o
// registro de uma carga lista, no --desfazer).
//
// Uso (na raiz do repositório; a senha do banco e a chave de serviço vêm do
// .env.local e nunca são impressas):
//   npx vite-node --config vitest.config.ts scripts/carga/fotos-produtos.ts -- \
//     --manifesto=<csv> --fotos=<pasta extraída> --backup=<pasta fora do git> \
//     --etapa=piloto|restante [--executar]
//   ... -- --backup=<pasta> --desfazer=<registro.json> [--executar]
// Sem --executar: só lê, reduz as fotos na memória e mostra o que faria.

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
type Storage = ReturnType<ReturnType<typeof createClient>["storage"]["from"]>;
import sharp from "sharp";
import { reduzirFoto, type ImagemDecodificada, type MotorImagem } from "@/lib/galeria/reduzir";
import { BUCKET_FOTOS, MAX_FOTOS_EXTRAS, montarCaminho, tipoPelosBytes } from "@/lib/galeria/regras";
import { montarCaminhoCapa } from "@/lib/galeria/capa";
import { selecionarMaisPedidos, type ProdutoVitrine } from "@/lib/vitrine/mais-pedidos";
import { conectar, lerEnv, limpar } from "../banco/lib.mjs";

// Os 5 produtos do piloto (Cainan, 11/10/2026).
const PILOTO = [
  "Combo 80 doces personalizados",
  "Kit Festa Básico 10 pessoas",
  "Pãozinho de salpicão",
  "Adicional topper do Bento Cake",
  "Brigadeiro (15g)",
];
const GATILHOS_PRODUTOS = ["produtos_set_atualizado_em", "produtos_slug_imutavel", "produtos_slug_no_cadastro"];

type Linha = { produto: string; papel: "capa" | "galeria"; posicao: number | null; caminho: string };
type Foto = { produto: string; papel: "capa" | "galeria"; posicao: number | null; origem: string; buf: Buffer; largura: number; altura: number; bytesOriginal: number; larguraOriginal: number; alturaOriginal: number };
type Registro = {
  etapa: string;
  inicio: string;
  manifestoSha256?: string;
  produtos: { id: string; nome: string; image_url: string; capa: string; galeria: { caminho: string; posicao: number }[] }[];
  arquivosSubidos: string[];
  status: "subindo" | "gravado" | "desfeito-por-erro" | "desfeito";
  erro?: string;
};

function args() {
  const a: Record<string, string | true> = {};
  for (const x of process.argv.slice(2)) {
    if (!x.startsWith("--")) continue;
    const i = x.indexOf("=");
    if (i === -1) a[x.slice(2)] = true;
    else a[x.slice(2, i)] = x.slice(i + 1);
  }
  return a;
}

function lerManifesto(arquivo: string): Linha[] {
  const linhas = fs.readFileSync(arquivo, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  const cab = linhas.shift()!.split(";");
  if (cab.slice(0, 4).join(";") !== "produto;papel;posicao_galeria;caminho_no_zip") throw new Error("Cabeçalho do manifesto inesperado.");
  return linhas.map((l, n) => {
    const [produto, papel, pos, caminho] = l.split(";");
    if (papel !== "capa" && papel !== "galeria") throw new Error(`Linha ${n + 2}: papel inválido.`);
    const posicao = papel === "galeria" ? Number(pos) : null;
    if (papel === "galeria" && !(Number.isInteger(posicao) && posicao! >= 1 && posicao! <= MAX_FOTOS_EXTRAS)) throw new Error(`Linha ${n + 2}: posição inválida.`);
    return { produto, papel, posicao, caminho };
  });
}

// Acha a raiz dos caminhos do manifesto dentro da pasta extraída (o zip do
// Drive põe uma ou duas pastas por fora).
function acharRaiz(pasta: string, exemplo: string): string {
  const fila = [pasta];
  while (fila.length) {
    const d = fila.shift()!;
    if (fs.existsSync(path.join(d, exemplo))) return d;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) if (e.isDirectory()) fila.push(path.join(d, e.name));
  }
  throw new Error("Não achei a raiz das fotos dentro da pasta extraída.");
}

// HEIC: o sharp instalado não lê HEVC; o Windows lê (extensões HEIF/HEVC).
// Converte para PNG sem perda numa pasta temporária.
function heicParaPng(origem: string): Buffer {
  const destino = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "carga-heic-")), "foto.png");
  const ps = [
    "Add-Type -AssemblyName PresentationCore;",
    "$s=[IO.File]::OpenRead($env:CARGA_ORIGEM);",
    "$d=[System.Windows.Media.Imaging.BitmapDecoder]::Create($s,'None','OnLoad');",
    "$e=New-Object System.Windows.Media.Imaging.PngBitmapEncoder;",
    "$e.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($d.Frames[0]));",
    "$o=[IO.File]::Create($env:CARGA_DESTINO); $e.Save($o); $o.Close(); $s.Close()",
  ].join(" ");
  execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], {
    env: { ...process.env, CARGA_ORIGEM: origem, CARGA_DESTINO: destino },
    stdio: ["ignore", "ignore", "pipe"],
  });
  const buf = fs.readFileSync(destino);
  fs.rmSync(path.dirname(destino), { recursive: true, force: true });
  return buf;
}

// Motor sharp com o mesmo contrato do motor do navegador: largura e altura
// já com a orientação da câmera aplicada; codificar sem metadados (o sharp
// só grava metadados se pedido).
const motorSharp: MotorImagem = {
  async decodificar(arquivo) {
    const buf = Buffer.from(await arquivo.arrayBuffer());
    const m = await sharp(buf, { failOn: "error" }).metadata();
    const largura = m.autoOrient?.width ?? m.width ?? 0;
    const altura = m.autoOrient?.height ?? m.height ?? 0;
    return Object.assign({ largura, altura, liberar: () => {} }, { buf }) as ImagemDecodificada;
  },
  async codificar(imagem, largura, altura, tipo, qualidade) {
    const buf = (imagem as ImagemDecodificada & { buf: Buffer }).buf;
    const base = sharp(buf).rotate().resize(largura, altura, { fit: "fill", kernel: "lanczos3" });
    const q = Math.round(qualidade * 100);
    const out = tipo === "image/webp" ? await base.webp({ quality: q }).toBuffer() : await base.jpeg({ quality: q }).toBuffer();
    return new Blob([new Uint8Array(out)], { type: tipo });
  },
};

async function prepararFoto(raiz: string, l: Linha): Promise<Foto> {
  const origem = path.join(raiz, l.caminho);
  if (!fs.existsSync(origem)) throw new Error(`Arquivo não encontrado: ${l.caminho}`);
  const bytesOriginal = fs.statSync(origem).size;
  const bruto = /\.heic$/i.test(origem) ? heicParaPng(origem) : fs.readFileSync(origem);
  const m = await sharp(bruto).metadata();
  const r = await reduzirFoto(new File([new Uint8Array(bruto)], path.basename(origem)), motorSharp);
  if (!r.ok) throw new Error(`${l.caminho}: ${r.erro}`);
  if (r.foto.ext !== "webp") throw new Error(`${l.caminho}: saiu ${r.foto.ext}, esperado webp.`);
  const buf = Buffer.from(await r.foto.blob.arrayBuffer());
  if (tipoPelosBytes(new Uint8Array(buf.subarray(0, 16))) !== "webp") throw new Error(`${l.caminho}: arquivo final não é WebP.`);
  return {
    produto: l.produto, papel: l.papel, posicao: l.posicao, origem: l.caminho, buf,
    largura: r.foto.largura, altura: r.foto.altura, bytesOriginal,
    larguraOriginal: m.autoOrient?.width ?? m.width ?? 0, alturaOriginal: m.autoOrient?.height ?? m.height ?? 0,
  };
}

// O pacote pg não traz tipos neste projeto: só o que o script usa.
type Db = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
  end(): Promise<void>;
};
type Linha_Produto = { id: string; nome: string; image_url: string | null; atualizado_em_texto: string };
type Linha_Foto = { produto_id: string };
const COLUNAS_VITRINE = `id, nome, slug, preco, image_url, "Categoria", tipo, unidade_venda, pedido_minimo, step_quantidade, ativo, destaque, atualizado_em::text as atualizado_em`;

async function lerEstado(db: Db) {
  const produtos = (await db.query<Linha_Produto>(`select * , atualizado_em::text as atualizado_em_texto from public.produtos order by id`)).rows;
  const fotos = (await db.query<Linha_Foto>(`select * from public.produto_fotos order by produto_id, posicao`)).rows;
  const vitrine = (await db.query(`select ${COLUNAS_VITRINE} from public.produtos`)).rows as ProdutoVitrine[];
  const gatilhos = (await db.query(
    `select t.tgname, t.tgenabled from pg_trigger t where t.tgrelid = 'public.produtos'::regclass and not t.tgisinternal order by 1`
  )).rows as { tgname: string; tgenabled: string }[];
  return { produtos, fotos, maisPedidos: selecionarMaisPedidos(vitrine).map((p) => p.nome), gatilhos };
}

function conferirGatilhos(gatilhos: { tgname: string; tgenabled: string }[]) {
  for (const nome of GATILHOS_PRODUTOS) {
    const g = gatilhos.find((x) => x.tgname === nome);
    if (!g || g.tgenabled !== "O") throw new Error(`Gatilho ${nome} não está ligado (${g?.tgenabled ?? "ausente"}).`);
  }
}

function provas(antes: Awaited<ReturnType<typeof lerEstado>>, depois: Awaited<ReturnType<typeof lerEstado>>) {
  console.log("\n== Provas");
  for (const g of depois.gatilhos) console.log(`gatilho ${g.tgname}: ${g.tgenabled === "O" ? "ligado" : `NÃO LIGADO (${g.tgenabled})`}`);
  const mapa = new Map(antes.produtos.map((p) => [p.id, p.atualizado_em_texto]));
  const diferentes = depois.produtos.filter((p) => mapa.get(p.id) !== p.atualizado_em_texto);
  console.log(`atualizado_em: ${depois.produtos.length} produtos, ${diferentes.length} diferenças contra o backup${diferentes.length ? ": " + diferentes.map((p) => p.nome).join(", ") : ""}`);
  const igual = JSON.stringify(antes.maisPedidos) === JSON.stringify(depois.maisPedidos);
  console.log(`Os mais pedidos: ${igual ? "igual" : "DIFERENTE"}`);
  console.log(`  antes:  ${antes.maisPedidos.join(" | ")}`);
  console.log(`  depois: ${depois.maisPedidos.join(" | ")}`);
  return depois.gatilhos.every((g) => g.tgenabled === "O") && diferentes.length === 0 && igual;
}

function salvarJson(arquivo: string, dados: unknown) {
  fs.writeFileSync(arquivo, JSON.stringify(dados, null, 1));
}

async function main() {
  const a = args();
  const executar = a.executar === true;
  const env = lerEnv() as Record<string, string | undefined>;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Falta SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env.local.");
  const backup = String(a.backup ?? "");
  if (!backup) throw new Error("Informe --backup=<pasta fora do repositório>.");
  if (path.resolve(backup).startsWith(path.resolve(process.cwd()))) throw new Error("A pasta de backup precisa ficar fora do repositório.");
  fs.mkdirSync(backup, { recursive: true });
  const storage = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }).storage.from(BUCKET_FOTOS);
  const carimbo = new Date().toISOString().replace(/[:.]/g, "-");

  const db = (await conectar({ nome: "carga-fotos-produtos" })) as Db;
  try {
    if (a.desfazer) {
      await desfazer(db, storage, String(a.desfazer), backup, carimbo, executar);
      return;
    }

    const manifesto = String(a.manifesto ?? "");
    const pasta = String(a.fotos ?? "");
    const etapa = String(a.etapa ?? "");
    if (!manifesto || !pasta || !["piloto", "restante"].includes(etapa)) throw new Error("Informe --manifesto, --fotos e --etapa=piloto|restante.");
    const linhas = lerManifesto(manifesto);
    const capas = linhas.filter((l) => l.papel === "capa").length;
    console.log(`Manifesto: ${linhas.length} linhas, ${capas} capas, ${linhas.length - capas} fotos extras, ${new Set(linhas.map((l) => l.produto)).size} produtos.`);
    const raiz = acharRaiz(pasta, linhas[0].caminho);

    const doEtapa = linhas.filter((l) => (etapa === "piloto" ? PILOTO.includes(l.produto) : !PILOTO.includes(l.produto)));
    const nomes = [...new Set(doEtapa.map((l) => l.produto))];
    if (etapa === "piloto" && nomes.length !== PILOTO.length) throw new Error("Algum produto do piloto não está no manifesto.");

    // Cada produto: exatamente uma capa, posições sem repetir.
    for (const nome of nomes) {
      const ls = doEtapa.filter((l) => l.produto === nome);
      if (ls.filter((l) => l.papel === "capa").length !== 1) throw new Error(`${nome}: precisa de exatamente uma capa no manifesto.`);
      const pos = ls.filter((l) => l.papel === "galeria").map((l) => l.posicao);
      if (new Set(pos).size !== pos.length || pos.length > MAX_FOTOS_EXTRAS) throw new Error(`${nome}: posições de foto extra repetidas ou mais de ${MAX_FOTOS_EXTRAS}.`);
    }

    const antes = await lerEstado(db);
    conferirGatilhos(antes.gatilhos);
    const arquivoBackup = path.join(backup, `backup-${etapa}-${carimbo}.json`);
    salvarJson(arquivoBackup, { tirado_em: new Date().toISOString(), produtos: antes.produtos, produto_fotos: antes.fotos, mais_pedidos: antes.maisPedidos });
    console.log(`Backup: ${antes.produtos.length} produtos e ${antes.fotos.length} fotos extras em ${arquivoBackup}`);

    const porNome = new Map(antes.produtos.map((p) => [p.nome, p]));
    const comFoto = new Set(antes.fotos.map((f) => f.produto_id));
    const alvo: { id: string; nome: string; linhas: Linha[] }[] = [];
    const pulados: string[] = [];
    for (const nome of nomes) {
      const p = porNome.get(nome);
      if (!p) { pulados.push(`${nome}: não existe no banco`); continue; }
      if (p.image_url || comFoto.has(p.id)) { pulados.push(`${nome}: já tem capa ou foto extra`); continue; }
      alvo.push({ id: p.id, nome, linhas: doEtapa.filter((l) => l.produto === nome) });
    }

    // Reduz tudo antes de subir qualquer coisa: uma foto ruim para a etapa
    // inteira sem deixar sobra.
    const fotos = new Map<string, Foto[]>();
    for (const p of alvo) {
      const lista: Foto[] = [];
      for (const l of p.linhas) lista.push(await prepararFoto(raiz, l));
      fotos.set(p.id, lista);
    }
    const todas = [...fotos.values()].flat();
    console.log(`\nEtapa ${etapa}: ${alvo.length} produtos a preencher, ${todas.filter((f) => f.papel === "capa").length} capas e ${todas.filter((f) => f.papel === "galeria").length} fotos extras (${todas.length} arquivos).`);
    for (const f of todas) {
      console.log(`  ${f.produto} | ${f.papel}${f.posicao ? " " + f.posicao : ""} | ${f.origem} | ${(f.bytesOriginal / 1024).toFixed(0)} KB ${f.larguraOriginal}x${f.alturaOriginal} -> ${(f.buf.length / 1024).toFixed(0)} KB ${f.largura}x${f.altura}`);
    }
    console.log(`Pulados: ${pulados.length}${pulados.length ? "\n  " + pulados.join("\n  ") : ""}`);
    const pequenas = todas.filter((f) => Math.max(f.largura, f.altura) < 640);
    console.log(`Fotos com lado maior abaixo de 640px nesta etapa: ${pequenas.length}`);

    if (!executar) {
      console.log("\nSimulação: nada foi enviado nem gravado. Para gravar, repita com --executar.");
      return;
    }

    const registro: Registro = {
      etapa, inicio: new Date().toISOString(),
      manifestoSha256: (await import("node:crypto")).createHash("sha256").update(fs.readFileSync(manifesto)).digest("hex"),
      produtos: [], arquivosSubidos: [], status: "subindo",
    };
    const arquivoRegistro = path.join(backup, `registro-${etapa}-${carimbo}.json`);
    salvarJson(arquivoRegistro, registro);

    try {
      for (const p of alvo) {
        const item = { id: p.id, nome: p.nome, image_url: "", capa: "", galeria: [] as { caminho: string; posicao: number }[] };
        for (const f of fotos.get(p.id)!) {
          const caminho = f.papel === "capa" ? montarCaminhoCapa(p.id, randomUUID(), "webp") : montarCaminho(p.id, randomUUID(), "webp");
          const { error } = await storage.upload(caminho, f.buf, { contentType: "image/webp", upsert: false });
          if (error) throw new Error(`Envio de ${caminho}: ${error.message}`);
          registro.arquivosSubidos.push(caminho);
          salvarJson(arquivoRegistro, registro);
          if (f.papel === "capa") {
            item.capa = caminho;
            item.image_url = storage.getPublicUrl(caminho).data.publicUrl;
          } else item.galeria.push({ caminho, posicao: f.posicao! });
        }
        registro.produtos.push(item);
        process.stdout.write(`  enviado: ${p.nome} (${1 + item.galeria.length})\n`);
      }

      await db.query("begin");
      await db.query("set local lock_timeout = '2s'");
      await db.query("set local statement_timeout = '60s'");
      await db.query("alter table public.produtos disable trigger produtos_set_atualizado_em");
      for (const item of registro.produtos) {
        const r = await db.query(
          `update public.produtos set image_url = $1
            where id = $2 and image_url is null
              and not exists (select 1 from public.produto_fotos f where f.produto_id = $2)`,
          [item.image_url, item.id]
        );
        if (r.rowCount !== 1) throw new Error(`${item.nome}: não estava mais vazio na hora de gravar.`);
        for (const g of item.galeria) {
          await db.query(`insert into public.produto_fotos (produto_id, caminho, posicao) values ($1, $2, $3)`, [item.id, g.caminho, g.posicao]);
        }
      }
      await db.query("alter table public.produtos enable trigger produtos_set_atualizado_em");
      conferirGatilhos((await db.query<{ tgname: string; tgenabled: string }>(`select tgname, tgenabled from pg_trigger where tgrelid = 'public.produtos'::regclass and not tgisinternal`)).rows);
      await db.query("commit");
      registro.status = "gravado";
      salvarJson(arquivoRegistro, registro);
    } catch (erro) {
      await db.query("rollback").catch(() => {});
      registro.erro = limpar((erro as Error).message);
      if (registro.arquivosSubidos.length) {
        const { error } = await storage.remove(registro.arquivosSubidos);
        console.error(error ? `Falha ao apagar os arquivos desta execução: ${error.message}` : `Arquivos desta execução apagados: ${registro.arquivosSubidos.length}`);
      }
      registro.status = "desfeito-por-erro";
      salvarJson(arquivoRegistro, registro);
      throw erro;
    }

    console.log(`\nGravado: ${registro.produtos.length} produtos, ${registro.arquivosSubidos.length} arquivos (${registro.produtos.length} capas e ${registro.arquivosSubidos.length - registro.produtos.length} fotos extras).`);
    console.log(`Registro: ${arquivoRegistro}`);
    const depois = await lerEstado(db);
    if (!provas(antes, depois)) process.exitCode = 1;
  } finally {
    await db.end();
  }
}

async function desfazer(db: Db, storage: Storage, arquivo: string, backup: string, carimbo: string, executar: boolean) {
  const registro: Registro = JSON.parse(fs.readFileSync(arquivo, "utf8"));
  const antes = await lerEstado(db);
  conferirGatilhos(antes.gatilhos);
  salvarJson(path.join(backup, `backup-desfazer-${carimbo}.json`), { tirado_em: new Date().toISOString(), produtos: antes.produtos, produto_fotos: antes.fotos, mais_pedidos: antes.maisPedidos });
  const atual = new Map(antes.produtos.map((p) => [p.id, p]));
  const mantidos = registro.produtos.filter((p) => atual.get(p.id)?.image_url !== p.image_url);
  console.log(`Desfazer ${arquivo}: ${registro.produtos.length} produtos, ${registro.arquivosSubidos.length} arquivos. Capa mudada depois da carga (fica como está): ${mantidos.map((p) => p.nome).join(", ") || "nenhum"}.`);
  if (!executar) { console.log("Simulação: nada foi mudado. Repita com --executar."); return; }
  const caminhosGaleria = registro.produtos.flatMap((p) => p.galeria.map((g) => g.caminho));
  await db.query("begin");
  try {
    await db.query("set local lock_timeout = '2s'");
    await db.query("set local statement_timeout = '60s'");
    await db.query("alter table public.produtos disable trigger produtos_set_atualizado_em");
    let capas = 0;
    for (const p of registro.produtos) {
      const r = await db.query(`update public.produtos set image_url = null where id = $1 and image_url = $2`, [p.id, p.image_url]);
      capas += r.rowCount ?? 0;
    }
    const f = await db.query(`delete from public.produto_fotos where caminho = any($1::text[])`, [caminhosGaleria]);
    await db.query("alter table public.produtos enable trigger produtos_set_atualizado_em");
    conferirGatilhos((await db.query<{ tgname: string; tgenabled: string }>(`select tgname, tgenabled from pg_trigger where tgrelid = 'public.produtos'::regclass and not tgisinternal`)).rows);
    await db.query("commit");
    console.log(`Banco: ${capas} capas limpas, ${f.rowCount} fotos extras apagadas.`);
  } catch (erro) {
    await db.query("rollback").catch(() => {});
    throw erro;
  }
  // Só apaga arquivo que nenhuma linha usa mais.
  const usados = new Set<string>([
    ...(await db.query<{ caminho: string }>(`select caminho from public.produto_fotos`)).rows.map((r) => r.caminho),
    ...(await db.query<{ image_url: string }>(`select image_url from public.produtos where image_url is not null`)).rows.map((r) => r.image_url),
  ]);
  const apagar = registro.arquivosSubidos.filter((c) => !usados.has(c) && !usados.has(storage.getPublicUrl(c).data.publicUrl));
  if (apagar.length) {
    const { error } = await storage.remove(apagar);
    if (error) throw new Error(`Falha ao apagar arquivos: ${error.message}`);
  }
  console.log(`Storage: ${apagar.length} arquivos apagados.`);
  registro.status = "desfeito";
  salvarJson(arquivo, registro);
  provas(antes, await lerEstado(db));
}

main().catch((erro) => {
  console.error("ERRO:", limpar((erro as Error).message));
  process.exit(1);
});
