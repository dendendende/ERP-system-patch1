import { SidebarNav, TabBar } from "@/components/nav";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../login/actions";

const ROLE_LABEL = { owner: "Owner", operator: "Operator", viewer: "Viewer" } as const;

// Placeholder until bank sync exists (P1-T10 fills this in).
function SyncStatus() {
  return (
    <p className="flex items-center gap-2 text-xs text-muted">
      <span aria-hidden className="size-1.5 rounded-full bg-line" />
      Bank not connected yet
    </p>
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
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-6 border-r border-line px-3 py-5 md:flex">
        <p className="px-3 font-display text-xl">Cashflow</p>
        <SidebarNav />
        <div className="mt-auto flex flex-col gap-4 px-3">
          <SyncStatus />
          <div className="flex items-center justify-between gap-2 border-t border-line pt-4">
            <div className="min-w-0 text-sm">
              <p className="truncate font-medium">{me?.name || user?.email}</p>
              {me ? <p className="text-xs text-muted">{ROLE_LABEL[me.role]}</p> : null}
            </div>
            <form action={signOut}>
              <button
                type="submit"
                className="text-xs text-muted underline-offset-4 hover:text-ink hover:underline"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>

      <header className="flex items-center justify-between border-b border-line px-4 py-3 md:hidden">
        <p className="font-display text-lg">Cashflow</p>
        <SyncStatus />
      </header>

      <main className="min-w-0 flex-1 px-4 pt-6 pb-24 md:px-10 md:pt-10 md:pb-10">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>

      <TabBar />
    </div>
  );
}
