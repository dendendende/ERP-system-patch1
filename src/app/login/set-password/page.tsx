import { AuthCard } from "../auth-card";
import { SetPasswordForm } from "./set-password-form";

export const metadata = { title: "Choose a password · Cashflow" };

export default function SetPasswordPage() {
  return (
    <AuthCard
      title="Choose a password"
      intro="At least 12 characters, with lower and upper case letters and a number."
    >
      <SetPasswordForm />
    </AuthCard>
  );
}
