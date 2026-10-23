// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CarrinhoProvider } from "@/components/site/CarrinhoProvider";
import { SiteHeader } from "@/components/site/SiteHeader";
import { CHAVE_CARRINHO, reiniciarParaTeste } from "@/lib/carrinho/armazenamento";
import type { ProdutoVitrine } from "@/lib/vitrine/mais-pedidos";
import { clienteSimulado, novoBanco, type BancoSimulado } from "@/test/banco-simulado";

// Interna do Bolo, do Bento Cake e do Smash Cake com o banco simulado (nada
// real): recheios do catálogo, preço, avisos, carrinho e disponibilidade
// independente dos dois lados do catálogo.

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={props.alt as string} src={props.src as string} />;
  },
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

class NaoEncontrado extends Error {}
const buscaDaUrl = vi.hoisted(() => ({ atual: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/produtos/x",
  // A busca da URL, lida no navegador (ConfigEditavelDaUrl).
  useSearchParams: () => new URLSearchParams(buscaDaUrl.atual),
  notFound: () => {
    throw new NaoEncontrado("404");
  },
}));

let banco: BancoSimulado;
vi.mock("@/lib/supabase/publico", () => ({ createPublicClient: vi.fn(() => clienteSimulado(banco)) }));

let seq = 0;
function produto(parcial: Partial<ProdutoVitrine>): ProdutoVitrine {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    slug: `produto-${seq}`,
    nome: `Produto ${seq}`,
    descricao: null,
    preco: 10,
    image_url: null,
    Categoria: "Doces",
    tipo: "normal",
    unidade_venda: null,
    pedido_minimo: 1,
    step_quantidade: "livre",
    ativo: true,
    destaque: false,
    atualizado_em: "2026-09-23T14:29:18.070Z",
    ...parcial,
  };
}

let seqRecheio = 0;
function recheio(parcial: Record<string, unknown>) {
  seqRecheio += 1;
  return {
    id: `rrrrrrrr-0000-4000-8000-${String(seqRecheio).padStart(12, "0")}`,
    nome: `Recheio ${seqRecheio}`,
    vale_bolo: false,
    vale_bento: false,
    preco_kg: null,
    grupo: null,
    ativo: true,
    ...parcial,
  };
}

const BOLO = produto({ nome: 'Bolo de Chocolate', slug: 'bolo-de-chocolate', Categoria: 'Bolos', tipo: 'bolo' });
const BOMBOM = produto({ nome: 'Bombom', slug: 'bombom', preco: 2.5, pedido_minimo: 10, step_quantidade: 'multiplos_5', unidade_venda: 'unidade' });
const BENTO = produto({ nome: 'Bento Cake Flork', slug: 'bento-flork', Categoria: 'Bento Cake', tipo: 'bento_cake', preco: 60, pedido_minimo: 2 });
const MORANGO = recheio({ nome: 'Morango', vale_bolo: true, vale_bento: true, preco_kg: 95, grupo: 'frutas' });

