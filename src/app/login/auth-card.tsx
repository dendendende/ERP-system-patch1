import type { ReactNode } from "react";
import { Card } from "@/components/ui";

export function AuthCard({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="flex w-full max-w-sm flex-col gap-5 p-6">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted">Cashflow</p>
          <h1 className="font-display text-3xl">{title}</h1>
          {intro ? <p className="text-sm text-muted">{intro}</p> : null}
        </div>
        {children}
      </Card>
    </main>
  );
}
