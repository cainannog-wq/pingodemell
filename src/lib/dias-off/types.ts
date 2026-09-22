// Dia sem produção específico (qualquer dia da semana, EXCETO segunda —
// segunda é fechada por padrão e usa o mecanismo separado de
// SegundaReabertura, ver abaixo). `observacao` é uso interno do admin, sem
// exposição no catálogo público.
export type DiaOff = {
  id: string;
  data: string;
  criado_em: string | null;
  observacao: string | null;
};

// Exceção pontual: reabre a produção numa segunda-feira específica (segunda
// é fechada por padrão, sem precisar de entrada em `dias_off`).
export type SegundaReabertura = {
  id: string;
  data: string;
  criado_em: string | null;
  observacao: string | null;
};
