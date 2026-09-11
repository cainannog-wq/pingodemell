import type { PedidoStatus } from "./types";

export const STATUS_LABEL: Record<PedidoStatus, string> = {
  aguardando_confirmacao: "Aguardando confirmação",
  em_producao: "Em produção",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

// Variants já existentes em components/ds/Badge.tsx — nenhuma cor nova
// precisou ser criada no design system.
export const STATUS_BADGE_VARIANT: Record<PedidoStatus, "gold" | "brown" | "success" | "error"> = {
  aguardando_confirmacao: "gold",
  em_producao: "brown",
  entregue: "success",
  cancelado: "error",
};

export const STATUS_OPTIONS: PedidoStatus[] = [
  "aguardando_confirmacao",
  "em_producao",
  "entregue",
  "cancelado",
];
