"use client";

import type { ReactNode } from "react";
import { useFormAction } from "./use-form-action";

export type Problem = { error?: string };

/** A form whose action can say what went wrong: its answer is shown under the form, in words. */
export function ActionForm({
  action,
  className,
  children,
}: {
  action: (prev: Problem, form: FormData) => Promise<Problem>;
  className?: string;
  children: ReactNode;
}) {
  const [state, onSubmit] = useFormAction(action, {});
  return (
    <form onSubmit={onSubmit} className={className}>
      {children}
      {state.error ? (
        <p role="alert" className="text-sm text-problem">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
