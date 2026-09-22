import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../actions";
import { AuthCard } from "../auth-card";
import { CodeForm } from "../code-form";

export const metadata = { title: "Enter code · Cashflow" };

export default async function VerifyPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.listFactors();
  const factor = data?.totp[0];
  if (!factor) redirect("/login/enroll");

  return (
    <AuthCard
      title="Enter your code"
      intro="Open your authenticator app and type the 6-digit code."
    >
      <CodeForm factorId={factor.id} submitLabel="Continue" />
      <form action={signOut}>
        <button type="submit" className="text-sm text-muted underline-offset-4 hover:underline">
          Use a different account
        </button>
      </form>
    </AuthCard>
  );
}
