"use client";

import { Card, Icon, Button } from "@/components/ds";

// Confirmação genérica reaproveitada nos quatro fluxos que mudam o status de
// uma data (marcar/remover um dia off específico, reabrir/fechar uma
// segunda-feira) — o texto muda por props, o comportamento é o mesmo.
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  pendingLabel,
  tone = "default",
  pending,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel: string;
  tone?: "default" | "danger";
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const accentColor = tone === "danger" ? "var(--pdm-error)" : "var(--pdm-brown)";

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="dia-off-confirm-title"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.4)",
        display: "grid",
        placeItems: "center",
        zIndex: 100,
        padding: 24,
      }}
    >
      <Card tone="white" padding="32px" style={{ maxWidth: 420, width: "100%", boxShadow: "var(--shadow-raised)" }}>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <Icon name="event_busy" size={28} color={accentColor} />
          <div>
            <h3
              id="dia-off-confirm-title"
              style={{ fontFamily: "var(--font-heading)", fontSize: 22, lineHeight: 1.4, margin: 0, color: "var(--pdm-brown)" }}
            >
              {title}
            </h3>
            <p style={{ margin: "8px 0 0", color: "var(--pdm-muted)" }}>{description}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 24, justifyContent: "flex-end" }}>
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="ghost" size="sm" style={{ color: accentColor }} onClick={onConfirm} disabled={pending}>
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </div>
      </Card>
    </div>
  );
}
