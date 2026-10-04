// Lista única dos ícones do site (público e admin), em ordem alfabética.
//
// A fonte de ícones (Material Symbols Rounded, eixos opsz 24, wght 400,
// FILL 1, GRAD 0) é um subconjunto com só estes nomes, hospedado pelo
// próprio site (src/fonts/material-symbols-rounded/). Nome fora desta lista
// não compila (`IconeNome`) e, se aparecesse, sairia escrito por extenso no
// lugar do desenho.
//
// Ícone novo: acrescentar aqui, em ordem alfabética, e regerar a fonte com
// `node scripts/fonte-icones/gerar.mjs` (o teste src/lib/icones.test.ts
// falha enquanto a fonte não tiver o nome novo).
//
// Arquivo sem import e sem sintaxe além de tipos: o gerador o lê direto com
// o Node.
export const ICONES = [
  "add",
  "add_circle",
  "add_photo_alternate",
  "add_shopping_cart",
  "arrow_back",
  "arrow_downward",
  "arrow_forward",
  "arrow_upward",
  "bakery_dining",
  "bookmark",
  "cake",
  "call",
  "celebration",
  "chat",
  "check",
  "check_circle",
  "chevron_left",
  "chevron_right",
  "close",
  "content_copy",
  "delete",
  "download",
  "edit",
  "edit_note",
  "error",
  "event",
  "event_available",
  "event_busy",
  "expand_more",
  "favorite",
  "hive",
  "home",
  "hourglass_top",
  "info",
  "inventory_2",
  "local_shipping",
  "location_on",
  "lock",
  "logout",
  "mail",
  "menu",
  "more_vert",
  "open_in_new",
  "payments",
  "person",
  "photo_camera",
  "pie_chart",
  "receipt_long",
  "refresh",
  "remove",
  "restaurant",
  "schedule",
  "search",
  "search_off",
  "shopping_bag",
  "star",
  "storefront",
  "toggle_off",
  "toggle_on",
  "upload",
  "visibility",
  "warning",
  "wifi_off",
] as const;

export type IconeNome = (typeof ICONES)[number];
