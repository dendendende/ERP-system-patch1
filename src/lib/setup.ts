// First-time setup guide (P6-T4): the steps, in order, and whether each is done.
// A step is done when the data shows it (e.g. a bank account exists) or the owner marked it.

export type SetupFacts = {
  bankAccounts: number;
  transactions: number;
  needsLabel: number;
  labelledByPeople: number;
  activeSubscriptions: number;
  regularCosts: number;
  teamMembers: number;
};

export type StepId =
  "bank" | "money" | "labels" | "customers" | "regular_costs" | "reminders" | "team";

export type SetupStep = {
  id: StepId;
  title: string;
  why: string;
  href: string;
  /** Button text for marking it by hand: "Skip for now" when the data can tick it off. */
  markLabel: string;
  doneByData: (f: SetupFacts) => boolean;
};

export const SETUP_STEPS: SetupStep[] = [
  {
    id: "bank",
    title: "Add your bank account",
    why: "Tell the app which account the money goes through. It only reads; it can never move money.",
    href: "/settings/bank",
    markLabel: "Skip for now",
    doneByData: (f) => f.bankAccounts > 0,
  },
  {
    id: "money",
    title: "Bring in your transactions",
    why: "Connect the bank, or upload a statement file from internet banking.",
    href: "/money/import",
    markLabel: "Skip for now",
    doneByData: (f) => f.transactions > 0,
  },
  {
    id: "labels",
    title: "Label your first transactions",
    why: "Say what a few payments were for. Each label can become a rule, so the next ones label themselves.",
    href: "/money",
    markLabel: "Skip for now",
    doneByData: (f) => f.transactions > 0 && (f.needsLabel === 0 || f.labelledByPeople >= 10),
  },
  {
    id: "customers",
    title: "Add customers and what they pay",
    why: "Add each customer and their subscription. Bills are then written on time by themselves.",
    href: "/customers",
    markLabel: "Skip for now",
    doneByData: (f) => f.activeSubscriptions > 0,
  },
  {
    id: "regular_costs",
    title: "Check your regular costs",
    why: "Rent, salaries, software: the app spots payments that repeat. Confirm the real ones so the forecast knows them.",
    href: "/money/regular-costs",
    markLabel: "None to add",
    doneByData: (f) => f.regularCosts > 0,
  },
  {
    id: "reminders",
    title: "Choose when customers are reminded",
    why: "How many days before and after the due date a reminder is due. The usual schedule is already set.",
    href: "/settings/reminders",
    markLabel: "Looks good",
    doneByData: () => false,
  },
  {
    id: "team",
    title: "Invite your team",
    why: "Add the people who help with money, and choose what each of them can do.",
    href: "/settings/team",
    markLabel: "Just me for now",
    doneByData: (f) => f.teamMembers > 1,
  },
];

export function setupProgress(facts: SetupFacts, marked: ReadonlySet<string>) {
  const steps = SETUP_STEPS.map((s) => ({ ...s, done: s.doneByData(facts) || marked.has(s.id) }));
  const doneCount = steps.filter((s) => s.done).length;
  return {
    steps,
    doneCount,
    total: steps.length,
    next: steps.find((s) => !s.done) ?? null,
  };
}
