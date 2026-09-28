// Conferência SÓ DE LEITURA do bucket "Pingo de Mell": lista todo arquivo
// sem linha no banco (raiz, capa/ e galeria/) e toda linha do banco que
// aponta para um arquivo que não existe. Não apaga nada.
//
// Por que existe: dois casos de sobra não têm limpeza automática — a capa
// antiga da raiz que falhou ao ser apagada depois de uma troca, e os
// arquivos de um produto excluído quando a exclusão do arquivo falha
// depois de o produto já ter saído do banco (não existe "próximo Salvar"
// para ele). Os dois só vão para o log do servidor; este script acha as
// sobras sem depender de alguém ler log.
//
// Quando rodar: no fim das provas de um PR que mexe em fotos, antes da
// limpeza dos produtos fictícios e antes da carga real (docs/status).
//
// Como: conexão direta no Postgres (SUPABASE_DB_URL, como os testes de
// scripts/banco/), numa transação READ ONLY desfeita no fim. Lê
// storage.objects, produtos.image_url e produto_fotos.caminho.
//
// Uso: node scripts/arquivos-sem-dono.mjs
// Sai com código 1 se houver arquivo sem dono ou linha sem arquivo.

import { conectar, lerEnv, limpar } from "./banco/lib.mjs";

const BUCKET = "Pingo de Mell";
const env = lerEnv();
const PREFIXO = `${String(env.SUPABASE_URL ?? "").replace(/\/+$/, "")}/storage/v1/object/public/${encodeURIComponent(BUCKET)}/`;

// Mesma leitura de src/lib/galeria/capa.ts (caminhoNoBucket).
function caminhoNoBucket(url) {
  if (typeof url !== "string" || !url.startsWith(PREFIXO)) return null;
  const resto = url.slice(PREFIXO.length);
  if (resto === "" || /[?#]/.test(resto)) return null;
  try {
    return decodeURIComponent(resto);
  } catch {
    return null;
  }
}

function area(caminho) {
  if (caminho.startsWith("capa/")) return "capa/";
  if (caminho.startsWith("galeria/")) return "galeria/";
  return caminho.includes("/") ? "outra pasta" : "raiz";
}

const kb = (bytes) => (bytes == null ? "?" : `${Math.round(Number(bytes) / 1024)} KB`);

if (!env.SUPABASE_URL) {
  console.error("Falta SUPABASE_URL no .env.local.");
  process.exit(1);
}

const db = await conectar();
let problemas = 0;
try {
  await db.query("begin read only");
  const { rows: objetos } = await db.query(
    "select name, (metadata->>'size')::bigint as bytes, created_at from storage.objects where bucket_id = $1 order by name",
    [BUCKET]
  );
  const { rows: produtos } = await db.query("select id, nome, ativo, image_url from public.produtos order by nome");
  const { rows: fotos } = await db.query(
    "select f.caminho, p.nome from public.produto_fotos f join public.produtos p on p.id = f.produto_id order by f.caminho"
  );

  // Quem aponta para cada caminho.
  const donos = new Map();
  const capaForaDoBucket = [];
  for (const p of produtos) {
    if (!p.image_url) continue;
    const caminho = caminhoNoBucket(p.image_url);
    if (!caminho) {
      capaForaDoBucket.push(p);
      continue;
    }
    donos.set(caminho, [...(donos.get(caminho) ?? []), `capa de "${p.nome}"`]);
  }
  for (const f of fotos) donos.set(f.caminho, [...(donos.get(f.caminho) ?? []), `foto extra de "${f.nome}"`]);

  const existentes = new Set(objetos.map((o) => o.name));
  const marcadores = objetos.filter((o) => o.name.endsWith(".emptyFolderPlaceholder"));
  const semDono = objetos.filter((o) => !donos.has(o.name) && !o.name.endsWith(".emptyFolderPlaceholder"));
  const semArquivo = [...donos.entries()].filter(([caminho]) => !existentes.has(caminho));
  const compartilhados = [...donos.entries()].filter(([, quem]) => quem.length > 1);

  const porArea = {};
  for (const o of objetos) porArea[area(o.name)] = (porArea[area(o.name)] ?? 0) + 1;

  console.log(`Bucket "${BUCKET}" (só leitura; transação desfeita no fim)`);
  console.log("=".repeat(70));
  console.log(`Arquivos no bucket: ${objetos.length} (${Object.entries(porArea).map(([a, n]) => `${a} ${n}`).join(", ") || "nenhum"})`);
  console.log(`Produtos: ${produtos.length}, com capa: ${produtos.filter((p) => p.image_url).length}. Fotos extras: ${fotos.length}.`);

  console.log(`\nArquivos sem linha no banco: ${semDono.length}`);
  for (const o of semDono) console.log(`  - [${area(o.name)}] ${o.name} (${kb(o.bytes)}, enviado em ${o.created_at.toISOString()})`);

  console.log(`\nLinhas do banco apontando para arquivo que não existe: ${semArquivo.length}`);
  for (const [caminho, quem] of semArquivo) console.log(`  - ${caminho} (${quem.join("; ")})`);

  console.log(`\nCapas com endereço fora deste bucket: ${capaForaDoBucket.length}`);
  for (const p of capaForaDoBucket) console.log(`  - "${p.nome}": ${p.image_url}`);

  console.log(`\nArquivos usados por mais de uma linha: ${compartilhados.length}`);
  for (const [caminho, quem] of compartilhados) console.log(`  - ${caminho} (${quem.join("; ")})`);

  // Uma capa por produto que tem capa: cada produto com capa tem exatamente
  // um arquivo de capa, e capa/{id}/ não guarda nada além dele.
  const pastasDeCapa = new Map();
  for (const o of objetos) {
    const m = /^capa\/([^/]+)\//.exec(o.name);
    if (m) pastasDeCapa.set(m[1], (pastasDeCapa.get(m[1]) ?? 0) + 1);
  }
  const pastaComMaisDeUma = [...pastasDeCapa.entries()].filter(([, n]) => n > 1);
  console.log(`\nPastas capa/{id}/ com mais de um arquivo: ${pastaComMaisDeUma.length}`);
  for (const [id, n] of pastaComMaisDeUma) console.log(`  - capa/${id}/: ${n} arquivos`);

  if (marcadores.length) console.log(`\n(Marcadores de pasta vazios do painel, ignorados: ${marcadores.length})`);

  problemas = semDono.length + semArquivo.length + capaForaDoBucket.length + pastaComMaisDeUma.length;
} catch (erro) {
  console.error("Falha na leitura:", limpar(erro.message));
  problemas = -1;
} finally {
  await db.query("rollback").catch(() => {});
  await db.end();
}

console.log("\n" + "=".repeat(70));
if (problemas === 0) console.log("Resultado: nenhum arquivo sem dono e nenhuma linha sem arquivo.");
else if (problemas > 0) console.log(`Resultado: ${problemas} item(ns) para olhar (lista acima). Nada foi apagado.`);
process.exitCode = problemas === 0 ? 0 : 1;
