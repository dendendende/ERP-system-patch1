"use client";

import { useEffect } from "react";
import { Button, EmptyState } from "@/components/ui";

// Any page that fails to load. Says what happened in plain words, and that nothing was lost.
export default function PageError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <EmptyState
      title="This page didn't load"
      action={
        <Button type="button" variant="secondary" onClick={() => retry()}>
          Try again
        </Button>
      }
    >
      Something went wrong on our side. Nothing you saved was lost. Try again, and if it keeps
      happening, tell the owner{error.digest ? ` (reference ${error.digest})` : ""}.
    </EmptyState>
  );
}
