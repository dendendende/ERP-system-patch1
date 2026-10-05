import { AuthCard } from "@/app/login/auth-card";
import { Button } from "@/components/ui";
import { confirmLink } from "./actions";

export const metadata = { title: "Join the team · Cashflow" };

// The link the owner sends opens this page; the one-time code is only used when the person
// presses Continue. Opening it with a plain GET would let chat apps that preview links
// (WhatsApp, Slack) use up the code before the person ever sees it.
export default async function ConfirmPage({ searchParams }: PageProps<"/auth/confirm">) {
  const { token_hash, type } = await searchParams;
  return (
    <AuthCard
      title="Welcome"
      intro="You've been added to the team. Continue to choose your password and set up 2-step sign-in."
    >
      <form action={confirmLink} className="flex flex-col gap-4">
        <input type="hidden" name="token_hash" value={String(token_hash ?? "")} />
        <input type="hidden" name="type" value={String(type ?? "")} />
        <Button type="submit">Continue</Button>
      </form>
    </AuthCard>
  );
}
