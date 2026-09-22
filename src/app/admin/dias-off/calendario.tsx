"use client";

import { useMemo, useState, useTransition } from "react";
import { Card, Icon, Button } from "@/components/ds";
import { RemoveConfirmDialog } from "./remove-confirm-dialog";
import type { DiaOff } from "@/lib/dias-off/types";
import { createDiaOff, deleteDiaOff } from "./actions";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const WEEKDAYS_FULL = [
  "domingo", "segunda-feira", "terça-feira", "quarta-feira",
  "quinta-feira", "sexta-feira", "sábado",
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toIso(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function formatDiaLabel(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAYS_FULL[date.getDay()]}, ${d} de ${MONTHS[m - 1].toLowerCase()} de ${y}`;
}

type Cell = { day: number; iso: string } | null;

function buildMonthGrid(year: number, month: number): Cell[][] {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: Cell[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push({ day, iso: toIso(year, month, day) });
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: Cell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function Calendario({ diasOff }: { diasOff: DiaOff[] }) {
  const today = useMemo(() => new Date(), []);
  const todayIso = toIso(today.getFullYear(), today.getMonth(), today.getDate());

  const [cursor, setCursor] = useState(() => ({ year: today.getFullYear(), month: today.getMonth() }));
  const [marcados, setMarcados] = useState<Record<string, string>>(() =>
    Object.fromEntries(diasOff.map((d) => [d.data, d.id]))
  );
  const [savingIso, setSavingIso] = useState<string | null>(null);
  const [erro, setErro] = useState<{ iso: string; message: string } | null>(null);
  const [paraRemover, setParaRemover] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const weeks = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor]);
  const isoOrdenados = useMemo(() => Object.keys(marcados).sort(), [marcados]);

  function goToMonth(delta: number) {
    setCursor((c) => {
      const date = new Date(c.year, c.month + delta, 1);
      return { year: date.getFullYear(), month: date.getMonth() };
    });
  }

  function handleAdd(iso: string) {
    setErro(null);
    setSavingIso(iso);
    startTransition(async () => {
      const result = await createDiaOff(iso);
      setSavingIso(null);
      if (result.error) {
        setErro({ iso, message: result.error });
        return;
      }
      setMarcados((m) => ({ ...m, [iso]: result.id ?? "" }));
    });
  }

  function handleConfirmRemove() {
    if (!paraRemover) return;
    const iso = paraRemover;
    const id = marcados[iso];
    setSavingIso(iso);
    startTransition(async () => {
      const result = await deleteDiaOff(id);
      setSavingIso(null);
      if (result.error) {
        setErro({ iso, message: result.error });
        setParaRemover(null);
        return;
      }
      setMarcados((m) => {
        const next = { ...m };
        delete next[iso];
        return next;
      });
      setParaRemover(null);
    });
  }

  function handleCellClick(iso: string, marcado: boolean, passado: boolean) {
    if (passado) return;
    if (marcado) {
      setParaRemover(iso);
    } else {
      handleAdd(iso);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="admin-page-header" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
        <div>
          <h1 className="admin-page-h1" style={{ fontFamily: "var(--font-heading)", fontSize: 32, lineHeight: 1.3, margin: 0, color: "var(--pdm-brown)" }}>
            Dias sem produção
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--pdm-muted)" }}>
            Marque com antecedência datas em que a loja não vai produzir (ex.: ponte de feriado).
          </p>
        </div>
      </div>

      <Card tone="white" padding="0">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            padding: "20px 24px",
            borderBottom: "1px solid var(--border-subtle)",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Button variant="ghost" size="sm" aria-label="Mês anterior" onClick={() => goToMonth(-1)}>
              <Icon name="chevron_left" size={22} tone="inherit" />
            </Button>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, minWidth: 180, textAlign: "center", color: "var(--pdm-brown)" }}>
              {MONTHS[cursor.month]} de {cursor.year}
            </div>
            <Button variant="ghost" size="sm" aria-label="Próximo mês" onClick={() => goToMonth(1)}>
              <Icon name="chevron_right" size={22} tone="inherit" />
            </Button>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setCursor({ year: today.getFullYear(), month: today.getMonth() })}>
            Hoje
          </Button>
        </div>

        <div style={{ padding: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 8 }}>
            {WEEKDAYS.map((w) => (
              <div key={w} style={{ textAlign: "center", fontSize: 13, fontWeight: 700, color: "var(--pdm-muted)", padding: "4px 0" }}>
                {w}
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gap: 4 }}>
            {weeks.map((week, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
                {week.map((cell, j) => {
                  if (!cell) return <div key={j} />;

                  const marcado = cell.iso in marcados;
                  const passado = cell.iso < todayIso;
                  const isHoje = cell.iso === todayIso;
                  const saving = savingIso === cell.iso;
                  const cellErro = erro?.iso === cell.iso;

                  return (
                    <button
                      key={j}
                      type="button"
                      disabled={passado || saving}
                      aria-pressed={marcado}
                      aria-label={`${formatDiaLabel(cell.iso)}${marcado ? ", marcado como dia sem produção" : ""}${passado ? ", data no passado, indisponível" : ""}`}
                      onClick={() => handleCellClick(cell.iso, marcado, passado)}
                      style={{
                        position: "relative",
                        aspectRatio: "1",
                        borderRadius: "var(--radius)",
                        border: isHoje ? "2px solid var(--pdm-brown)" : "1px solid var(--border-subtle)",
                        background: marcado ? "var(--pdm-brown)" : "var(--surface-card)",
                        color: marcado ? "var(--pdm-white)" : passado ? "var(--pdm-muted)" : "var(--text-body)",
                        fontWeight: isHoje ? 700 : 400,
                        cursor: passado ? "not-allowed" : "pointer",
                        opacity: passado ? 0.45 : saving ? 0.6 : 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 14,
                        transition: "var(--transition-base)",
                      }}
                      title={cellErro ? erro.message : marcado ? "Remover dia off" : passado ? undefined : "Marcar como dia off"}
                    >
                      {cell.day}
                      {cellErro && (
                        <span
                          style={{
                            position: "absolute",
                            bottom: -2,
                            right: -2,
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: "var(--pdm-error)",
                          }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {erro && (
            <p role="alert" style={{ marginTop: 16, marginBottom: 0, fontSize: 14, color: "var(--pdm-error)" }}>
              {erro.message}
            </p>
          )}

          <div style={{ display: "flex", gap: 20, marginTop: 20, flexWrap: "wrap", fontSize: 13, color: "var(--pdm-muted)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 16, height: 16, borderRadius: 4, background: "var(--pdm-brown)", display: "inline-block" }} />
              Dia sem produção
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 16, height: 16, borderRadius: 4, border: "2px solid var(--pdm-brown)", display: "inline-block" }} />
              Hoje
            </div>
          </div>
        </div>
      </Card>

      <Card tone="white" padding="24px">
        <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 20, margin: "0 0 12px", color: "var(--pdm-brown)" }}>
          Datas marcadas
        </h2>
        {isoOrdenados.length === 0 ? (
          <p style={{ margin: 0, color: "var(--pdm-muted)" }}>Nenhum dia sem produção marcado ainda.</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
            {isoOrdenados.map((iso) => (
              <li
                key={iso}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 4px",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                <span style={{ textTransform: "capitalize" }}>{formatDiaLabel(iso)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  iconLeft="delete"
                  aria-label={`Remover dia off de ${formatDiaLabel(iso)}`}
                  onClick={() => setParaRemover(iso)}
                >
                  Remover
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {paraRemover && (
        <RemoveConfirmDialog
          label={formatDiaLabel(paraRemover)}
          pending={isPending}
          onCancel={() => setParaRemover(null)}
          onConfirm={handleConfirmRemove}
        />
      )}
    </div>
  );
}
