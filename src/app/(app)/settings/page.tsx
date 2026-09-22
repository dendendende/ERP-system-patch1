import Link from "next/link";
import { Card } from "@/components/ui";

export const metadata = { title: "Settings · Cashflow" };

const SECTIONS = [
  [
    "Bank connections",
    "/settings/bank",
    "Where your money data comes from, and whether it is up to date.",
  ],
  [
    "Categories & rules",
    "/settings/categories",
    "What your money is filed under, and the rules that label it automatically. Owner only.",
  ],
] as const;

export default function SettingsPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="font-display text-3xl md:text-4xl">Settings</h1>
      <Card className="p-0">
        {SECTIONS.map(([title, href, description]) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col gap-0.5 border-b border-line px-5 py-4 transition-colors last:border-b-0 hover:bg-ground/60"
          >
            <span className="font-medium">{title}</span>
            <span className="text-sm text-muted">{description}</span>
          </Link>
        ))}
      </Card>
      <p className="text-sm text-muted">
        Categories and rules, reminders, team and roles arrive in later phases.
      </p>
    </div>
  );
}
