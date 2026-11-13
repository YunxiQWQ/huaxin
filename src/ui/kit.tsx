import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { X } from "lucide-react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type BtnVariant = "primary" | "default" | "ghost" | "danger" | "subtle";
export function Button({
  variant = "default",
  size = "md",
  className,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      type="button"
      {...p}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors disabled:opacity-45 disabled:pointer-events-none select-none",
        size === "sm" && "h-7 px-2.5 text-[12px]",
        size === "md" && "h-8 px-3 text-[13px]",
        size === "lg" && "h-10 px-4 text-[14px]",
        variant === "primary" && "bg-accent text-white hover:bg-[#244bb0] shadow-sm",
        variant === "default" && "bg-white text-ink border border-line-2 hover:bg-shell",
        variant === "ghost" && "text-ink-2 hover:bg-black/5",
        variant === "subtle" && "bg-black/[.04] text-ink hover:bg-black/[.08]",
        variant === "danger" && "bg-danger text-white hover:bg-[#a52e25]",
        className,
      )}
    />
  );
}

export function IconBtn({
  active,
  className,
  label,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...p}
      className={cx(
        "inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1 text-ink-2 transition-colors hover:bg-black/[.06] disabled:opacity-35 disabled:pointer-events-none",
        active && "bg-accent-soft text-accent hover:bg-accent-soft",
        className,
      )}
    />
  );
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("text-[11px] text-mute mb-1", className)}>{children}</div>;
}

/** Numeric field that commits on blur / Enter and supports arrow keys. */
export function NumberField({
  value,
  onChange,
  step = 1,
  min,
  max,
  suffix,
  prefix,
  className,
  precision = 1,
  disabled,
  title,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
  precision?: number;
  disabled?: boolean;
  title?: string;
}) {
  const fmt = (v: number) =>
    Number.isFinite(v) ? String(Math.round(v * 10 ** precision) / 10 ** precision) : "";
  const [text, setText] = useState(fmt(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(fmt(value));
  }, [value]);
  const commit = (raw: string) => {
    const n = Number(raw.replace(/[^\d.\-]/g, ""));
    if (!Number.isFinite(n) || raw.trim() === "") {
      setText(fmt(value));
      return;
    }
    let v = n;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    onChange(v);
    setText(fmt(v));
  };
  return (
    <label
      title={title}
      className={cx(
        "flex h-7 items-center rounded-md border border-line bg-white px-1.5 text-[12px] focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15",
        disabled && "opacity-50",
        className,
      )}
    >
      {prefix && <span className="mr-1 shrink-0 text-mute">{prefix}</span>}
      <input
        className="w-full min-w-0 bg-transparent outline-none tabular-nums"
        value={text}
        disabled={disabled}
        inputMode="decimal"
        onFocus={(e) => {
          focused.current = true;
          e.target.select();
        }}
        onBlur={(e) => {
          focused.current = false;
          commit(e.target.value);
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const d = (e.key === "ArrowUp" ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
            let v = value + d;
            if (min !== undefined) v = Math.max(min, v);
            if (max !== undefined) v = Math.min(max, v);
            v = Math.round(v * 1000) / 1000;
            onChange(v);
            setText(fmt(v));
          }
          if (e.key === "Escape") (e.target as HTMLInputElement).blur();
        }}
      />
      {suffix && <span className="ml-1 shrink-0 text-mute">{suffix}</span>}
    </label>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  className,
  title,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
  title?: string;
}) {
  return (
    <select
      title={title}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={cx(
        "h-7 rounded-md border border-line bg-white px-1.5 text-[12px] outline-none focus:border-accent",
        className,
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function ColorField({
  value,
  onChange,
  allowNone,
  className,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  allowNone?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(value ?? "");
  useEffect(() => setText(value ?? ""), [value]);
  return (
    <div
      className={cx(
        "flex h-7 items-center gap-1.5 rounded-md border border-line bg-white px-1",
        className,
      )}
    >
      <label
        className="relative h-5 w-5 shrink-0 overflow-hidden rounded border border-black/10"
        style={{
          background: value ?? "repeating-conic-gradient(#ddd 0 25%, #fff 0 50%) 0 0/8px 8px",
        }}
      >
        <input
          type="color"
          className="absolute inset-0 cursor-pointer opacity-0"
          value={value ?? "#ffffff"}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
      <input
        className="w-full min-w-0 bg-transparent text-[12px] uppercase outline-none"
        value={text}
        placeholder={allowNone ? "无" : ""}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const t = text.trim();
          if (!t && allowNone) return onChange(null);
          const v = t.startsWith("#") ? t : `#${t}`;
          if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v.toLowerCase());
          else setText(value ?? "");
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      {allowNone && value && (
        <button className="text-mute hover:text-ink" title="无填充" onClick={() => onChange(null)}>
          <X size={12} />
        </button>
      )}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-[12px] text-ink-2 select-none">
      <span
        className={cx(
          "relative h-4 w-7 rounded-full transition-colors",
          checked ? "bg-accent" : "bg-line-2",
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all",
            checked ? "left-3.5" : "left-0.5",
          )}
        />
      </span>
      <input
        type="checkbox"
        className="hidden"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; title?: string }[];
  className?: string;
}) {
  return (
    <div className={cx("flex h-7 rounded-md bg-black/[.05] p-0.5", className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            "flex flex-1 items-center justify-center rounded-[5px] px-1.5 text-[12px] transition-colors",
            value === o.value ? "bg-white text-ink shadow-sm" : "text-ink-2 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 520,
  footer,
  closable = true,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  width?: number;
  footer?: ReactNode;
  closable?: boolean;
}) {
  useEffect(() => {
    if (!open || !closable) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose, closable]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#16171a]/40 p-6"
      onMouseDown={(e) => e.target === e.currentTarget && closable && onClose()}
    >
      <div
        className="bx-pop flex max-h-full flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        style={{ width }}
        role="dialog"
        aria-modal
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-5">
          <div className="text-[15px] font-semibold">{title}</div>
          {closable && (
            <IconBtn label="关闭" onClick={onClose}>
              <X size={16} />
            </IconBtn>
          )}
        </div>
        <div className="bx-scroll min-h-0 flex-1 overflow-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-shell/60 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Menu({
  trigger,
  children,
  align = "right",
}: {
  trigger: (open: boolean, toggle: () => void) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {trigger(open, () => setOpen((o) => !o))}
      {open && (
        <div
          className={cx(
            "bx-pop absolute top-full z-40 mt-1 min-w-44 rounded-lg border border-line bg-white p-1 shadow-xl",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  onClick,
  danger,
  hint,
  disabled,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-shell disabled:opacity-40",
        danger ? "text-danger" : "text-ink",
      )}
    >
      <span className="flex w-4 justify-center text-ink-2">{icon}</span>
      <span className="flex-1">{children}</span>
      {hint && <span className="text-[11px] text-mute">{hint}</span>}
    </button>
  );
}

export function Section({
  title,
  children,
  right,
  className,
}: {
  title?: ReactNode;
  children: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("border-b border-line px-3.5 py-3", className)}>
      {title && (
        <div className="mb-2.5 flex items-center justify-between">
          <div className="text-[12px] font-semibold text-ink">{title}</div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/[.07]">
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-200"
        style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }}
      />
    </div>
  );
}

export function formatTime(t: number) {
  const d = new Date(t);
  const now = new Date();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (d.toDateString() === now.toDateString()) return `今天 ${hm}`;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `昨天 ${hm}`;
  return `${d.getFullYear() === now.getFullYear() ? "" : d.getFullYear() + "年"}${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
