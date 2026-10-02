// The account customers pay into. Read from configuration ONLY — never from the database, a
// form or a message — so nobody can change where money goes by editing a reminder.

export type CompanyAccount = {
  companyName: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
};

const ENV_NAMES: Record<keyof CompanyAccount, string> = {
  companyName: "COMPANY_NAME",
  bankName: "COMPANY_BANK_NAME",
  accountNumber: "COMPANY_ACCOUNT_NUMBER",
  accountHolder: "COMPANY_ACCOUNT_HOLDER",
};

/** Throws when anything is missing: a reminder without the fixed account must never go out. */
export function companyAccount(env: Record<string, string | undefined> = process.env): CompanyAccount {
  const read = (key: keyof CompanyAccount) => env[ENV_NAMES[key]]?.trim() ?? "";
  const account: CompanyAccount = {
    companyName: read("companyName"),
    bankName: read("bankName"),
    accountNumber: read("accountNumber"),
    accountHolder: read("accountHolder"),
  };
  const missing = (Object.keys(ENV_NAMES) as (keyof CompanyAccount)[])
    .filter((key) => !account[key])
    .map((key) => ENV_NAMES[key]);
  if (missing.length) throw new Error(`Company account not configured: ${missing.join(", ")}`);
  if (!/^[0-9]{6,20}$/.test(account.accountNumber))
    throw new Error("COMPANY_ACCOUNT_NUMBER must be digits only");
  return account;
}
