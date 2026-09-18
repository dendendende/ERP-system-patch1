import type { ReactNode } from "react";
import { EmptyState } from "@/components/ui";

/** Heading + "coming soon" box for pages that later phases fill in. */
export function PageStub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl md:text-4xl">{title}</h1>
      <EmptyState title="Nothing here yet">{children}</EmptyState>
    </div>
  );
}
