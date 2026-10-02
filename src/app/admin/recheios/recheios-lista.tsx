"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge, Button, Card, Icon, Toggle } from "@/components/ds";
import { formatMoeda } from "@/lib/pedidos/format";
import { GRUPO_RECHEIO_LABELS, type Recheio } from "@/lib/recheios/types";
import { updateRecheioAtivo } from "./actions";

const thStyle = {
  textAlign: "left" as const,
  fontSize: 13,
  fontWeight: 700,
  textTransform: "uppercase" as const,
  letterSpacing: ".05em",
  color: "var(--pdm-brown)",
  padding: "16px 24px",
};

// Listagem do catálogo de recheios, com o interruptor de ativo direto na
// linha. Sem exclusão: recheio só é desativado.
export function RecheiosLista({ recheios }: { recheios: Recheio[] }) {
  const [sobrescritos, setSobrescritos] = useState<Record<string, boolean>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [, iniciar] = useTransition();

  function alternar(recheio: Recheio, proximo: boolean) {
    const anterior = sobrescritos[recheio.id] ?? recheio.ativo;
    setSobrescritos((s) => ({ ...s, [recheio.id]: proximo }));
    setErro(null);
    iniciar(async () => {
      const r = await updateRecheioAtivo(recheio.id, proximo);
      if (r.error) {
        setSobrescritos((s) => ({ ...s, [recheio.id]: anterior }));
        setErro(r.error);
      }
    });
  }

  if (recheios.length === 0) {
    return (
      <Card tone="white" padding="32px">
        <p style={{ margin: 0, color: "var(--pdm-muted)" }}>Nenhum recheio cadastrado ainda.</p>
      </Card>
    );
  }

  return (
    <Card tone="white" padding="0">
      {erro ? (
        <p role="alert" style={{ margin: 0, padding: "16px 24px", color: "var(--pdm-error)" }}>
          {erro}
        </p>
      ) : null}
      <div style={{ overflowX: "auto" }}>
        <table className="admin-table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--pdm-cream)" }}>
              <th style={thStyle}>Nome</th>
              <th style={thStyle}>Onde vale</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Preço por kg</th>
              <th style={thStyle}>Grupo</th>
              <th style={thStyle}>Status</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {recheios.map((r) => {
              const ativo = sobrescritos[r.id] ?? r.ativo;
              return (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td className="admin-table-title" style={{ padding: "16px 24px", fontWeight: 600 }}>
                    {r.nome}
                  </td>
                  <td data-label="Onde vale" style={{ padding: "16px 24px" }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {r.vale_bolo ? <Badge variant="soft">Bolo grande</Badge> : null}
                      {r.vale_bento ? <Badge variant="soft">Bento Cake</Badge> : null}
                    </div>
                  </td>
                  <td data-label="Preço por kg" style={{ padding: "16px 24px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {r.preco_kg === null ? "—" : formatMoeda(Number(r.preco_kg))}
                  </td>
                  <td data-label="Grupo" style={{ padding: "16px 24px", color: "var(--pdm-muted)" }}>
                    {r.grupo ? GRUPO_RECHEIO_LABELS[r.grupo] : "—"}
                  </td>
                  <td data-label="Status" style={{ padding: "16px 24px" }}>
                    <Toggle
                      checked={ativo}
                      onCheckedChange={(v) => alternar(r, v)}
                      label={ativo ? "Ativo" : "Inativo"}
                      aria-label={`Recheio ${r.nome} ativo`}
                    />
                  </td>
                  <td data-label="Ações" style={{ padding: "16px 24px", textAlign: "right" }}>
                    <Link href={`/admin/recheios/${r.id}`}>
                      <Button variant="secondary" size="sm" iconLeft="edit">
                        Editar
                      </Button>
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={{ margin: 0, padding: "12px 24px", fontSize: 13, color: "var(--pdm-muted)", display: "flex", gap: 8, alignItems: "center" }}>
        <Icon name="info" size={18} tone="inherit" />
        Recheio nunca é apagado: para tirar das telas do cliente, desative.
      </p>
    </Card>
  );
}
