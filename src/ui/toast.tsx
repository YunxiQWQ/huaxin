import { useSyncExternalStore } from "react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { cx } from "./kit";

export interface Toast {
  id: number;
  kind: "ok" | "error" | "info" | "warn";
  text: string;
  action?: { label: string; run: () => void };
}
let toasts: Toast[] = [];
let seq = 0;
const ls = new Set<() => void>();
const emit = () => ls.forEach((l) => l());

export function toast(
  kind: Toast["kind"],
  text: string,
  opts: { action?: Toast["action"]; ms?: number } = {},
) {
  const t: Toast = { id: ++seq, kind, text, action: opts.action };
  toasts = [...toasts, t].slice(-4);
  emit();
  const ms = opts.ms ?? (kind === "error" ? 9000 : 3800);
  if (ms > 0) setTimeout(() => dismiss(t.id), ms);
}
export function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function Toaster() {
  const list = useSyncExternalStore(
    (l) => {
      ls.add(l);
      return () => ls.delete(l);
    },
    () => toasts,
  );
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
      {list.map((t) => (
        <div
          key={t.id}
          className="bx-pop pointer-events-auto flex max-w-[560px] items-start gap-2.5 rounded-lg bg-[#1d1e22] px-3.5 py-2.5 text-[13px] text-white shadow-xl"
          role="status"
        >
          <span
            className={cx(
              "mt-0.5",
              t.kind === "ok" && "text-[#7bd59c]",
              t.kind === "error" && "text-[#ff8f86]",
              t.kind === "warn" && "text-[#f5c26b]",
              t.kind === "info" && "text-[#9db7f5]",
            )}
          >
            {t.kind === "ok" ? (
              <CircleCheck size={16} />
            ) : t.kind === "info" ? (
              <Info size={16} />
            ) : (
              <CircleAlert size={16} />
            )}
          </span>
          <span className="leading-relaxed">{t.text}</span>
          {t.action && (
            <button
              className="ml-1 shrink-0 font-medium text-[#9db7f5] hover:underline"
              onClick={() => {
                t.action!.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button
            className="ml-1 shrink-0 text-white/50 hover:text-white"
            onClick={() => dismiss(t.id)}
            aria-label="关闭"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
