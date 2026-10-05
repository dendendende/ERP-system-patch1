import type { Metadata } from "next";
import { connection } from "next/server";
import { Newsreader, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"] });
const schibsted = Schibsted_Grotesk({ variable: "--font-schibsted", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Cashflow",
  description: "Money in, money out, and who still owes you.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Every page is rendered per request: the CSP nonce (src/proxy.ts) only reaches pages built
  // at request time; a page built ahead of time would have its scripts blocked.
  await connection();
  return (
    <html lang="en" className={`${newsreader.variable} ${schibsted.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
