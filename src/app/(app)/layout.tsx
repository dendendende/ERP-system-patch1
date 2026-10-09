import Link from "next/link";
import { CommandPalette } from "@/components/command-palette";
import { Logo, SidebarNav, TabBar } from "@/components/nav";
import { jumpsFor } from "@/lib/command-palette";
import { currentSyncState } from "@/lib/bank/current-sync";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../login/actions";

const ROLE_LABEL = { owner: "Owner", operator: "Operator", viewer: "Viewer" } as const;

const DOT = { neutral: "bg-line", in: "bg-in", attention: "bg-attention" } as const;

async function SyncStatus({ onDark = false }: { onDark?: boolean }) {
  const state = await currentSyncState();
  const colour = onDark
    ? state.stale
      ? "text-attention-bg"
      : "text-nav-ink"
    : state.stale
      ? "text-attention-ink"
      : "text-muted";
  return (
    <Link
      href="/settings/bank"
      className={`flex items-center gap-2 text-xs hover:underline underline-offset-4 ${colour}`}
    >
      <span aria-hidden className={`size-1.5 rounded-full ${DOT[state.tone]}`} />
      {state.message}
    </Link>
  );
}

function SearchIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = user
    ? await supabase.from("users").select("name, role").eq("id", user.id).single()
    : { data: null };

  return (
    <div className="min-h-screen md:flex">
      <a
        href="#main"
        className="sr-only rounded-lg bg-brand px-4 py-2 text-sm text-surface focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
      >
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-7 bg-nav px-3 py-5 text-nav-ink md:flex">
        <p className="flex items-center gap-2.5 px-3 text-lg font-semibold tracking-tight text-white">
          <Logo className="size-7" />
          Cashflow
        </p>
        <button
          type="button"
          data-open-palette
          className="-mt-3 flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-left text-sm text-nav-ink transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <SearchIcon />
          <span className="flex-1">Find or jump to</span>
          <kbd className="rounded border border-white/15 px-1 text-[11px]">Ctrl K</kbd>
        </button>
        <SidebarNav />
        <div className="mt-auto flex flex-col gap-4 px-3">
          <SyncStatus onDark />
          <div className="flex items-center gap-3 border-t border-white/10 pt-4">
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-xs font-semibold text-white"
            >
              {(me?.name || user?.email || "?").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="truncate font-medium text-white">{me?.name || user?.email}</p>
              {me ? <p className="text-xs">{ROLE_LABEL[me.role]}</p> : null}
            </div>
            <form action={signOut}>
              <button
                type="submit"
                className="text-xs underline-offset-4 hover:text-white hover:underline"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>

      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 md:hidden">
        <p className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Logo className="size-6" />
          Cashflow
        </p>
        <div className="flex items-center gap-3">
          <SyncStatus />
          <button
            type="button"
            data-open-palette
            aria-label="Find or jump to"
            className="grid size-9 place-items-center rounded-lg text-muted hover:bg-ground hover:text-ink"
          >
            <SearchIcon />
          </button>
        </div>
      </header>

      <main
        id="main"
        tabIndex={-1}
        className="min-w-0 flex-1 px-4 pt-6 pb-24 md:px-10 md:pt-10 md:pb-10"
      >
        {/* a list page with its side panel open gets the room for both (AnalyticalListPage) */}
        <div className="rise mx-auto max-w-5xl has-[[data-panel-open]]:xl:max-w-7xl">
          {children}
        </div>
      </main>

      <TabBar />
      <CommandPalette jumps={jumpsFor(me?.role)} />
    </div>
  );
}
