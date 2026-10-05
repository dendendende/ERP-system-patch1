import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// P6-T3: the service-role key (bypasses every database rule) must never reach a browser.
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
  );
const source = files("src").map((path) => ({ path, text: readFileSync(path, "utf8") }));

describe("service-role key stays on the server", () => {
  it("the admin client is server-only (the build fails if a browser bundle imports it)", () => {
    expect(readFileSync("src/lib/supabase/admin.ts", "utf8")).toMatch(/^import "server-only";/);
  });

  it("no browser component imports the admin client", () => {
    const offenders = source
      .filter((f) => /^["']use client["']/.test(f.text) && f.text.includes("supabase/admin"))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("no secret is given a NEXT_PUBLIC_ name (those are copied into the browser)", () => {
    const names = [...source.map((f) => f.text), readFileSync(".env.example", "utf8")]
      .join("\n")
      .match(/NEXT_PUBLIC_[A-Z_]+/g);
    expect(
      [...new Set(names)].filter((n) => /SERVICE|SECRET|PASSWORD|TOKEN|PRIVATE/.test(n)),
    ).toEqual([]);
  });
});
