"use client";

// Escolha do recheio (uma opção só) do Bolo e do Bento Cake: botões de rádio
// em lista. O Bolo mostra dois grupos (Frutas / Chocolate e outros) e o
// R$/kg de cada recheio; o Bento Cake mostra uma lista simples, sem grupo e
// sem preço (o recheio é informativo).

export type OpcaoRecheio = { id: string; nome: string; detalhe?: string };
export type GrupoOpcoes = { chave: string; rotulo: string | null; opcoes: OpcaoRecheio[] };

export function EscolhaRecheio({
  titulo,
  dica,
  grupos,
  valor,
  aoEscolher,
  nomeCampo,
}: {
  titulo: string;
  dica: string;
  grupos: GrupoOpcoes[];
  valor: string | null;
  aoEscolher: (id: string) => void;
  nomeCampo: string;
}) {
  return (
    <div className="interna-composicao interna-recheio" role="radiogroup" aria-labelledby={`${nomeCampo}-titulo`}>
      <div className="interna-recheio-legenda">
        <span className="interna-bloco-titulo" id={`${nomeCampo}-titulo`}>
          {titulo}
        </span>
        <span className="interna-bloco-dica">{dica}</span>
      </div>
      {grupos.map((grupo) => (
        <div key={grupo.chave} className="interna-recheio-grupo">
          {grupo.rotulo ? <p className="interna-recheio-grupo-titulo">{grupo.rotulo}</p> : null}
          <ul className="interna-opcoes">
            {grupo.opcoes.map((opcao) => (
              <li key={opcao.id}>
                <label className="interna-opcao" data-marcada={valor === opcao.id}>
                  <input
                    type="radio"
                    name={nomeCampo}
                    value={opcao.id}
                    checked={valor === opcao.id}
                    onChange={() => aoEscolher(opcao.id)}
                  />
                  <span className="interna-opcao-nome">{opcao.nome}</span>
                  {opcao.detalhe ? (
                    <>
                      {" "}
                      <span className="interna-opcao-detalhe">{opcao.detalhe}</span>
                    </>
                  ) : null}
                </label>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
