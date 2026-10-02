"use client";

import { type FormEvent, startTransition, useActionState } from "react";

/**
 * useActionState for a form, without React 19's automatic reset: `<form action={…}>` clears
 * every field once the action finishes — even when it answers "that amount isn't valid" — so
 * people lost what they typed. Submitting through onSubmit keeps their input.
 * Use as: const [state, onSubmit, pending] = useFormAction(action, {}); <form onSubmit={onSubmit}>
 */
export function useFormAction<S>(fn: (prev: S, form: FormData) => Promise<S>, initial: Awaited<S>) {
  const [state, dispatch, pending] = useActionState<S, FormData>(fn, initial);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // the clicked button's name/value is part of the form (e.g. "Mark as sent" vs "Skip")
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const data = new FormData(e.currentTarget, submitter);
    startTransition(() => dispatch(data));
  };
  return [state, onSubmit, pending] as const;
}
