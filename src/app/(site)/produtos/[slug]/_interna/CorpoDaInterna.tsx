import Link from "next/link";
import { Suspense } from "react";
import { Badge, Icon } from "@/components/ds";
import { CardProduto, PrecoProduto } from "@/components/site/CardProduto";
import { categoriaCanonica } from "@/lib/produtos/categorias";
import { LOJA } from "@/lib/site/config";
import { ROTAS } from "@/lib/site/rotas";
import type { Interna } from "@/lib/vitrine/buscar";
import { UNIDADES_POR_CENTO } from "@/lib/vitrine/cento";
import { categoriaEstaNaLista } from "@/lib/vitrine/lista";
import { ehMaisPedido, selecionarRelacionados, type ProdutoVitrine } from "@/lib/vitrine/mais-pedidos";
import { textoMinimo } from "@/lib/vitrine/minimo";
import { variacaoDoProduto } from "@/lib/vitrine/variacao";
import { ConfigAvulso } from "./ConfigAvulso";
import { ConfigBento } from "./ConfigBento";
import { ConfigEditavel } from "./ConfigEditavel";
import { ConfigEditavelDaUrl } from "./ConfigEditavelDaUrl";
import { ConfigKit } from "./ConfigKit";
import { Galeria } from "./Galeria";
import "../interna.css";

// Corpo da interna do produto, igual para a página pública (/produtos/{slug},
// em cache) e para a prévia do admin (/previa/{slug}, sem cache e só com
// sessão). Quem decide a tela é o tipo do produto (variacaoDoProduto): o
// Cento monta a combinação de sabores; o Bolo escolhe tamanho, formato e
// recheio; o Bento Cake com recheios próprios escolhe o recheio e a quantidade
// (sem recheios próprios, vira avulso); o kit por pessoa escolhe as pessoas e
// monta cada grupo; o avulso (inclusive o Smash Cake) escolhe a quantidade e,
// se o produto tem recheios personalizados, um recheio.
//
// `previa`: o kit aparece como a cliente o veria, mas o botão de adicionar
// fica desligado (um kit inativo não pode entrar num pedido). `avisoDaPrevia`
// entra no lugar da configuração quando o kit ainda não está completo.

type InternaOk = Extract<Interna, { estado: "ok" }>;

