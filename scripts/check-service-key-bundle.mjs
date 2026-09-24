// Confere que a chave de serviço do Supabase (SUPABASE_SERVICE_ROLE_KEY)
// não aparece em nenhum arquivo que o navegador baixa: tudo em
// .next/static (JS, CSS e mídia dos Client Components). Rodar depois de
// `npm run build`.
//
// Nunca imprime a chave: lê o valor de .env.local (ou do ambiente) e só
// mostra quantos arquivos foram varridos e em quantos ela aparece.
//
// Uso: node scripts/check-service-key-bundle.mjs

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function lerChave() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  const linha = readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("SUPABASE_SERVICE_ROLE_KEY="));
  return linha?.slice("SUPABASE_SERVICE_ROLE_KEY=".length).trim().replace(/^["']|["']$/g, "");
}

function arquivos(dir) {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    return statSync(caminho).isDirectory() ? arquivos(caminho) : [caminho];
  });
}

const chave = lerChave();
if (!chave || chave.length < 20) {
  console.error("SUPABASE_SERVICE_ROLE_KEY não encontrada em .env.local nem no ambiente.");
  process.exit(2);
}

const lista = arquivos(join(".next", "static"));
const comChave = lista.filter((arquivo) => readFileSync(arquivo).includes(chave));
// Também procura o nome da variável, caso algum código de servidor tenha
// vazado para o bundle do navegador mesmo sem o valor.
const comNome = lista.filter((arquivo) => readFileSync(arquivo).includes("SUPABASE_SERVICE_ROLE_KEY"));

console.log(`Arquivos varridos em .next/static: ${lista.length}`);
console.log(`Arquivos com o VALOR da chave de serviço: ${comChave.length}`);
console.log(`Arquivos com o NOME SUPABASE_SERVICE_ROLE_KEY: ${comNome.length}`);
if (comChave.length > 0 || comNome.length > 0) {
  for (const arquivo of [...new Set([...comChave, ...comNome])]) console.log(`  - ${arquivo}`);
  process.exit(1);
}
console.log("OK: a chave de serviço não vai para o navegador.");
