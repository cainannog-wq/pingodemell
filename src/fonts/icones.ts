import localFont from "next/font/local";

// Fonte de ícones hospedada pelo próprio site: subconjunto da Material
// Symbols Rounded (eixos opsz 24, wght 400, FILL 1, GRAD 0) só com os nomes
// de src/lib/icones.ts. O next/font/local copia o arquivo para
// /_next/static/media com hash no nome (cache longo, sem depender do
// headers() do next.config.ts) e põe o <link rel="preload"> nas páginas do
// layout que o importa (o raiz: todas). Origem, data e sha256 em
// material-symbols-rounded/manifesto.json; regerar com
// `node scripts/fonte-icones/gerar.mjs`.
//
// display "block": com "swap" o nome do ícone (ex.: "shopping_bag")
// apareceria escrito por um instante no lugar do desenho. Sem fonte
// substituta ajustada (adjustFontFallback false): para ícone ela não serve.
export const fonteIcones = localFont({
  src: "./material-symbols-rounded/material-symbols-rounded.woff2",
  variable: "--font-icones",
  weight: "400",
  style: "normal",
  display: "block",
  preload: true,
  adjustFontFallback: false,
});
