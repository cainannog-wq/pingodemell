"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Button, Icon } from "@/components/ds";
import { LOJA } from "@/lib/site/config";
import { ROTAS } from "@/lib/site/rotas";
import { LINK_WHATSAPP_CONTATO } from "@/lib/site/whatsapp";
import { useCarrinho } from "./CarrinhoProvider";
import { Hive } from "./Hive";
import { NAV_PRINCIPAL } from "./nav";

// Cabeçalho do site público: logo, navegação (Home, Produtos, Sobre nós,
// Contato) e sacola com o contador do carrinho (número de itens diferentes;
// some quando o carrinho está vazio). No HTML do servidor o carrinho é
// vazio; o contador aparece assim que a página carrega no navegador.
// Abaixo de 768px a navegação vira o botão de menu, que abre o painel de
// tela cheia (<dialog> nativo: prende o foco, fecha com Esc e devolve o
// foco pro botão ao fechar).
export function SiteHeader() {
  const pathname = usePathname() ?? "/";
  const menuRef = useRef<HTMLDialogElement>(null);
  const { totalItens } = useCarrinho();

  // Fecha o menu ao navegar (inclusive clicando no item da página atual).
  useEffect(() => {
    menuRef.current?.close();
  }, [pathname]);

  const fecharMenu = () => menuRef.current?.close();

  return (
    <header className="site-header">
      <div className="site-container site-header-inner">
        <Link href={ROTAS.home} className="site-header-logo" aria-label="Pingo de Mell — página inicial">
          {/* Sempre na primeira tela: carrega já, sem loading="lazy". Sem
              fetchPriority="high", para não disputar banda com o hero. */}
          <Image src="/logo-gold.png" alt="" width={201} height={102} loading="eager" />
        </Link>

        <nav className="site-nav" aria-label="Principal">
          {NAV_PRINCIPAL.map((item) => (
            <Link key={item.rotulo} href={item.href} aria-current={item.ativo(pathname) ? "page" : undefined}>
              {item.rotulo}
            </Link>
          ))}
        </nav>

        <div className="site-header-actions">
          <Link
            href={ROTAS.carrinho}
            className="site-icon-btn site-sacola"
            aria-label={
              totalItens === 0
                ? "Sacola do pedido, vazia"
                : `Sacola do pedido, ${totalItens} ${totalItens === 1 ? "item" : "itens"}`
            }
          >
            <Icon name="shopping_bag" size={30} tone="inherit" />
            {totalItens > 0 ? (
              <span className="site-sacola-contador" data-testid="contador-sacola" aria-hidden="true">
                {totalItens > 99 ? "99+" : totalItens}
              </span>
            ) : null}
          </Link>
          <button
            type="button"
            className="site-icon-btn site-menu-btn"
            aria-label="Abrir menu"
            aria-haspopup="dialog"
            onClick={() => menuRef.current?.showModal()}
          >
            <Icon name="menu" size={28} tone="inherit" />
          </button>
        </div>
      </div>

      <dialog ref={menuRef} className="site-menu site-on-dark" aria-label="Menu">
        <Hive />
        <div className="site-menu-top">
          <Image src="/logo-mono-cream.png" alt="Pingo de Mell" width={83} height={42} />
          <button type="button" className="site-icon-btn" aria-label="Fechar menu" onClick={fecharMenu}>
            <Icon name="close" size={30} tone="inherit" />
          </button>
        </div>

        <nav className="site-menu-nav" aria-label="Principal (menu)">
          {NAV_PRINCIPAL.map((item) => (
            <Link
              key={item.rotulo}
              href={item.href}
              aria-current={item.ativo(pathname) ? "page" : undefined}
              onClick={fecharMenu}
            >
              {item.rotulo}
              <Icon name="arrow_forward" size={24} color="var(--gold-300)" />
            </Link>
          ))}
        </nav>

        <div className="site-menu-bottom">
          <div className="site-menu-hours">
            <Icon name="schedule" size={24} color="var(--brown-700)" />
            <p>
              <strong>Horário de atendimento</strong>
              <br />
              {LOJA.horarioAtendimento}
            </p>
          </div>
          <Button
            as="a"
            href={LINK_WHATSAPP_CONTATO}
            target="_blank"
            rel="noopener noreferrer"
            variant="whatsapp"
            size="md"
            fullWidth
            iconLeft="whatsapp"
          >
            Fale conosco
          </Button>
          <p className="site-menu-contact">
            {LOJA.telefone} · {LOJA.instagram}
          </p>
        </div>
      </dialog>
    </header>
  );
}
