import "server-only";

// Relatório de visitas (Looker Studio, que o Google também chama de Data
// Studio) embutido na primeira tela do admin. A URL é lida só aqui, só no
// servidor, em tempo de execução, da variável LOOKER_REPORT_URL da Netlify
// (sem prefixo NEXT_PUBLIC_ e fora do bloco env do next.config.ts, que
// copiaria o valor para o JavaScript do navegador). Ela se comporta como
// segredo: nunca vai para log, teste, arquivo ou resposta de quem não tem
// sessão (página: src/app/admin/page.tsx).

export const NOME_VARIAVEL_RELATORIO = "LOOKER_REPORT_URL";

// O endereço de incorporação de hoje começa por datastudio.google.com; o
// nome novo do produto é lookerstudio.google.com. Os dois valem.
export const HOSTS_RELATORIO = ["datastudio.google.com", "lookerstudio.google.com"] as const;
export const CAMINHO_RELATORIO = "/embed/reporting/";

// Conjunto padrão do código de incorporação do Google, nada além dele.
export const SANDBOX_RELATORIO =
  "allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox";

export type MotivoRelatorioIndisponivel = "ausente" | "invalida";

// Devolve o endereço normalizado ou o motivo da recusa. Nunca devolve o
// valor recebido no motivo.
export function validarUrlRelatorio(
  valor: string | undefined,
): { url: string } | { motivo: MotivoRelatorioIndisponivel } {
  const texto = (valor ?? "").trim();
  if (!texto) return { motivo: "ausente" };
  let u: URL;
  try {
    u = new URL(texto);
  } catch {
    return { motivo: "invalida" };
  }
  const hostOk = (HOSTS_RELATORIO as readonly string[]).includes(u.hostname);
  const sobraAutoridade = u.username !== "" || u.password !== "" || u.port !== "";
  if (u.protocol !== "https:" || !hostOk || sobraAutoridade || !u.pathname.startsWith(CAMINHO_RELATORIO)) {
    return { motivo: "invalida" };
  }
  return { url: u.toString() };
}

// Lê a variável do ambiente em tempo de execução. Sem URL válida registra só
// o motivo (nunca o valor) e devolve null: a tela mostra o quadro vazio.
export function lerUrlRelatorio(env: Record<string, string | undefined> = process.env): string | null {
  const r = validarUrlRelatorio(env[NOME_VARIAVEL_RELATORIO]);
  if ("url" in r) return r.url;
  console.warn(
    `[admin] ${NOME_VARIAVEL_RELATORIO} ${r.motivo === "ausente" ? "ausente ou vazia" : "com formato inválido"}: relatório indisponível`,
  );
  return null;
}
