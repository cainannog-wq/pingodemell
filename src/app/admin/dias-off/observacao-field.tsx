"use client";

import { useState } from "react";
import { Input } from "@/components/ds";

// Observação interna editável inline, direto na linha da listagem — sem
// tela separada. Salva no blur (ou Enter), só quando o valor muda, e dá
// feedback acessível de sucesso/erro no mesmo padrão do toggle inline de
// produtos (role=status / role=alert).
export function ObservacaoField({
  value,
  ariaLabel,
  onSave,
}: {
  value: string;
  ariaLabel: string;
  onSave: (value: string) => Promise<{ error?: string }>;
}) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<"ok" | "erro" | undefined>();

  async function commit() {
    if (draft === value) return;
    setSaving(true);
    setFeedback(undefined);
    const result = await onSave(draft);
    setSaving(false);
    setFeedback(result.error ? "erro" : "ok");
    setTimeout(() => setFeedback(undefined), 2500);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 220px", minWidth: 200 }}>
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        placeholder="Observação interna (opcional)"
        aria-label={ariaLabel}
        disabled={saving}
        style={{ minHeight: 40, padding: "8px 12px", fontSize: 14 }}
      />
      {feedback === "erro" && (
        <span role="alert" style={{ fontSize: 12, color: "var(--pdm-error)" }}>
          Erro ao salvar observação
        </span>
      )}
      {feedback === "ok" && (
        <span role="status" style={{ fontSize: 12, color: "var(--pdm-success-text)" }}>
          Observação salva
        </span>
      )}
    </div>
  );
}
