"use client";

import { useMemo, useState, useTransition } from "react";
import { Card, Icon, Button, Badge } from "@/components/ds";
import { ConfirmDialog } from "./confirm-dialog";
import { ObservacaoField } from "./observacao-field";
import type { DiaOff, SegundaReabertura } from "@/lib/dias-off/types";
import {
  createDiaOff,
  deleteDiaOff,
  updateDiaOffObservacao,
  createReabertura,
  deleteReabertura,
  updateReaberturaObservacao,
} from "./actions";
import "./dias-off.css";

const SEGUNDA_FEIRA = 1; // Date#getDay()

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

function isMondayIso(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay() === SEGUNDA_FEIRA;
}

function formatDiaLabel(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAYS_FULL[date.getDay()]}, ${d} de ${MONTHS[m - 1].toLowerCase()} de ${y}`;
}

// Primeira letra maiúscula só no começo da frase inteira — o rótulo do dia
// (ex.: "quinta-feira, 5 de outubro de 2026") continua em minúsculas no
// meio, como qualquer nome próprio de dia da semana em português.
function capitalizeSentence(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
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

type AcaoPendente = { tipo: "marcar" | "remover" | "reabrir" | "fechar"; iso: string };

const DIALOG_TEXTO: Record<
  AcaoPendente["tipo"],
  { title: (label: string) => string; description: string; confirmLabel: string; pendingLabel: string; tone: "default" | "danger" }
> = {
  marcar: {
    title: (label) => `Marcar ${label} como sem produção?`,
    description: "A loja não vai produzir nessa data.",
    confirmLabel: "Marcar",
    pendingLabel: "Marcando…",
    tone: "default",
  },
  remover: {
    title: (label) => `Remover ${label} da lista de dias off?`,
    description: "Essa data volta a ficar disponível para produção normalmente.",
    confirmLabel: "Remover",
    pendingLabel: "Removendo…",
    tone: "danger",
  },
  reabrir: {
    title: (label) => `Reabrir ${label} para produção?`,
    description: "Essa segunda-feira passa a funcionar normalmente, fora da regra padrão de fechamento.",
    confirmLabel: "Reabrir",
    pendingLabel: "Reabrindo…",
    tone: "default",
  },
  fechar: {
    title: (label) => `Fechar ${label} novamente?`,
    description: "Essa segunda-feira volta a seguir a regra padrão: sem produção.",
    confirmLabel: "Fechar",
    pendingLabel: "Fechando…",
    tone: "danger",
  },
};

export function Calendario({ diasOff, reaberturas }: { diasOff: DiaOff[]; reaberturas: SegundaReabertura[] }) {
  const today = useMemo(() => new Date(), []);
  const todayIso = toIso(today.getFullYear(), today.getMonth(), today.getDate());

  const [cursor, setCursor] = useState(() => ({ year: today.getFullYear(), month: today.getMonth() }));

  const [diasOffMap, setDiasOffMap] = useState<Record<string, string>>(() =>
    Object.fromEntries(diasOff.map((d) => [d.data, d.id]))
  );
  const [reaberturasMap, setReaberturasMap] = useState<Record<string, string>>(() =>
    Object.fromEntries(reaberturas.map((r) => [r.data, r.id]))
  );
  const [obsDiasOff, setObsDiasOff] = useState<Record<string, string>>(() =>
    Object.fromEntries(diasOff.map((d) => [d.id, d.observacao ?? ""]))
  );
  const [obsReaberturas, setObsReaberturas] = useState<Record<string, string>>(() =>
    Object.fromEntries(reaberturas.map((r) => [r.id, r.observacao ?? ""]))
  );

  const [savingIso, setSavingIso] = useState<string | null>(null);
  const [erro, setErro] = useState<{ iso: string; message: string } | null>(null);
  const [acaoPendente, setAcaoPendente] = useState<AcaoPendente | null>(null);
  const [isPending, startTransition] = useTransition();

  const weeks = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor]);

  type ListItem = { tipo: "dia_off" | "reabertura"; iso: string; id: string; observacao: string };
  const itensListados = useMemo<ListItem[]>(() => {
    const a: ListItem[] = Object.entries(diasOffMap).map(([iso, id]) => ({
      tipo: "dia_off",
      iso,
      id,
      observacao: obsDiasOff[id] ?? "",
    }));
    const b: ListItem[] = Object.entries(reaberturasMap).map(([iso, id]) => ({
      tipo: "reabertura",
      iso,
      id,
      observacao: obsReaberturas[id] ?? "",
    }));
    return [...a, ...b].sort((x, y) => x.iso.localeCompare(y.iso));
  }, [diasOffMap, reaberturasMap, obsDiasOff, obsReaberturas]);

  function goToMonth(delta: number) {
    setCursor((c) => {
      const date = new Date(c.year, c.month + delta, 1);
      return { year: date.getFullYear(), month: date.getMonth() };
    });
  }

  function handleCellClick(iso: string, passado: boolean) {
    if (passado) return;
    if (isMondayIso(iso)) {
      setAcaoPendente({ tipo: iso in reaberturasMap ? "fechar" : "reabrir", iso });
    } else {
      setAcaoPendente({ tipo: iso in diasOffMap ? "remover" : "marcar", iso });
    }
  }

  function handleConfirm() {
    if (!acaoPendente) return;
    const { tipo, iso } = acaoPendente;
    setErro(null);
    setSavingIso(iso);

    startTransition(async () => {
      let result: { id?: string; error?: string };
      switch (tipo) {
        case "marcar":
          result = await createDiaOff(iso);
          break;
        case "remover":
          result = await deleteDiaOff(diasOffMap[iso]);
          break;
        case "reabrir":
          result = await createReabertura(iso);
          break;
        case "fechar":
          result = await deleteReabertura(reaberturasMap[iso]);
          break;
      }
      setSavingIso(null);

      if (result.error) {
        setErro({ iso, message: result.error });
        setAcaoPendente(null);
        return;
      }

      if (tipo === "marcar") {
        setDiasOffMap((m) => ({ ...m, [iso]: result.id ?? "" }));
        if (result.id) setObsDiasOff((o) => ({ ...o, [result.id!]: "" }));
      } else if (tipo === "remover") {
        setDiasOffMap((m) => {
          const next = { ...m };
          delete next[iso];
          return next;
        });
      } else if (tipo === "reabrir") {
        setReaberturasMap((m) => ({ ...m, [iso]: result.id ?? "" }));
        if (result.id) setObsReaberturas((o) => ({ ...o, [result.id!]: "" }));
      } else {
        setReaberturasMap((m) => {
          const next = { ...m };
          delete next[iso];
          return next;
        });
      }
      setAcaoPendente(null);
    });
  }

  async function handleSaveObsDiaOff(id: string, value: string) {
    const result = await updateDiaOffObservacao(id, value);
    if (!result.error) setObsDiasOff((o) => ({ ...o, [id]: value.trim() }));
    return result;
  }

  async function handleSaveObsReabertura(id: string, value: string) {
    const result = await updateReaberturaObservacao(id, value);
    if (!result.error) setObsReaberturas((o) => ({ ...o, [id]: value.trim() }));
    return result;
  }

  const dialogConfig = acaoPendente ? DIALOG_TEXTO[acaoPendente.tipo] : null;
  const dialogLabel = acaoPendente ? formatDiaLabel(acaoPendente.iso) : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="admin-page-header" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
        <div>
          <h1 className="admin-page-h1" style={{ fontFamily: "var(--font-heading)", fontSize: 32, lineHeight: 1.3, margin: 0, color: "var(--pdm-brown)" }}>
            Dias sem produção
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--pdm-muted)" }}>
            Marque com antecedência datas em que a loja não vai produzir (ex.: ponte de feriado). Segunda-feira já é
            fechada por padrão — clique numa segunda para abrir uma exceção pontual.
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

        <div className="dias-off-calendar-body">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 8 }}>
            {WEEKDAYS.map((w) => (
              <div key={w} style={{ textAlign: "center", fontSize: 13, fontWeight: 700, color: "var(--pdm-muted)", padding: "4px 0" }}>
                {w}
              </div>
            ))}
          </div>

          <div className="dias-off-weeks">
            {weeks.map((week, i) => (
              <div key={i} className="dias-off-week">
                {week.map((cell, j) => {
                  if (!cell) return <div key={j} />;

                  const monday = isMondayIso(cell.iso);
                  const reaberta = monday && cell.iso in reaberturasMap;
                  const marcadoNormal = !monday && cell.iso in diasOffMap;
                  const semProducao = monday ? !reaberta : marcadoNormal;

                  const passado = cell.iso < todayIso;
                  const isHoje = cell.iso === todayIso;
                  const saving = savingIso === cell.iso;
                  const cellErro = erro?.iso === cell.iso;

                  let sufixo = "";
                  if (monday) {
                    sufixo = reaberta ? ", segunda-feira reaberta para produção" : ", segunda-feira sem produção (padrão)";
                  } else if (marcadoNormal) {
                    sufixo = ", marcado como dia sem produção";
                  }
                  if (passado) sufixo += ", data no passado, indisponível";

                  let title: string | undefined;
                  if (!passado) {
                    if (monday) title = reaberta ? "Fechar esta segunda novamente" : "Reabrir esta segunda para produção";
                    else title = marcadoNormal ? "Remover dia off" : "Marcar como dia off";
                  }
                  if (cellErro) title = erro.message;

                  return (
                    <button
                      key={j}
                      type="button"
                      className="dias-off-day"
                      disabled={passado || saving}
                      aria-pressed={semProducao}
                      aria-label={`${formatDiaLabel(cell.iso)}${sufixo}`}
                      onClick={() => handleCellClick(cell.iso, passado)}
                      style={{
                        border: isHoje ? "2px solid var(--pdm-brown)" : "1px solid var(--border-subtle)",
                        background: semProducao ? "var(--pdm-brown)" : "var(--surface-card)",
                        color: semProducao ? "var(--pdm-white)" : passado ? "var(--pdm-muted)" : "var(--text-body)",
                        fontWeight: isHoje ? 700 : 400,
                        cursor: passado ? "not-allowed" : "pointer",
                        opacity: passado ? 0.45 : saving ? 0.6 : 1,
                      }}
                      title={title}
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
              Sem produção
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
        {itensListados.length === 0 ? (
          <p style={{ margin: 0, color: "var(--pdm-muted)" }}>Nenhuma data marcada ainda.</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 16 }}>
            {itensListados.map((item) => (
              <li
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                  padding: "12px 4px",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 220 }}>
                  <span>{capitalizeSentence(formatDiaLabel(item.iso))}</span>
                  <Badge variant={item.tipo === "dia_off" ? "brown" : "outline"} style={{ width: "fit-content" }}>
                    {item.tipo === "dia_off" ? "Dia sem produção" : "Segunda-feira reaberta para produção"}
                  </Badge>
                </div>

                <ObservacaoField
                  value={item.observacao}
                  ariaLabel={`Observação para ${formatDiaLabel(item.iso)}`}
                  onSave={(value) =>
                    item.tipo === "dia_off" ? handleSaveObsDiaOff(item.id, value) : handleSaveObsReabertura(item.id, value)
                  }
                />

                <Button
                  variant="ghost"
                  size="sm"
                  iconLeft={item.tipo === "dia_off" ? "delete" : "lock"}
                  aria-label={
                    item.tipo === "dia_off"
                      ? `Remover dia off de ${formatDiaLabel(item.iso)}`
                      : `Fechar novamente ${formatDiaLabel(item.iso)}`
                  }
                  onClick={() => setAcaoPendente({ tipo: item.tipo === "dia_off" ? "remover" : "fechar", iso: item.iso })}
                >
                  {item.tipo === "dia_off" ? "Remover" : "Fechar"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {acaoPendente && dialogConfig && (
        <ConfirmDialog
          title={dialogConfig.title(dialogLabel)}
          description={dialogConfig.description}
          confirmLabel={dialogConfig.confirmLabel}
          pendingLabel={dialogConfig.pendingLabel}
          tone={dialogConfig.tone}
          pending={isPending}
          onCancel={() => setAcaoPendente(null)}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}
