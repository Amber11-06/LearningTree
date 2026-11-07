import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, Sprout, X } from "lucide-react";
import { statusLabels, topicStatus, type Data, type Topic } from "./domain";

export function Modal({
  title,
  children,
  onClose,
  wide = false,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [error, setError] = useState("");
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  useEffect(() => {
    const handler = (event: Event) =>
      setError((event as CustomEvent<string>).detail);
    const clearError = () => setError("");
    window.addEventListener("learningtree:error", handler);
    window.addEventListener("learningtree:saved", clearError);
    return () => {
      window.removeEventListener("learningtree:error", handler);
      window.removeEventListener("learningtree:saved", clearError);
    };
  }, []);
  return (
    <dialog
      className={`modal ${wide ? "wide" : ""}`}
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (
          !busy &&
          e.target === e.currentTarget &&
          (e.clientX < e.currentTarget.getBoundingClientRect().left ||
            e.clientX > e.currentTarget.getBoundingClientRect().right ||
            e.clientY < e.currentTarget.getBoundingClientRect().top ||
            e.clientY > e.currentTarget.getBoundingClientRect().bottom)
        )
          onClose();
      }}
    >
      <div className="modal-head">
        <h2 id={titleId}>{title}</h2>
        {busy && (
          <span className="modal-saving" role="status">
            正在保存…
          </span>
        )}
        <button
          className="icon-button"
          aria-label="关闭弹窗"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {error && (
        <p role="alert" className="form-error modal-error">
          {error}
        </p>
      )}
      {children}
    </dialog>
  );
}
export function Empty({
  title,
  children,
  action,
  onAction,
}: {
  title: string;
  children?: ReactNode;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Sprout size={32} />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && (
        <button className="button primary" onClick={onAction}>
          {action}
          <ArrowUpRight size={16} />
        </button>
      )}
    </div>
  );
}
export function Status({ data, node }: { data: Data; node: Topic }) {
  const status = topicStatus(data, node.id);
  return (
    <span className={`status ${status}`}>
      <i />
      {statusLabels[status]}
    </span>
  );
}
export const dateText = (date: string | Date, time = false) =>
  new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    ...(time ? ({ hour: "2-digit", minute: "2-digit" } as const) : {}),
  }).format(new Date(date));
export function dueText(date: string | Date, now = new Date()) {
  const ms = new Date(date).getTime() - now.getTime();
  if (ms <= 0) return "现在";
  if (ms < 3600000) return `${Math.max(1, Math.round(ms / 60000))} 分钟后`;
  if (ms < 86400000) return `${Math.round(ms / 3600000)} 小时后`;
  return `${Math.max(1, Math.round(ms / 86400000))} 天后`;
}
export { SkillTree as TreeGraph } from "./SkillTree";
