import { Icon } from "@/components/ds";

// Motivo decorativo do layout: ícone "hive" gigante, dourado, com opacidade
// baixa. Posição, tamanho e opacidade vêm do CSS de cada seção.
export function Hive() {
  return <Icon name="hive" size={240} color="var(--gold-500)" className="site-hive" />;
}
