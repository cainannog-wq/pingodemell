import type { FotoReduzida } from "@/lib/galeria/reduzir";
import type { ExtensaoFoto, ItemGaleria } from "@/lib/galeria/regras";

// Estado de uma foto extra na tela do formulário. Nada disso existe no
// banco nem no storage até o Salvar: "nova" é só um arquivo já reduzido,
// guardado na memória do navegador.
export type FotoNaTela =
  | { chave: string; tipo: "existente"; id: string; url: string }
  | { chave: string; tipo: "nova"; foto: FotoReduzida; previewUrl: string };

type Envio = { novo: string; ext: ExtensaoFoto; caminho: string; token: string };

export type DependenciasEnvio = {
  preparar: (produtoId: string, extensoes: ExtensaoFoto[]) => Promise<{ envios?: Envio[]; error?: string }>;
  subir: (caminho: string, token: string, foto: FotoReduzida) => Promise<{ error?: string }>;
  descartar: (produtoId: string) => Promise<void>;
};

// Primeira etapa do Salvar: sobe as fotos novas direto para o storage,
// cada uma no caminho que o servidor escolheu. Devolve a lista final da
// galeria (na ordem da tela) para ir junto com o formulário. Se qualquer
// envio falhar, pede ao servidor para apagar o que já subiu e devolve o
// erro — nada fica gravado.
export async function enviarFotosNovas(
  produtoId: string,
  fotos: FotoNaTela[],
  deps: DependenciasEnvio
): Promise<{ ok: true; itens: ItemGaleria[] } | { ok: false; erro: string }> {
  const novas = fotos.filter((foto) => foto.tipo === "nova");

  let envios: Envio[] = [];
  if (novas.length > 0) {
    const preparo = await deps.preparar(
      produtoId,
      novas.map((foto) => foto.foto.ext)
    );
    if (preparo.error || !preparo.envios || preparo.envios.length !== novas.length) {
      return { ok: false, erro: preparo.error ?? "Não foi possível preparar o envio das fotos. Tente de novo." };
    }
    envios = preparo.envios;

    for (const [i, foto] of novas.entries()) {
      let erro: string | undefined;
      try {
        erro = (await deps.subir(envios[i].caminho, envios[i].token, foto.foto)).error;
      } catch (e) {
        erro = e instanceof Error ? e.message : "erro desconhecido";
      }
      if (erro) {
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
  return { ok: true, itens };
}
