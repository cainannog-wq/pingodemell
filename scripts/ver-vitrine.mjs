// Abre a Home e a Lista de um endereço do site (produção ou homologação),
// como um visitante qualquer, e mostra:
//   - "Os mais pedidos" da Home, na ordem da tela, com o link de cada card;
//   - os cards da Lista (/produtos), na ordem da tela, com o link de cada um.
// Só leitura (GET das páginas), nada é gravado.
//
// Uso: node scripts/ver-vitrine.mjs [https://pingodemell.netlify.app]

const base = (process.argv[2] ?? "https://pingodemell.netlify.app").replace(/\/+$/, "");

function texto(html) {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

// Cada card: o título (h3 id="produto-{id}") e o primeiro link do card
// (<article> ... <a href>). Lê na ordem em que aparecem no HTML.
function cards(html) {
  const saida = [];
  for (const artigo of html.split("<article").slice(1)) {
    const corpo = artigo.split("</article>")[0];
    const titulo = corpo.match(/id="produto-[0-9a-f-]{36}"[^>]*>([\s\S]*?)<\/h3>/);
    const link = corpo.match(/<a[^>]*href="([^"]+)"/);
    if (titulo) saida.push({ nome: texto(titulo[1]), href: link?.[1] ?? "(sem link)" });
  }
  return saida;
}

async function pagina(caminho) {
  const res = await fetch(`${base}${caminho}`, { headers: { "cache-control": "no-cache" } });
  if (!res.ok) throw new Error(`${caminho}: HTTP ${res.status}`);
  return res.text();
}

console.log(`${new Date().toISOString()} — ${base}\n`);

const home = await pagina("/");
const inicio = home.indexOf('id="home-mais-titulo"');
const secao = inicio === -1 ? "" : home.slice(inicio, home.indexOf("</section>", inicio));
const maisPedidos = cards(secao);
console.log(`Home, "Os mais pedidos" (${maisPedidos.length}):`);
maisPedidos.forEach((c, i) => console.log(`  ${i + 1}. ${c.nome.padEnd(34)} ${c.href}`));

const lista = cards(await pagina("/produtos"));
console.log(`\nLista /produtos (${lista.length}):`);
lista.forEach((c, i) => console.log(`  ${i + 1}. ${c.nome.padEnd(34)} ${c.href}`));
