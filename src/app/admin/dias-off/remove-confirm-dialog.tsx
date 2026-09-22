"use client";

import { Card, Icon, Button } from "@/components/ds";

export function RemoveConfirmDialog({
  label,
  pending,
  onCancel,
  onConfirm,
}: {
  label: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="remove-diaoff-confirm-title"
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
          <Icon name="event_available" size={28} color="var(--pdm-error)" />
          <div>
            <h3
              id="remove-diaoff-confirm-title"
              style={{ fontFamily: "var(--font-heading)", fontSize: 22, lineHeight: 1.4, margin: 0, color: "var(--pdm-brown)", textTransform: "capitalize" }}
            >
              Remover {label} da lista de dias off?
            </h3>
            <p style={{ margin: "8px 0 0", color: "var(--pdm-muted)" }}>
              Essa data volta a ficar disponível para produção normalmente.
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 24, justifyContent: "flex-end" }}>
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="ghost" size="sm" style={{ color: "var(--pdm-error)" }} onClick={onConfirm} disabled={pending}>
            {pending ? "Removendo…" : "Remover"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
