import { AuthCard } from "../auth-card";
import { Enroll } from "./enroll";

export const metadata = { title: "Set up 2-step sign-in · Cashflow" };

export default function EnrollPage() {
  return (
    <AuthCard
      title="Protect your account"
      intro="This app handles your company's money, so every sign-in needs a code from your phone. Scan the picture with an authenticator app (Google Authenticator, 1Password, Authy)."
    >
      <Enroll />
    </AuthCard>
  );
}
