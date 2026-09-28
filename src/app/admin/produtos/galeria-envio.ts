import type { FotoReduzida } from "@/lib/galeria/reduzir";
import type { ExtensaoFoto, ItemGaleria } from "@/lib/galeria/regras";
import { MENSAGEM_CAPA_ENVIO, type CapaNova } from "@/lib/galeria/capa";

// Estado de uma foto extra na tela do formulário. Nada disso existe no
// banco nem no storage até o Salvar: "nova" é só um arquivo já reduzido,
// guardado na memória do navegador.
export type FotoNaTela =
  | { chave: string; tipo: "existente"; id: string; url: string }
  | { chave: string; tipo: "nova"; foto: FotoReduzida; previewUrl: string };

type Envio = { novo: string; ext: ExtensaoFoto; caminho: string; token: string };

export type DependenciasEnvio = {
  preparar: (
    produtoId: string,
    extensoes: ExtensaoFoto[],
    extensaoCapa?: ExtensaoFoto
  ) => Promise<{ envios?: Envio[]; capa?: Envio; error?: string }>;
  subir: (caminho: string, token: string, foto: FotoReduzida) => Promise<{ error?: string }>;
  descartar: (produtoId: string) => Promise<void>;
};

// Quanto levou cada etapa do envio (para o registro de tempo da
// homologação, ver src/lib/admin/tempos.ts).
export type TemposEnvio = { prepararMs: number; enviarMs: number };

export type ResultadoEnvio =
  | { ok: true; itens: ItemGaleria[]; capa: CapaNova | null; tempos: TemposEnvio }
  | { ok: false; erro: string };

// Primeira etapa do Salvar: sobe a capa nova (se houver) e as fotos extras
// novas direto para o storage, cada uma no caminho que o servidor
// escolheu, pedindo todas as autorizações numa ida só. Devolve a lista
// final da galeria (na ordem da tela) e a capa nova para ir junto com o
// formulário. Se qualquer envio falhar, pede ao servidor para apagar o que
// já subiu e devolve o erro — nada fica gravado.
export async function enviarFotosNovas(
  produtoId: string,
  fotos: FotoNaTela[],
  deps: DependenciasEnvio,
  capa: FotoReduzida | null = null
): Promise<ResultadoEnvio> {
  const novas = fotos.filter((foto) => foto.tipo === "nova");
  const inicio = performance.now();
  let fimPreparo = inicio;

  let envios: Envio[] = [];
  let envioCapa: Envio | null = null;
  if (novas.length > 0 || capa) {
    const extensoes = novas.map((foto) => foto.foto.ext);
    const preparo = capa ? await deps.preparar(produtoId, extensoes, capa.ext) : await deps.preparar(produtoId, extensoes);
    fimPreparo = performance.now();
    if (preparo.error || !preparo.envios || preparo.envios.length !== novas.length || (capa && !preparo.capa)) {
      return { ok: false, erro: preparo.error ?? "Não foi possível preparar o envio das fotos. Tente de novo." };
    }
    envios = preparo.envios;
    envioCapa = preparo.capa ?? null;

    async function tentar(envio: Envio, foto: FotoReduzida): Promise<boolean> {
      try {
        return !(await deps.subir(envio.caminho, envio.token, foto)).error;
      } catch {
        return false;
      }
    }

    if (capa && envioCapa && !(await tentar(envioCapa, capa))) {
      await deps.descartar(produtoId).catch(() => undefined);
      return { ok: false, erro: MENSAGEM_CAPA_ENVIO };
    }

    for (const [i, foto] of novas.entries()) {
      if (!(await tentar(envios[i], foto.foto))) {
        await deps.descartar(produtoId).catch(() => undefined);
        return {
          ok: false,
          erro: `Não foi possível enviar a foto extra ${fotos.indexOf(foto) + 1}. Nada foi salvo; tente de novo.`,
        };
      }
    }
  }

  let proximaNova = 0;
  const itens: ItemGaleria[] = fotos.map((foto) => {
    if (foto.tipo === "existente") return { id: foto.id };
    const envio = envios[proximaNova++];
    return { novo: envio.novo, ext: envio.ext };
  });
  return {
    ok: true,
    itens,
    capa: envioCapa ? { novo: envioCapa.novo, ext: envioCapa.ext } : null,
    tempos: { prepararMs: fimPreparo - inicio, enviarMs: performance.now() - fimPreparo },
  };
}
