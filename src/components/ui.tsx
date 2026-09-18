import type { ComponentProps, ReactNode } from "react";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-ink text-surface hover:bg-ink/85",
  secondary: "bg-surface text-ink border border-line hover:bg-ground",
  ghost: "text-ink hover:bg-line/60",
  danger: "bg-problem text-surface hover:bg-problem/85",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cx(
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium",
        "transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        focusRing,
        buttonVariants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cx("rounded-xl border border-line bg-surface p-5", className)} {...props} />
  );
}

export type Tone = "neutral" | "in" | "attention" | "problem";
const tones: Record<Tone, string> = {
  neutral: "bg-ground text-muted border-line",
  in: "bg-in/10 text-in border-in/20",
  attention: "bg-attention-bg text-attention-ink border-attention/30",
  problem: "bg-problem/10 text-problem border-problem/20",
};

/** Small status label, e.g. "Paid", "Due today", "Overdue". */
export function StatusPill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

export function Input({
  label,
  hint,
  error,
  id,
  className,
  ...props
}: ComponentProps<"input"> & { label: string; hint?: string; error?: string }) {
  const inputId = id ?? props.name;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cx(
          "h-10 rounded-lg border bg-surface px-3 text-sm transition-colors placeholder:text-muted/70",
          error ? "border-problem" : "border-line hover:border-muted/50",
          focusRing,
          className,
        )}
        {...props}
      />
      {error ? (
        <p id={`${inputId}-error`} className="text-sm text-problem">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Checkbox({
  label,
  className,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { label: ReactNode }) {
  return (
    <label className={cx("inline-flex cursor-pointer items-center gap-2 text-sm", className)}>
      <input type="checkbox" className={cx("size-4 accent-ink", focusRing)} {...props} />
      {label}
    </label>
  );
}

/** Row of a money list. The amount column uses tabular numbers so digits line up. */
export function TableRow({
  primary,
  secondary,
  meta,
  amount,
}: {
  primary: ReactNode;
  secondary?: ReactNode;
  meta?: ReactNode;
  amount: ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-line px-4 py-3 transition-colors last:border-b-0 hover:bg-ground/60">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{primary}</div>
        {secondary ? <div className="truncate text-sm text-muted">{secondary}</div> : null}
      </div>
      {meta ? <div className="shrink-0">{meta}</div> : null}
      <div className="shrink-0 text-right text-sm tabular-nums">{amount}</div>
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line px-6 py-12 text-center">
      <p className="font-display text-xl">{title}</p>
      {children ? <p className="max-w-sm text-sm text-muted">{children}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
