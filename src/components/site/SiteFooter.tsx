import Image from "next/image";
import Link from "next/link";
import { LOJA } from "@/lib/site/config";
import { ROTAS } from "@/lib/site/rotas";
import { Hive } from "./Hive";

// "Política de privacidade" não está no layout do Claude Design; entrou
// por pedido do Cainan (23/09/2026).
const LINKS_RODAPE = [
  { rotulo: "Produtos", href: ROTAS.lista },
  { rotulo: "Sobre nós", href: ROTAS.quemSomos },
  { rotulo: "Prazos", href: ROTAS.prazos },
  { rotulo: "Contato", href: ROTAS.contato },
  { rotulo: "Política de privacidade", href: ROTAS.privacidade },
];

export function SiteFooter() {
  return (
    <footer className="site-footer site-on-dark">
      <Hive />
      <div className="site-container site-footer-inner">
        <div className="site-footer-brand">
          <Image src="/logo-mono-cream.png" alt="Pingo de Mell" width={102} height={52} />
          <p className="site-footer-text">
            <span className="site-so-desktop">{LOJA.endereco}</span>
            <span className="site-so-mobile">{LOJA.enderecoCurto}</span>
            <br />
            {LOJA.horario}
            <br />
            {LOJA.telefone}
            <span className="site-so-desktop"> · {LOJA.instagram}</span> · CNPJ {LOJA.cnpj}
          </p>
        </div>
        <nav className="site-footer-links" aria-label="Rodapé">
          {LINKS_RODAPE.map((link) => (
            <Link key={link.rotulo} href={link.href}>
              {link.rotulo}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
