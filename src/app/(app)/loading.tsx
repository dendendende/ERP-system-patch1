import { Skeleton } from "@/components/ui";

// Shown while a page's numbers load. Plain and still: no spinner.
export default function Loading() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-5 w-80 max-w-full" />
      <Skeleton className="h-40 rounded-xl" />
    </div>
  );
}
