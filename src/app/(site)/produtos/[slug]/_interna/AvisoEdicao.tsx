import Link from "next/link";
import { Icon } from "@/components/ds";
import { ROTAS } from "@/lib/site/rotas";

// Faixa no alto da configuração quando a interna foi aberta pelo ícone de
// editar do carrinho (?editar=).
// - "editando": a linha só muda quando a cliente salvar; voltar não muda nada;
// - "perdido": o vínculo não vale mais (linha removida, outro produto ou
//   endereço mexido à mão); confirmar adiciona um item novo.
export function AvisoEdicao({ tipo }: { tipo: "editando" | "perdido" }) {
  return (
    <div className="interna-edicao" data-tipo={tipo} role="status">
      <Icon name={tipo === "editando" ? "edit" : "info"} size={22} tone="inherit" />
      <div className="interna-edicao-texto">
        <p>
          {tipo === "editando"
            ? "Você está editando um item do seu pedido. Ele só muda quando você salvar."
            : "Esse item não está mais no seu pedido. Ao confirmar, ele entra como item novo."}
        </p>
        <Link href={ROTAS.carrinho}>{tipo === "editando" ? "Cancelar e voltar ao carrinho" : "Voltar ao carrinho"}</Link>
      </div>
    </div>
  );
}