export function CorpoDaInterna({
  interna,
  maisPedidos,
  previa = false,
  avisoDaPrevia = null,
}: {
  interna: InternaOk;
  maisPedidos: ProdutoVitrine[];
  previa?: boolean;
  avisoDaPrevia?: string | null;
}) {
  const { produto, sabores, recheios, recheiosProduto, fotos, kit } = interna;
  const relacionados = selecionarRelacionados(maisPedidos, produto.id);
  const variacao = variacaoDoProduto(produto);
  const cento = variacao === "cento";
  const minimo = textoMinimo(produto);
  // "Kits" e "Kit Festa" são a mesma categoria (ver categoriaCanonica).
  const categoria = categoriaCanonica(produto.Categoria);

  return (
    <div className="interna">
      <nav className="site-container interna-trilha" aria-label="Você está em">
        <ol>
          <li>
            <Link href={ROTAS.lista}>Produtos</Link>
          </li>
          {categoria ? (
            <li>
              <Icon name="chevron_right" size={16} color="var(--brown-300)" />
              {/* Adicionais e Bebidas ficam fora da Lista: a categoria
                  aparece como texto, sem link (o filtro não existe lá). */}
              {categoriaEstaNaLista(categoria) ? (
                <Link href={ROTAS.listaPorCategoria(categoria)}>{categoria}</Link>
              ) : (
                <span>{categoria}</span>
              )}
            </li>
          ) : null}
          <li>
            <Icon name="chevron_right" size={16} color="var(--brown-300)" />
            <span aria-current="page">{produto.nome}</span>
          </li>
        </ol>
      </nav>

      <section className="site-container interna-corpo" aria-labelledby="interna-titulo">
        <Galeria fotos={fotos} nome={produto.nome} />

        <div className="interna-config">
          <div className="interna-cabeca">
            {categoria || ehMaisPedido(produto) ? (
              <div className="interna-selos">
                {categoria ? <Badge variant="soft">{categoria}</Badge> : null}
                {ehMaisPedido(produto) ? (
                  <Badge variant="gold" style={{ textTransform: "none", letterSpacing: "normal" }}>
                    Mais pedido
                  </Badge>
                ) : null}
              </div>
            ) : null}
            <h1 id="interna-titulo">{produto.nome}</h1>
            {produto.descricao ? <p className="interna-descricao">{produto.descricao}</p> : null}
            <div className="interna-preco">
              <PrecoProduto produto={produto} />
            </div>
            {cento ? (
              <p className="interna-minimo">
                <Icon name="inventory_2" size={20} color="var(--brown-700)" />
                Cada cento: {UNIDADES_POR_CENTO} unidades
              </p>
            ) : minimo ? (
              <p className="interna-minimo">
                <Icon name="inventory_2" size={20} color="var(--brown-700)" />
                {minimo}
              </p>
            ) : null}
          </div>

          <div className="interna-divisor" />

          {avisoDaPrevia ? (
            <p className="interna-aviso" role="status">
              <Icon name="info" size={20} tone="inherit" />
              {avisoDaPrevia}
            </p>
          ) : variacao === "cento" ? (
            // Sem o JavaScript (HTML guardado), a configuração comum; no
            // navegador, ConfigEditavelDaUrl lê o ?editar= e entra no modo
            // edição quando ele existe.
            <Suspense fallback={<ConfigEditavel tipo="cento" produto={produto} sabores={sabores} editarId={null} />}>
              <ConfigEditavelDaUrl tipo="cento" produto={produto} sabores={sabores} />
            </Suspense>
          ) : variacao === "bolo" ? (
            <Suspense fallback={<ConfigEditavel tipo="bolo" produto={produto} recheios={recheios} editarId={null} />}>
              <ConfigEditavelDaUrl tipo="bolo" produto={produto} recheios={recheios} />
            </Suspense>
          ) : variacao === "kit" && kit ? (
            <ConfigKit produto={produto} config={kit} previa={previa} />
          ) : variacao === "bento" && recheiosProduto.length > 0 ? (
            <ConfigBento produto={produto} recheios={recheiosProduto} />
          ) : (
            // Avulso, Smash Cake, Bolo de tipo normal e Bento Cake sem lista de
            // recheios; com lista (Ganache, Kit Kat...), a escolha é obrigatória.
            <ConfigAvulso produto={produto} recheios={recheiosProduto} />
          )}

          <div className="interna-prazo">
            <h2 className="interna-prazo-titulo">Prazo e como receber</h2>
            <p>
              <Icon name="schedule" size={22} color="var(--brown-700)" />
              <span>Dias de semana: 1 dia de antecedência. Fins de semana: pedidos até quinta-feira.</span>
            </p>
            <p>
              <Icon name="storefront" size={22} color="var(--brown-700)" />
              <span>
                Retirada na loja: {LOJA.enderecoCurto} · {LOJA.horario.toLowerCase()}.
              </span>
            </p>
            <p>
              <Icon name="local_shipping" size={22} color="var(--brown-700)" />
              <span>Entrega em Fazenda Rio Grande com acréscimo a combinar no WhatsApp.</span>
            </p>
          </div>
        </div>
      </section>

      {relacionados.length > 0 ? (
        <section className="interna-relacionados" aria-labelledby="interna-relacionados-titulo">
          <div className="site-container">
            <h2 id="interna-relacionados-titulo">Combina com o seu pedido</h2>
            <ul className="interna-relacionados-grade" role="list">
              {relacionados.map((p) => (
                <li key={p.id}>
                  <CardProduto produto={p} sizes="(max-width: 767px) 230px, 384px" />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  );
}
