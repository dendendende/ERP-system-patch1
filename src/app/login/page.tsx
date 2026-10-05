import { AuthCard } from "./auth-card";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · Cashflow" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { reason } = await searchParams;
  return (
    <AuthCard
      title="Sign in"
      intro={
        reason === "timeout"
          ? "You were signed out after a while without activity."
          : reason === "link"
            ? "That link has expired or was already used. Ask the owner for a new one."
            : reason === "too-many"
              ? "Too many tries. Wait 15 minutes and try again."
              : undefined
      }
    >
      <LoginForm />
    </AuthCard>
  );
}
