// Regra de "ignorar build" da Netlify (netlify.toml, [build] ignore).
//
// A Netlify roda este comando antes de cada build (produção, Deploy Preview e
// branch deploy). Saída 0 = pula o build; qualquer outra = segue o build.
// Pula só quando TODOS os arquivos mudados desde o último build desta branch
// estão fora do site (lista abaixo). Na dúvida (sem commit de comparação,
// erro do git), builda: o erro nunca pode ser "deixar de publicar".
//
// Motivo: créditos da Netlify (plano Free, 300/mês); cada deploy de produção
// publicado custa 15. Ver "Créditos da Netlify" em docs/status-pingo-de-mell.md.

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// Caminhos que não entram no site publicado.
export function foraDoSite(arquivo) {
  return (
    arquivo.startsWith("docs/") ||
    arquivo.startsWith("scripts/") ||
    arquivo.startsWith(".github/") ||
    (arquivo.startsWith("supabase/") && arquivo.endsWith(".sql")) ||
    arquivo.endsWith(".md") ||
    arquivo === "heartbeat-log.txt" ||
    arquivo === ".gitignore"
  );
}

// true = pular o build.
export function podePular(arquivos) {
  return arquivos.length > 0 && arquivos.every(foraDoSite);
}

export function arquivosMudados(base, atual, cwd = process.cwd()) {
  // --no-renames: mover src/x para docs/x aparece como "apagou src/x" e
  // "criou docs/x", e o apagado em src/ obriga o build.
  const saida = execFileSync(
    "git",
    ["-c", "core.quotepath=off", "diff", "--name-only", "--no-renames", base, atual],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  return saida.split("\n").filter(Boolean);
}

// Devolve o código de saída para a Netlify.
export function decidir(env = process.env, listar = arquivosMudados) {
  const base = env.CACHED_COMMIT_REF;
  const atual = env.COMMIT_REF;
  // Primeiro build da branch, "Clear cache and deploy" ou "Trigger deploy"
  // do mesmo commit: não há o que comparar, então builda.
  if (!base || !atual || base === atual) {
    console.log(`ignorar-build: sem commit anterior para comparar (${base} → ${atual}); builda.`);
    return 1;
  }
  let arquivos;
  try {
    arquivos = listar(base, atual);
  } catch (erro) {
    console.log(`ignorar-build: git diff falhou (${erro.message}); builda.`);
    return 1;
  }
  if (podePular(arquivos)) {
    console.log(`ignorar-build: só arquivos fora do site mudaram (${arquivos.join(", ")}); pula o build.`);
    return 0;
  }
  const noSite = arquivos.filter((arquivo) => !foraDoSite(arquivo));
  console.log(`ignorar-build: mudou o que entra no site (${noSite.join(", ") || "nenhum arquivo"}); builda.`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(decidir());
}
