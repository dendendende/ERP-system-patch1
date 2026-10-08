import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("quotes what needs quoting and keeps numbers as numbers", () => {
    const csv = toCsv(
      ["Description", "Amount"],
      [
        ['PT "Maju", Jaya', -1_500_000n],
        ["Line\nbreak", 0],
        [null, undefined],
      ],
    );
    expect(csv).toBe(
      '\uFEFFDescription,Amount\r\n"PT ""Maju"", Jaya",-1500000\r\n"Line\nbreak",0\r\n,\r\n',
    );
  });

  it("a description that looks like a formula can't run in a spreadsheet", () => {
    const csv = toCsv(["d"], [['=HYPERLINK("http://x")'], ["+1"], ["-2"], ["@SUM(A1)"], ["ok"]]);
    expect(csv.split("\r\n").slice(1, 6)).toEqual([
      '"\'=HYPERLINK(""http://x"")"',
      "'+1",
      "'-2",
      "'@SUM(A1)",
      "ok",
    ]);
  });
});
