import { describe, expect, it } from "vitest";
import { payeeFromDescription } from "./payee";

describe("payeeFromDescription", () => {
  it.each([
    ["TRSF E-BANKING CR 0920/FTSCY/WS93436 PT MAJU JAYA", "PT MAJU JAYA"],
    ["TRSF E-BANKING CR 0919/FTSCY/WS95501 TOKO BERKAH", "TOKO BERKAH"],
    ["AMAZON WEB SERVICES AWS.AMAZON.CO", "AMAZON WEB SERVICES AWS.AMAZON.CO"],
    ["TRF KE PAYROLL GAJI KARYAWAN", "PAYROLL GAJI KARYAWAN"],
    ["SEWA KANTOR GEDUNG MENARA", "SEWA KANTOR GEDUNG MENARA"],
    ["QRIS TOKO ATK SEJAHTERA", "TOKO ATK SEJAHTERA"],
    ["BIAYA ADM", "BIAYA ADM"],
  ])("%s → %s", (description, expected) => {
    expect(payeeFromDescription(description)).toBe(expected);
  });

  it("is stable when only the reference numbers change", () => {
    const a = payeeFromDescription("TRSF E-BANKING CR 0920/FTSCY/WS93436 PT MAJU JAYA");
    const b = payeeFromDescription("TRSF E-BANKING CR 1015/FTSCY/WS11122 PT MAJU JAYA");
    expect(a).toBe(b);
  });

  it("returns nothing when there is no name to key on", () => {
    expect(payeeFromDescription("0920/FTSCY/WS93436")).toBe("");
    expect(payeeFromDescription("")).toBe("");
    expect(payeeFromDescription("TRSF CR 12345")).toBe("");
  });
});
