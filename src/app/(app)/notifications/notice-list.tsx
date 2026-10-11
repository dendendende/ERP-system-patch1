"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, StatusPill } from "@/components/ui";
import type { Notice } from "@/lib/notifications";
import { markNotificationsSeen } from "./actions";

const when = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jakarta",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const DOT = { problem: "bg-problem", attention: "bg-attention" } as const;

/**
 * The list, marked seen once it's on screen. Which ones were new is kept from the first look:
 * marking them seen refreshes the page, and "New" must stay while they're being read.
 */
export function NoticeList({ notices }: { notices: Notice[] }) {
  const [fresh] = useState(() => new Set(notices.filter((n) => n.isNew).map((n) => n.key)));
  useEffect(() => {
    markNotificationsSeen().then(() => window.dispatchEvent(new Event("notifications-seen")));
  }, []);

  return (
    <Card className="p-0">
      <ul aria-label="Notifications">
        {notices.map((n) => (
          <li key={n.key} className="border-b border-line last:border-b-0">
            <Link
              href={n.href}
              className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-ground"
            >
              <span aria-hidden className={`mt-2 size-2 shrink-0 rounded-full ${DOT[n.tone]}`} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-medium">{n.title}</span>
                {n.detail ? <span className="text-sm text-muted">{n.detail}</span> : null}
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted tabular-nums">
                {n.at ? when.format(new Date(n.at)) : "Now"}
                {fresh.has(n.key) || (n.isNew && !n.at) ? (
                  <StatusPill tone="attention">New</StatusPill>
                ) : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
