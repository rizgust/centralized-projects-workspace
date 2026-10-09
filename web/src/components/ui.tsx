import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import type { RunStatus, TaskStatus } from "../api/types";
import { STATUS_LABEL, STATUS_SYMBOL } from "../fmt";
import { useLive } from "../store";

/** Modal dialog built on <dialog> (focus trap + Esc for free). */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  variant = "modal",
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  variant?: "modal" | "drawer";
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`dlg dlg-${variant}${wide ? " dlg-wide" : ""}`}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="dlg-inner">
          <header className="dlg-head">
            <h2>{title}</h2>
            <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </header>
          <div className="dlg-body">{children}</div>
          {footer && <footer className="dlg-foot">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`badge ts-${status}`}>
      <span aria-hidden="true" className="sym">
        {STATUS_SYMBOL[status]}
      </span>
      {STATUS_LABEL[status]}
    </span>
  );
}

const RUN_SYM: Record<RunStatus, string> = { running: "●", succeeded: "✓", failed: "✕", stopped: "■" };
export function RunStatusBadge({ status }: { status: RunStatus }) {
  return (
    <span className={`badge rs-${status}`}>
      <span aria-hidden="true" className="sym">
        {RUN_SYM[status]}
      </span>
      {status}
    </span>
  );
}

export function HealthBadge({ health }: { health: string }) {
  const h = health.toLowerCase();
  const kind = h.startsWith("green") ? "good" : h.startsWith("yellow") || h.startsWith("amber") ? "warning" : h.startsWith("red") ? "critical" : "unknown";
  const sym = { good: "●", warning: "▲", critical: "■", unknown: "?" }[kind];
  return (
    <span className={`badge health-${kind}`}>
      <span aria-hidden="true" className="sym">
        {sym}
      </span>
      {health || "unknown"}
    </span>
  );
}

export function KindBadge({ kind }: { kind?: string }) {
  if (!kind) return null;
  const icon: Record<string, string> = { software: "</>", prototype: "⚙", investigation: "?", design: "✎", general: "▤" };
  return (
    <span className="badge badge-kind" title={`${kind} project`}>
      <span aria-hidden="true" className="sym">
        {icon[kind] ?? "◆"}
      </span>
      {kind}
    </span>
  );
}

export function Progress({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="progress-text">
        {pct}% <span className="muted">({value}/{max} weight)</span>
      </span>
    </div>
  );
}

export function Markdown({ source, empty = "Nothing here yet." }: { source: string; empty?: string }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(source ?? "", { async: false }) as string), [source]);
  if (!source?.trim()) return <p className="muted">{empty}</p>;
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children}
    </div>
  );
}

export function Toasts() {
  const { toasts, dismissToast } = useLive();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <span aria-hidden="true" className="sym">
            {t.kind === "success" ? "✓" : t.kind === "error" ? "✕" : "i"}
          </span>
          <span className="toast-text">{t.text}</span>
          {t.href && (
            <button
              className="btn btn-sm"
              onClick={() => {
                window.location.hash = t.href!.replace(/^#/, "");
                dismissToast(t.id);
              }}
            >
              Open
            </button>
          )}
          <button className="btn btn-ghost btn-icon" onClick={() => dismissToast(t.id)} aria-label="Dismiss notification">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

export function Field({ label, children, hint, span }: { label: string; children: ReactNode; hint?: ReactNode; span?: boolean }) {
  return (
    <label className={`field${span ? " span-2" : ""}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Tabs<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { id: T; label: string }[]; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((it) => (
        <button key={it.id} role="tab" aria-selected={value === it.id} className={`tab${value === it.id ? " on" : ""}`} onClick={() => onChange(it.id)}>
          {it.label}
        </button>
      ))}
    </div>
  );
}
