"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

export function CopyText({ text, label = "Copy the summary" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      className="self-start"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}