function celular(sim: boolean) {
  vi.stubGlobal('matchMedia', (consulta: string) => ({
    matches: sim && consulta.includes('max-width: 767px'),
    media: consulta,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeAll(() => {
  HTMLDialogElement.prototype.close ??= function () {};
  HTMLDialogElement.prototype.showModal ??= function () {};
});
beforeEach(() => {
  banco = novoBanco(
    {
      produtos: [BOLO, BOMBOM, BENTO],
      recheios: [MORANGO],
      produto_fotos: [],
      produto_recheios: [{ produto_id: BENTO.id, id: MORANGO.id, nome: 'Morango', posicao: 1 }],
    },
    'anon'
  );
  window.localStorage.clear();
  reiniciarParaTeste();
  celular(true);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderInterna(slug: string) {
  const { default: ProdutoPage } = await import('./page');
  const ui = await ProdutoPage({ params: Promise.resolve({ slug }) });
  return render(
    <CarrinhoProvider>
      <SiteHeader />
      {ui}
    </CarrinhoProvider>
  );
}

const barra = () => document.querySelector('.interna-barra') as HTMLElement;
const salvo = () => JSON.parse(window.localStorage.getItem(CHAVE_CARRINHO)!).linhas;

describe('Interna no celular — seletor na barra fixa', () => {
  it('Bolo: o seletor vive só na barra (sem campo digitável nem duplicata no corpo)', async () => {
    await renderInterna('bolo-de-chocolate');
    expect(screen.getAllByRole('button', { name: 'Aumentar Tamanho em kg' })).toHaveLength(1);
    expect(within(barra()).getByRole('button', { name: 'Aumentar Tamanho em kg' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Tamanho em kg' })).toBeNull();
    expect(within(barra()).getByText('Subtotal')).toBeInTheDocument();
    expect(within(barra()).getByRole('button', { name: 'Adicionar' })).toBeInTheDocument();
    expect(within(barra()).getByText('Escolha o recheio')).toBeInTheDocument();
  });

  it('Bolo redondo: 1 kg desliga o −; o + vai até 4 kg e desliga; retangular vai de 2 a 5 kg', async () => {
    const user = userEvent.setup();
    await renderInterna('bolo-de-chocolate');
    const menos = () => within(barra()).getByRole('button', { name: 'Diminuir Tamanho em kg' });
    const mais = () => within(barra()).getByRole('button', { name: 'Aumentar Tamanho em kg' });
    expect(menos()).toBeDisabled();
    for (let i = 1; i < 4; i++) await user.click(mais());
    expect(mais()).toBeDisabled();
    expect(within(barra()).queryByRole('link', { name: 'Combine pelo WhatsApp' })).toBeNull();
    // Retangular: 4 kg cabe; o + vai até 5 e o − para no 2.
    await user.click(screen.getByRole('radio', { name: 'Retangular' }));
    expect(mais()).toBeEnabled();
    await user.click(mais());
    expect(mais()).toBeDisabled();
    for (let i = 5; i > 2; i--) await user.click(menos());
    expect(menos()).toBeDisabled();
  });

  it('Bolo: subtotal = R$/kg do recheio × kg a cada clique; a linha do carrinho mantém o formato', async () => {
    const user = userEvent.setup();
    await renderInterna('bolo-de-chocolate');
    await user.click(screen.getByRole('radio', { name: /Morango/ }));
    expect(within(barra()).getByText(/R\$\s*95,00/)).toBeInTheDocument();
    await user.click(within(barra()).getByRole('button', { name: 'Aumentar Tamanho em kg' }));
    await user.click(within(barra()).getByRole('button', { name: 'Aumentar Tamanho em kg' }));
    expect(within(barra()).getByText(/R\$\s*285,00/)).toBeInTheDocument();
    await user.click(within(barra()).getByRole('button', { name: 'Adicionar' }));
    const [linha] = salvo();
    expect(linha).toMatchObject({ tipo: 'bolo', produtoId: BOLO.id, quantidade: 3, preco: 95, formato: 'redondo', recheio: { id: MORANGO.id, nome: 'Morango' } });
  });

  it('avulso com pedido mínimo e step: começa no mínimo, − desligado, + anda um step; subtotal = preço × quantidade', async () => {
    const user = userEvent.setup();
    await renderInterna('bombom');
    expect(screen.queryByRole('textbox', { name: 'Quantidade' })).toBeNull();
    const menos = within(barra()).getByRole('button', { name: 'Diminuir Quantidade' });
    expect(menos).toBeDisabled();
    expect(within(barra()).getByText(/R\$\s*25,00/)).toBeInTheDocument();
    await user.click(within(barra()).getByRole('button', { name: 'Aumentar Quantidade' }));
    expect(within(barra()).getByText(/R\$\s*37,50/)).toBeInTheDocument();
    expect(menos).toBeEnabled();
    await user.click(within(barra()).getByRole('button', { name: 'Adicionar' }));
    expect(salvo()[0]).toMatchObject({ tipo: 'normal', produtoId: BOMBOM.id, quantidade: 15, preco: 2.5, pedidoMinimo: 10, step: 'multiplos_5' });
  });

  it('Bento Cake: quantidade na barra, mínimo do cadastro, subtotal da barra mesmo sem recheio', async () => {
    const user = userEvent.setup();
    await renderInterna('bento-flork');
    expect(screen.queryByRole('textbox', { name: 'Quantidade' })).toBeNull();
    expect(within(barra()).getByRole('button', { name: 'Diminuir Quantidade' })).toBeDisabled();
    expect(within(barra()).getByText(/R\$\s*120,00/)).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Morango/ }));
    await user.click(within(barra()).getByRole('button', { name: 'Adicionar' }));
    expect(salvo()[0]).toMatchObject({ tipo: 'bento', quantidade: 2, preco: 60, recheio: { id: MORANGO.id } });
  });

  it('desktop: o seletor continua no corpo, digitável, e a barra não tem seletor', async () => {
    celular(false);
    await renderInterna('bolo-de-chocolate');
    expect(screen.getByRole('textbox', { name: 'Tamanho em kg' })).toBeInTheDocument();
    expect(within(barra()).queryByRole('button', { name: 'Aumentar Tamanho em kg' })).toBeNull();
  });
});
